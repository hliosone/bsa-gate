/** Narrated LIVE agent demo for the video. The agent pays over x402 (settles), then is
 *  blocked over its spend cap (if one is set), then blocked by Intercepta on a sanctioned
 *  payee. Signs with AGENT_PK from .env (the wallet you delegate your agent to).
 *
 *  Use YOUR identity:  PAY_NAME=agent.<your-handle>.bsagate.eth sh demo-agent.sh
 *  Default:            agent.alice.bsagate.eth */
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { USDC, account } from "@bsa/ens/config";
import { signTransferAuthorization } from "../src/eip3009.js";

const FAC = process.env.FACILITATOR_URL ?? "https://bsa-gate-production.up.railway.app";
const RPC = process.env.SEPOLIA_RPC_URL!;
const MERCHANT = account("merchant").address as Address;
const FLAGGED = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96" as Address; // known sanctioned/scam
const NAME = process.env.PAY_NAME || "agent.alice.bsagate.eth";
const AGENT = createWalletClient({ account: privateKeyToAccount(process.env.AGENT_PK as `0x${string}`), chain: sepolia, transport: http(RPC) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hr = () => console.log("\x1b[90m" + "-".repeat(60) + "\x1b[0m");
const usd = (b: string | bigint) => `${Number(b) / 1e6} USDC`;

async function wire(to: Address, value: bigint) {
  const a = await signTransferAuthorization(AGENT, USDC, { to, value });
  return { from: a.from, to: a.to, value: a.value.toString(), validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), nonce: a.nonce, signature: a.signature };
}
async function settle(payTo: Address, value: bigint) {
  const requirements = { chainId: 11155111, token: USDC, payTo, amount: value.toString(), requiredAttestations: { over18: "true" } };
  return (await fetch(`${FAC}/settle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: { ensName: NAME, authorization: await wire(payTo, value) }, requirements, surface: "agent" }) })).json();
}

async function main() {
  console.log(`\n\x1b[1mBSA Gate - autonomous AI agent\x1b[0m  (${NAME})`);
  console.log(`gate: ${FAC}\n`);
  await sleep(1200);

  // 1) x402 PASS: probe the paid API, get 402, sign gaslessly, pay.
  hr();
  console.log("\x1b[1m1. The agent buys a paid API resource over x402\x1b[0m");
  const terms = (await (await fetch(`${FAC}/demo/quote`)).json()).accepts[0];
  console.log(`   <- 402 Payment Required: ${usd(terms.amount)} to ${terms.payTo}`);
  console.log(`   signing EIP-3009 with the agent's own key (gasless)...`);
  const header = Buffer.from(JSON.stringify({ ensName: NAME, authorization: await wire(terms.payTo, BigInt(terms.amount)) })).toString("base64");
  const o1 = await (await fetch(`${FAC}/demo/quote`, { headers: { "X-PAYMENT": header } })).json();
  const tx = o1.payment?.txHash;
  console.log(tx ? `   \x1b[32m-> SETTLED\x1b[0m  ${usd(terms.amount)}  tx ${tx}` : `   ${JSON.stringify(o1)}`);
  await sleep(3000);

  // 2) Over the spend cap -> blocked before any money moves (only if a cap is set on this agent).
  const caps = (await (await fetch(`${FAC}/policy/caps`)).json()).caps ?? {};
  const cap = caps[NAME] ? BigInt(caps[NAME]) : null;
  if (cap) {
    hr();
    console.log(`\x1b[1m2. The agent tries to pay over its ${usd(cap)} spend cap\x1b[0m`);
    const b2 = await settle(MERCHANT, cap + 10_000_000n);
    console.log(`   \x1b[31m-> BLOCKED\x1b[0m @ ${b2.stage}: ${(b2.reasons || []).join("; ")}`);
    await sleep(3000);
  }

  // 3) Sanctioned payee -> Intercepta blocks it.
  hr();
  console.log("\x1b[1m" + (cap ? "3" : "2") + ". The agent tries to pay a sanctioned address\x1b[0m");
  const b3 = await settle(FLAGGED, 10_000n);
  console.log(`   \x1b[31m-> BLOCKED\x1b[0m @ ${b3.stage}: ${(b3.reasons || []).join("; ")}`);
  hr();
  console.log(`\n\x1b[1mThe agent paid what it was allowed to. ENS said who may pay, Intercepta said what is safe.\x1b[0m\n`);
}
main().catch((e) => { console.error(e); process.exit(1); });
