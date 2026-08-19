import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { APIGatewayRequestAuthorizerEventV2, APIGatewaySimpleAuthorizerWithContextResult } from "aws-lambda";
import { z } from "zod";
import { verifyBridgeToken } from "../bridge-token.js";

const secrets = new SecretsManagerClient({});
let cachedSecret: string | null = null;

type Context = { actorId: string; role: string; consultationId: string; tokenId: string };

export async function handler(event: APIGatewayRequestAuthorizerEventV2): Promise<APIGatewaySimpleAuthorizerWithContextResult<Context>> {
  try {
    const authorization = event.headers?.authorization ?? event.headers?.Authorization;
    if (!authorization?.startsWith("Bearer ")) return denied();
    const claims = verifyBridgeToken(authorization.slice(7), await bridgeSecret());
    return {
      isAuthorized: true,
      context: { actorId: claims.sub, role: claims.role, consultationId: claims.consultationId, tokenId: claims.jti },
    };
  } catch {
    return denied();
  }
}

function denied(): APIGatewaySimpleAuthorizerWithContextResult<Context> {
  return { isAuthorized: false, context: { actorId: "", role: "", consultationId: "", tokenId: "" } };
}

async function bridgeSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const secretId = required("BRIDGE_SECRET_ARN");
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  const parsed = z.object({ tokenSecret: z.string().min(32) }).parse(JSON.parse(response.SecretString ?? "{}"));
  cachedSecret = parsed.tokenSecret;
  return cachedSecret;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("authorizer_configuration_error");
  return value;
}
