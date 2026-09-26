import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { decodeSdJwt, ageOn, mapClaims } from "./eudi.js";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Build a minimal SD-JWT VC: `birthdate` is a selective disclosure, `given_name` a plain claim. */
function makeSdJwt(birthdate: string) {
  const disclosure = b64url(["salt123", "birthdate", birthdate]);
  const digest = createHash("sha256").update(disclosure, "ascii").digest("base64url");
  const header = b64url({ alg: "ES256", typ: "dc+sd-jwt" });
  const payload = b64url({ iss: "https://issuer.example", vct: "urn:eudi:pid:1", _sd_alg: "sha-256", _sd: [digest], given_name: "John" });
  return `${header}.${payload}.sig~${disclosure}~`; // trailing ~ => no KB-JWT
}

describe("EUDI: SD-JWT decoding", () => {
  it("resolves a selective-disclosure claim and plain claims", () => {
    const { claims } = decodeSdJwt(makeSdJwt("2000-09-27"));
    expect(claims.birthdate).toBe("2000-09-27"); // from the disclosure
    expect(claims.given_name).toBe("John"); // plain claim
    expect(claims.vct).toBe("urn:eudi:pid:1");
    expect(claims._sd).toBeUndefined(); // internals stripped
  });
});

describe("EUDI: age calculation", () => {
  it("counts whole years, respecting the birthday boundary", () => {
    expect(ageOn("2000-01-01", new Date("2026-09-26T00:00:00Z"))).toBe(26);
    expect(ageOn("2008-09-26", new Date("2026-09-26T00:00:00Z"))).toBe(18); // birthday today
    expect(ageOn("2008-09-27", new Date("2026-09-26T00:00:00Z"))).toBe(17); // birthday tomorrow
  });
});

describe("EUDI: claim mapping", () => {
  it("derives over18=true and jurisdiction from nationality", () => {
    expect(mapClaims({ birthdate: "2000-01-01", nationalities: ["CH", "FR"] })).toEqual({ over18: "true", jurisdiction: "CH" });
  });
  it("derives over18=false for a minor and omits missing jurisdiction", () => {
    expect(mapClaims({ birthdate: "2015-01-01" })).toEqual({ over18: "false" });
  });
  it("falls back to address.country, uppercased", () => {
    expect(mapClaims({ birthdate: "1990-05-05", address: { country: "de" } })).toEqual({ over18: "true", jurisdiction: "DE" });
  });
  it("falls back to issuing_country", () => {
    expect(mapClaims({ birthdate: "1990-05-05", issuing_country: "fr" })).toEqual({ over18: "true", jurisdiction: "FR" });
  });
  it("returns nothing derivable without a birthdate", () => {
    expect(mapClaims({ given_name: "John" })).toEqual({});
  });
});
