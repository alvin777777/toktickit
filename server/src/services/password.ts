import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// promisify() picks the 3-argument overload of crypto.scrypt, which drops the cost options — so
// wrap the callback form by hand to keep N/r/p explicit.
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// BR-04 — passwords are hashed with Node's built-in scrypt (memory-hard KDF, no native dependency).
// The parameters are embedded in the stored string so they can be raised later without a migration:
//   scrypt$N$r$p$<salt base64>$<key base64>
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string, salt: Buffer = randomBytes(SALT_BYTES)): Promise<string> {
  const key = await scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  // Constant-time comparison so a wrong password costs the same as a right one (BR-11).
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// BR-05 — 8–72 characters, at least one uppercase, one lowercase, one digit.
export const PASSWORD_RULE_TEXT =
  "Password must be 8-72 characters and include an uppercase letter, a lowercase letter, and a number.";

export function passwordRuleFailure(password: string): string | null {
  if (typeof password !== "string") return PASSWORD_RULE_TEXT;
  if (password.length < 8 || password.length > 72) return PASSWORD_RULE_TEXT;
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return PASSWORD_RULE_TEXT;
  }
  return null;
}
