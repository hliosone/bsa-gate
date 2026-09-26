/**
 * EUDI wallet verification (OpenID4VP) for BSA Gate.
 *
 * The user presents their PID from an EU identity wallet (tested with Procivis One).
 * The public EUDI reference verifier cryptographically verifies it; we decode the
 * SD-JWT VC and derive attestations (over18 from birthdate, jurisdiction from
 * nationality) before issuing the ENS identity. Only the derived attestations go
 * on-chain, never birthdate or name.
 *
 * See EUDI_VERIFIER_INTEGRATION.txt for the full protocol notes. All network calls
 * are outbound HTTPS to the verifier; no inbound webhook or keys of our own.
 */
import { createHash, randomBytes } from "node:crypto";

const VERIFIER = process.env.EUDI_VERIFIER_URL ?? "https://verifier-backend.eudiw.dev";
const INTENDED = process.env.EUDI_INTENDED_USE_ID ?? "TEST-01";
const TRUST_TEST = process.env.EUDI_TRUST_TEST_CAS !== "false"; // default on

// The two EUDI test CAs that sign the reference/Procivis PIDs (public certs, safe to embed).
// Added to issuer_chain so the public verifier trusts the trial PID (see guide §3).
const EUDI_TEST_CAS = `-----BEGIN CERTIFICATE-----
MIIC3TCCAoOgAwIBAgIUEwybFc9Jw+az3r188OiHDaxCfHEwCgYIKoZIzj0EAwMw
XDEeMBwGA1UEAwwVUElEIElzc3VlciBDQSAtIFVUIDAyMS0wKwYDVQQKDCRFVURJ
IFdhbGxldCBSZWZlcmVuY2UgSW1wbGVtZW50YXRpb24xCzAJBgNVBAYTAlVUMB4X
DTI1MDMyNDIwMjYxNFoXDTM0MDYyMDIwMjYxM1owXDEeMBwGA1UEAwwVUElEIElz
c3VlciBDQSAtIFVUIDAyMS0wKwYDVQQKDCRFVURJIFdhbGxldCBSZWZlcmVuY2Ug
SW1wbGVtZW50YXRpb24xCzAJBgNVBAYTAlVUMFkwEwYHKoZIzj0CAQYIKoZIzj0D
AQcDQgAEesDKj9rCIcrGj0wbSXYvCV953bOPSYLZH5TNmhTz2xa7VdlvQgQeGZRg
1PrF5AFwt070wvL9qr1DUDdvLp6a1qOCASEwggEdMBIGA1UdEwEB/wQIMAYBAf8C
AQAwHwYDVR0jBBgwFoAUYseURyi9D6IWIKeawkmURPEB08cwEwYDVR0lBAwwCgYI
K4ECAgAAAQcwQwYDVR0fBDwwOjA4oDagNIYyaHR0cHM6Ly9wcmVwcm9kLnBraS5l
dWRpdy5kZXYvY3JsL3BpZF9DQV9VVF8wMi5jcmwwHQYDVR0OBBYEFGLHlEcovQ+i
FiCnmsJJlETxAdPHMA4GA1UdDwEB/wQEAwIBBjBdBgNVHRIEVjBUhlJodHRwczov
L2dpdGh1Yi5jb20vZXUtZGlnaXRhbC1pZGVudGl0eS13YWxsZXQvYXJjaGl0ZWN0
dXJlLWFuZC1yZWZlcmVuY2UtZnJhbWV3b3JrMAoGCCqGSM49BAMDA0gAMEUCIQCe
4R9rO4JhFp821kO8Gkb8rXm4qGG/e5/Oi2XmnTQqOQIgfFs+LDbnP2/j1MB4rwZ1
FgGdpr4oyrFB9daZyRIcP90=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIC0zCCAnmgAwIBAgIUXRXxkLbUM6+njr/XT0IIw/HA/uowCgYIKoZIzj0EAwMw
VzEZMBcGA1UEAwwQUElEIElzc3VlciBDQSAwMjEtMCsGA1UECgwkRVVESSBXYWxs
ZXQgUmVmZXJlbmNlIEltcGxlbWVudGF0aW9uMQswCQYDVQQGEwJFVTAeFw0yNTA0
MDkwMDAzMzBaFw0zNDA3MDYwMDAzMjlaMFcxGTAXBgNVBAMMEFBJRCBJc3N1ZXIg
Q0EgMDIxLTArBgNVBAoMJEVVREkgV2FsbGV0IFJlZmVyZW5jZSBJbXBsZW1lbnRh
dGlvbjELMAkGA1UEBhMCRVUwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARkqdLm
wIlv+SSWr00tAIrt7EAMztgd3w9qA6qEm16yVfsLcyx2f4oIWuH45wa37J9GoNWp
deo27VoSoNMCzxOYo4IBITCCAR0wEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNVHSME
GDAWgBRCUFC+ELgQ8J1EXI2/qxAI7ifcSTATBgNVHSUEDDAKBggrgQICAAABBzBD
BgNVHR8EPDA6MDigNqA0hjJodHRwczovL3ByZXByb2QucGtpLmV1ZGl3LmRldi9j
cmwvcGlkX0NBX0VVXzAyLmNybDAdBgNVHQ4EFgQUQlBQvhC4EPCdRFyNv6sQCO4n
3EkwDgYDVR0PAQH/BAQDAgEGMF0GA1UdEgRWMFSGUmh0dHBzOi8vZ2l0aHViLmNv
bS9ldS1kaWdpdGFsLWlkZW50aXR5LXdhbGxldC9hcmNoaXRlY3R1cmUtYW5kLXJl
ZmVyZW5jZS1mcmFtZXdvcmswCgYIKoZIzj0EAwMDSAAwRQIhAIavYfC5o0VVLKfg
TKkzzWgc09hzDMsCl3O2le2sQfG7AiA2soqAN5gtUOLQKWK00DUz22EW79rvaV+V
JPvfdQeokA==
-----END CERTIFICATE-----`;

