import { createPrivateKey } from "node:crypto";

/**
 * Checks a service-account private key before Google auth uses it, so a
 * malformed secret fails with the variable's name and the likely cause
 * instead of OpenSSL's "DECODER routines::unsupported".
 */
export function assertPrivateKey(name: string, pem: string): string {
  try {
    createPrivateKey(pem);
  } catch (error) {
    throw new Error(
      `${name} is not a valid private key: ${likelyCause(pem)} ` +
        `Set it to the "private_key" value from the service-account JSON, for example: ` +
        `jq -r .private_key key.json | gh secret set ${name}. ` +
        `(OpenSSL said: ${(error as Error).message})`,
    );
  }
  return pem;
}

/** The most likely reason a pasted key doesn't parse. */
export function likelyCause(pem: string): string {
  const s = pem.trim();
  if (!s) return "it is empty.";
  if (s.startsWith("{")) {
    return "it looks like the whole service-account JSON file, not just its private_key field.";
  }
  if (!s.includes("-----BEGIN")) return 'it is missing the "-----BEGIN PRIVATE KEY-----" line.';
  if (!s.includes("-----END")) {
    return 'it is missing the "-----END PRIVATE KEY-----" line, so it was probably cut off when pasted.';
  }
  if (s.includes("\\")) {
    return 'it still contains backslashes, so its "\\n" line breaks were probably escaped twice.';
  }
  return "the key body is damaged: characters are missing or extra, or it is a different key format.";
}
