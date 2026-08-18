import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const claimsSchema = z.object({
  iss: z.literal("trinity-consult"),
  aud: z.literal("trinity-consult-aws-pilot"),
  sub: z.string().uuid(),
  role: z.enum(["coordinator", "manager"]),
  consultationId: z.string().uuid(),
  jti: z.string().uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
}).strict();

export type BridgeClaims = z.infer<typeof claimsSchema>;

export function verifyBridgeToken(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): BridgeClaims {
  if (secret.length < 32) throw new Error("bridge_secret_invalid");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("bridge_token_invalid");
  z.object({ alg: z.literal("HS256"), typ: z.literal("JWT") }).strict().parse(JSON.parse(decode(parts[0])));
  const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const supplied = Buffer.from(parts[2], "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error("bridge_token_invalid");
  const claims = claimsSchema.parse(JSON.parse(decode(parts[1])));
  if (claims.exp <= nowSeconds || claims.iat > nowSeconds + 30 || claims.exp - claims.iat > 180 || claims.exp <= claims.iat) {
    throw new Error("bridge_token_expired");
  }
  return claims;
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
