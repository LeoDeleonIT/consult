import { createServer } from "node:https";
import { request } from "node:http";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const certDir = resolve(root, ".certs");
const logDir = resolve(root, ".logs");
mkdirSync(logDir, { recursive: true });

const pfxPath = process.env.TRINITY_CONSULT_PFX_PATH ?? resolve(certDir, "trinity-consult-lan.pfx");
const passPath = process.env.TRINITY_CONSULT_PFX_PASS_PATH ?? resolve(certDir, "trinity-consult-lan.pass");
const listenHost = process.env.TRINITY_CONSULT_HTTPS_HOST ?? "0.0.0.0";
const listenPort = Number.parseInt(process.env.TRINITY_CONSULT_HTTPS_PORT ?? "3443", 10);
const targetHost = process.env.TRINITY_CONSULT_TARGET_HOST ?? "localhost";
const targetPort = Number.parseInt(process.env.TRINITY_CONSULT_TARGET_PORT ?? "3003", 10);

const accessLog = createWriteStream(resolve(logDir, "consult-https-access.log"), { flags: "a" });
const errorLog = createWriteStream(resolve(logDir, "consult-https-error.log"), { flags: "a" });

function log(stream, message) {
  stream.write(`${new Date().toISOString()} ${message}\n`);
}

function forwardedHeaders(clientRequest) {
  const originalHost = clientRequest.headers.host ?? `${targetHost}:${targetPort}`;
  return {
    ...clientRequest.headers,
    host: originalHost,
    "x-forwarded-host": originalHost,
    "x-forwarded-proto": "https",
  };
}

function formatHttpHeaders(headers) {
  return Object.entries(headers)
    .flatMap(([key, value]) => {
      if (value == null) return [];
      if (Array.isArray(value)) return value.map((item) => `${key}: ${item}`);
      return [`${key}: ${value}`];
    })
    .join("\r\n");
}

const server = createServer({
  pfx: readFileSync(pfxPath),
  passphrase: readFileSync(passPath, "utf8").trim(),
}, (clientRequest, clientResponse) => {
  const upstream = request({
    hostname: targetHost,
    port: targetPort,
    method: clientRequest.method,
    path: clientRequest.url,
    headers: forwardedHeaders(clientRequest),
  }, (upstreamResponse) => {
    clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(clientResponse);
  });

  upstream.on("error", (error) => {
    log(errorLog, `request error ${clientRequest.method} ${clientRequest.url}: ${error.message}`);
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    clientResponse.end("Trinity Consult local app is not reachable.");
  });

  clientRequest.pipe(upstream);
  log(accessLog, `${clientRequest.socket.remoteAddress ?? "-"} ${clientRequest.method} ${clientRequest.url}`);
});

server.on("upgrade", (clientRequest, clientSocket, head) => {
  const upstreamSocket = connect(targetPort, targetHost, () => {
    upstreamSocket.write(
      `${clientRequest.method} ${clientRequest.url} HTTP/${clientRequest.httpVersion}\r\n` +
      formatHttpHeaders(forwardedHeaders(clientRequest)) +
      "\r\n\r\n",
    );
    if (head.length > 0) upstreamSocket.write(head);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  upstreamSocket.on("error", (error) => {
    log(errorLog, `upgrade error ${clientRequest.url}: ${error.message}`);
    clientSocket.destroy();
  });
});

server.listen(listenPort, listenHost, () => {
  log(accessLog, `listening https://${listenHost}:${listenPort} -> http://${targetHost}:${targetPort}`);
});
