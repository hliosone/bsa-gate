/**
 * Intercepta (Web3 Antivirus) payment screening.
 *
 * Screens the payer + payee against sanctions / scam / mixer exposure BEFORE settle.
 * - When INTERCEPTA_API_KEY is set, makes a real live call (mainnet risk data, which
 *   is correct even for a testnet payment — per Intercepta's own guidance).
 * - Otherwise uses a dev stub driven by INTERCEPTA_TEST_DENYLIST so flows are testable
 *   before the key arrives. The stub is DEV-ONLY; the submitted demo uses the live call.
 */
import type { Address } from "viem";

export type ScreenInput = { payer: Address; payee: Address };
export type ScreenResult = { ok: boolean; reasons: string[]; live: boolean };

const API_BASE = "https://api.web3antivirus.io";
const TOXIC_THRESHOLD = Number(process.env.INTERCEPTA_TOXIC_THRESHOLD ?? "40");
const SANCTION_TRAITS = new Set(["sanction_address", "known_scammer", "blacklist", "mixer_transfers"]);

function denylist(): Set<string> {
  return new Set(
    (process.env.INTERCEPTA_TEST_DENYLIST ?? "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

type QuickScan = { toxicScore?: number; traits?: Array<{ name?: string; risk?: number }> };

async function quickScan(address: Address, apiKey: string): Promise<{ flagged: boolean; why: string[] }> {
  const res = await fetch(`${API_BASE}/api/public/v2/extension/account/${address}/quick-scan`, {
    headers: { "X-API-KEY": apiKey },
  });
  if (!res.ok) throw new Error(`Intercepta ${res.status}`);
  const data = (await res.json()) as QuickScan;
  const why: string[] = [];
  const hits = (data.traits ?? []).filter((t) => t.name && SANCTION_TRAITS.has(t.name));
  for (const h of hits) why.push(`trait:${h.name}`);
  if ((data.toxicScore ?? 0) >= TOXIC_THRESHOLD) why.push(`toxicScore ${data.toxicScore} >= ${TOXIC_THRESHOLD}`);
  return { flagged: why.length > 0, why };
}

export async function screen({ payer, payee }: ScreenInput): Promise<ScreenResult> {
  const apiKey = process.env.INTERCEPTA_API_KEY;
  if (apiKey) {
    const reasons: string[] = [];
    for (const [label, addr] of [
      ["payee", payee],
      ["payer", payer],
    ] as const) {
      try {
        const r = await quickScan(addr, apiKey);
        if (r.flagged) reasons.push(`${label} ${addr} flagged (${r.why.join(", ")})`);
      } catch (e) {
        reasons.push(`Intercepta screen failed for ${label} (${String(e)}) — failing closed`);
      }
    }
    return { ok: reasons.length === 0, reasons, live: true };
  }
  // Dev stub
  const deny = denylist();
  const reasons: string[] = [];
  if (deny.has(payee.toLowerCase())) reasons.push(`payee ${payee} flagged (stub denylist)`);
  if (deny.has(payer.toLowerCase())) reasons.push(`payer ${payer} flagged (stub denylist)`);
  return { ok: reasons.length === 0, reasons, live: false };
}
