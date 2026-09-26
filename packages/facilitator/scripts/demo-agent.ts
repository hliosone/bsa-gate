/** Narrated LIVE agent demo for the video. All actions are the AGENT paying autonomously,
 *  signing with AGENT_PK (the wallet you delegate your agent to). Point PAY_NAME at your
 *  delegated agent:  PAY_NAME=agent.<your-handle>.bsagate.eth sh demo-agent.sh
 *
 *  Outcomes: pays an x402 API (settles), pays Shopify (real order), then blocked over the
 *  spend cap, blocked on wrong jurisdiction, and blocked by Intercepta on a sanctioned payee. */
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { USDC, account } from "@bsa/ens/config";
import { signTransferAuthorization } from "../src/eip3009.js";

const FAC = process.env.FACILITATOR_URL ?? "https://bsa-gate-production.up.railway.app";
const SHOP = process.env.SHOPIFY_URL ?? "https://shopify-pay-production.up.railway.app";
const RPC = process.env.SEPOLIA_RPC_URL!;
const MERCHANT = account("merchant").address as Address;
const FLAGGED = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96" as Address; // known sanctioned/scam
const NAME = process.env.PAY_NAME || "agent.alice.bsagate.eth";
const WRONG_JUR = process.env.WRONG_JUR || "FR"; // the merchant requires this; your PID is CH -> blocked
const AGENT = createWalletClient({ account: privateKeyToAccount(process.env.AGENT_PK as `0x${string}`), chain: sepolia, transport: http(RPC) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hr = () => console.log("\x1b[90m" + "-".repeat(62) + "\x1b[0m");
const usd = (b: string | bigint) => `${Number(b) / 1e6} USDC`;
let step = 0;
const head = (t: string) => { hr(); console.log(`\x1b[1m${++step}. ${t}\x1b[0m`); };

async function wire(to: Address, value: bigint) {
  const a = await signTransferAuthorization(AGENT, USDC, { to, value });
  return { from: a.from, to: a.to, value: a.value.toString(), validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), nonce: a.nonce, signature: a.signature };
}
async function facSettle(payTo: Address, value: bigint, att: Record<string, string>) {
  const requirements = { chainId: 11155111, token: USDC, payTo, amount: value.toString(), requiredAttestations: att };
  return (await fetch(`${FAC}/settle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: { ensName: NAME, authorization: await wire(payTo, value) }, requirements, surface: "agent" }) })).json();
}

async function main() {
  console.log(`\n\x1b[1mBSA Gate - autonomous AI agent\x1b[0m  (${NAME})`);
  console.log(`gate: ${FAC}\n`);
  await sleep(1200);

  // 1) x402 PASS: probe the paid API, get 402, sign gaslessly, pay.
  head("The agent buys a paid API over x402");
  const terms = (await (await fetch(`${FAC}/demo/quote`)).json()).accepts[0];
  console.log(`   <- 402 Payment Required: ${usd(terms.amount)} to ${terms.payTo}`);
  console.log(`   signing EIP-3009 with the agent's own key (gasless)...`);
  const header = Buffer.from(JSON.stringify({ ensName: NAME, authorization: await wire(terms.payTo, BigInt(terms.amount)) })).toString("base64");
  const o1 = await (await fetch(`${FAC}/demo/quote`, { headers: { "X-PAYMENT": header } })).json();
  console.log(o1.payment?.txHash ? `   \x1b[32m-> SETTLED\x1b[0m  ${usd(terms.amount)}  tx ${o1.payment.txHash}` : `   ${JSON.stringify(o1)}`);
  await sleep(3000);

  // 2) Shopify: the agent pays a real store order.
  head("The agent pays a Shopify order");
  try {
    const pid = new URL((await fetch(`${SHOP}/checkout`)).url).searchParams.get("pid");
    const sr = await (await fetch(`${SHOP}/settle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pid, ensName: NAME, authorization: await wire(MERCHANT, 100000n) }) })).json();
    console.log(sr.paid ? `   \x1b[32m-> PAID\x1b[0m  Shopify order ${sr.order}  tx ${sr.txHash}` : `   ${JSON.stringify(sr)}`);
  } catch (e) { console.log(`   Shopify error: ${String(e)}`); }
  await sleep(3000);

  // 3) Over the spend cap -> blocked before any money moves (if a cap is set).
  const cap = (await (await fetch(`${FAC}/policy/caps`)).json()).caps?.[NAME];
  if (cap) {
    head(`The agent tries to pay over its ${usd(cap)} spend cap`);
    const b = await facSettle(MERCHANT, BigInt(cap) + 10_000_000n, { over18: "true" });
    console.log(`   \x1b[31m-> BLOCKED\x1b[0m @ ${b.stage}: ${(b.reasons || []).join("; ")}`);
    await sleep(3000);
  }

  // 4) Wrong jurisdiction -> blocked at the attestation check.
  head(`The agent pays a merchant that requires jurisdiction ${WRONG_JUR}`);
  const b4 = await facSettle(MERCHANT, 10_000n, { over18: "true", jurisdiction: WRONG_JUR });
  console.log(`   \x1b[31m-> BLOCKED\x1b[0m @ ${b4.stage}: ${(b4.reasons || []).join("; ")}`);
  await sleep(3000);

  // 5) Sanctioned payee -> Intercepta blocks it.
  head("The agent tries to pay a sanctioned address");
  const b5 = await facSettle(FLAGGED, 10_000n, { over18: "true" });
  console.log(`   \x1b[31m-> BLOCKED\x1b[0m @ ${b5.stage}: ${(b5.reasons || []).join("; ")}`);
  hr();
  console.log(`\n\x1b[1mThe agent paid what it was allowed to. ENS said who may pay, Intercepta said what is safe.\x1b[0m\n`);
}
main().catch((e) => { console.error(e); process.exit(1); });
