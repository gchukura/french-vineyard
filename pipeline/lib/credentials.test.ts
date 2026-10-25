import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { normalizePrivateKey } from "@/lib/env";

import { assertPrivateKey, likelyCause } from "./credentials";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("assertPrivateKey", () => {
  it("passes a valid key through, including one pasted with escaped newlines", () => {
    expect(assertPrivateKey("K", pem)).toBe(pem);
    expect(() =>
      assertPrivateKey("K", normalizePrivateKey(JSON.stringify(pem).slice(1, -1))),
    ).not.toThrow();
  });

  it("names the variable and the likely cause", () => {
    const json = JSON.stringify({ type: "service_account", private_key: pem });
    expect(() => assertPrivateKey("PIPELINE_SERVICE_ACCOUNT_PRIVATE_KEY", json)).toThrow(
      /^PIPELINE_SERVICE_ACCOUNT_PRIVATE_KEY is not a valid private key: it looks like the whole service-account JSON/,
    );
  });
});

describe("likelyCause", () => {
  const lines = pem.trim().split("\n");

  it.each([
    ["", /empty/],
    [lines.slice(1).join("\n"), /BEGIN/],
    [lines.slice(0, -1).join("\n"), /END.*cut off/],
    [pem.replace(/\n/g, "\\\n"), /escaped twice/],
    [pem.replace(/[A-Za-z0-9+/]{20}/, ""), /damaged/],
  ])("explains a broken key (%#)", (key, cause) => {
    expect(likelyCause(key)).toMatch(cause);
  });
});
