import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const incomingHash = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const originalHash = Buffer.from(hash, "hex");

  if (incomingHash.length !== originalHash.length) {
    return false;
  }

  return timingSafeEqual(incomingHash, originalHash);
}
