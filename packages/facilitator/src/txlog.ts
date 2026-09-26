/** Append-only settlement/attempt log (JSON-file backed) — powers GET /transactions. */
import fs from "node:fs";
import path from "node:path";
import type { Address, Hex } from "viem";

export type TxRecord = {
  id: string;
  ts: number;
  surface: string; // "agent" | "woocommerce" | "shopify" | "demo"
  ok: boolean;
  stage: string;
  txHash?: Hex;
  from: Address;
  to: Address;
  amount: string; // base units
  token: Address;
  ensName: string;
  identityName?: string;
  reasons?: string[];
};

const FILE = process.env.TXLOG_PATH ?? path.resolve(process.cwd(), "data", "transactions.json");

function load(): TxRecord[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as TxRecord[];
  } catch {
    return [];
  }
}

export function record(entry: Omit<TxRecord, "id" | "ts">): TxRecord {
  const all = load();
  const rec: TxRecord = { ...entry, id: Math.random().toString(36).slice(2, 10), ts: Date.now() };
  all.push(rec);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  return rec;
}

/** Most-recent-first; optional filter by an address (matches payer or payee). */
export function list(address?: string): TxRecord[] {
  const all = load().reverse();
  if (!address) return all;
  const a = address.toLowerCase();
  return all.filter((r) => r.to.toLowerCase() === a || r.from.toLowerCase() === a);
}
