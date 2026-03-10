import { createHmac, timingSafeEqual } from "node:crypto";

type SessionPayload = {
  email: string;
  exp: number;
};

export const SESSION_COOKIE_NAME = "racer_session";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days
const sessionSecret = process.env.AUTH_SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("Missing AUTH_SESSION_SECRET environment variable.");
}

const sessionSecretValue: string = sessionSecret;

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createSignature(payload: string) {
  return createHmac("sha256", sessionSecretValue).update(payload).digest("base64url");
}

export function createSessionToken(email: string) {
  const payload: SessionPayload = {
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = createSignature(encodedPayload);
  const incomingBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (incomingBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(incomingBuffer, expectedBuffer)) {
    return null;
  }

  let payload: SessionPayload;

  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
  } catch {
    return null;
  }

  if (!payload.email || typeof payload.exp !== "number") {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