const b64urlJson = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

/** Decode an SD-JWT VC presentation into its plain claims (no signature check:
 *  the verifier already validated it before returning the token). */
export function decodeSdJwt(token: string) {
  const parts = token.split("~");
  const issuerJwt = parts[0];
  const kbJwt = parts.pop() || null; // last part: KB-JWT, or "" if none
  const disclosures = parts.slice(1).filter(Boolean);
  const [h, p] = issuerJwt.split(".");
  const header = b64urlJson(h);
  const payload = b64urlJson(p);
  const alg = String(payload._sd_alg ?? "sha-256").replace("-", ""); // "sha256"

  const byDigest = new Map<string, any[]>();
  for (const d of disclosures) byDigest.set(createHash(alg).update(d, "ascii").digest("base64url"), b64urlJson(d));

  const resolve = (node: any): any => {
    if (Array.isArray(node)) {
      return node.flatMap((el) => {
        if (el && typeof el === "object" && !Array.isArray(el) && Object.keys(el).length === 1 && "..." in el) {
          const d = byDigest.get(el["..."]);
          return d ? [resolve(d[1])] : []; // undisclosed array element -> dropped
        }
        return [resolve(el)];
      });
    }
    if (node && typeof node === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) if (k !== "_sd" && k !== "_sd_alg") out[k] = resolve(v);
      for (const dg of (node._sd ?? []) as string[]) {
        const d = byDigest.get(dg);
        if (d?.length === 3) out[d[1]] = resolve(d[2]);
      }
      return out;
    }
    return node;
  };

  return {
    header,
    claims: resolve(payload) as Record<string, any>,
    keyBinding: kbJwt ? b64urlJson(kbJwt.split(".")[1]) : null,
  };
}

/** Whole years old on `now` for a YYYY-MM-DD birthdate. */
export function ageOn(birthdate: string, now = new Date()): number {
  const [y, m, d] = birthdate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}

/** Derive BSA Gate attestations from verified PID claims (over18, jurisdiction). */
export function mapClaims(claims: Record<string, any>): Record<string, string> {
  const attestations: Record<string, string> = {};
  if (typeof claims.birthdate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(claims.birthdate)) {
    attestations.over18 = ageOn(claims.birthdate) >= 18 ? "true" : "false";
  }
  const jur = (Array.isArray(claims.nationalities) && claims.nationalities[0]) || claims.address?.country || claims.issuing_country;
  if (typeof jur === "string" && jur) attestations.jurisdiction = jur.toUpperCase();
  return attestations;
}

export type StartResult = { transactionId: string; nonce: string; walletUrl: string; haipUrl: string };

/** Create a verifier transaction and build the wallet link (QR). Requests birthdate +
 *  nationality with a claim_sets fallback so a PID lacking nationality still matches. */
export async function startPidRequest(): Promise<StartResult> {
  const nonce = randomBytes(16).toString("base64url");
  const body = {
    dcql_query: {
      credentials: [
        {
          id: "pid",
          format: "dc+sd-jwt",
          meta: { vct_values: ["urn:eudi:pid:1"] },
          claims: [
            { id: "bd", path: ["birthdate"] },
            { id: "nat", path: ["nationalities", null] },
            { id: "ctry", path: ["address", "country"] },
          ],
          claim_sets: [["bd", "nat"], ["bd", "ctry"], ["bd"]],
        },
      ],
    },
    nonce,
    jar_mode: "by_reference",
    request_uri_method: "get",
    response_mode: "direct_post.jwt",
    profile: "openid4vp",
    intended_use_id: INTENDED,
    ...(TRUST_TEST ? { issuer_chain: EUDI_TEST_CAS } : {}),
  };
  const r = await fetch(`${VERIFIER}/ui/presentations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`EUDI init ${r.status}: ${await r.text()}`);
  const { transaction_id, client_id, request_uri, request_uri_method } = await r.json();
  const q = new URLSearchParams({ client_id, request_uri, request_uri_method }).toString();
  return { transactionId: transaction_id, nonce, walletUrl: `openid4vp://?${q}`, haipUrl: `haip-vp://?${q}` };
}

export type PidStatus =
  | { state: "pending"; scanned: boolean }
  | { state: "verified"; claims: Record<string, any>; keyBinding: any }
  | { state: "rejected"; cause: string }
  | { state: "wallet_error"; error: string; description?: string };

/** Poll the verifier for the outcome of a transaction (server-side only). */
export async function pidStatus(tx: string): Promise<PidStatus> {
  const id = encodeURIComponent(tx);
  const ev = await (await fetch(`${VERIFIER}/ui/presentations/${id}/events`)).json();
  const events: any[] = ev.events ?? [];
  const last = events.filter((e) => e.actor === "Wallet" && e.event !== "Request object retrieved").at(-1);
  if (!last) return { state: "pending", scanned: events.some((e) => e.event === "Request object retrieved") };
  if (last.event !== "Wallet response posted") return { state: "rejected", cause: last.cause ?? last.event };
  const r = await fetch(`${VERIFIER}/ui/presentations/${id}`);
  if (!r.ok) return { state: "pending", scanned: true };
  const body = await r.json();
  if (!body.vp_token) return { state: "wallet_error", error: body.error ?? "unknown", description: body.error_description };
  const token = ([] as string[]).concat(body.vp_token.pid)[0];
  const { claims, keyBinding } = decodeSdJwt(token);
  return { state: "verified", claims, keyBinding };
}
