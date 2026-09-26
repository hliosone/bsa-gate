/**
 * BSA Gate — narrated end-to-end demo (fork by default, or RPC_MODE=live).
 * Stands up the namespace, issues identities, and runs the gate on 4 scenarios:
 * one compliant payment settles; three are blocked at the right stage.
 */
import { formatUnits } from "viem";
import { RPC_MODE, USDC, account, wallet } from "@bsa/ens/config";
import { signTransferAuthorization, usdcBalance } from "../src/eip3009.js";
import { setupNamespace, issueIdentity, delegateAgent } from "../src/issuer.js";
import { evaluate, type GateContext } from "../src/gate.js";
import type { PaymentPayload, PaymentRequirements } from "../src/types.js";

const issuer = wallet("issuer");
const merchant = account("merchant").address;
const alice = account("alice").address;
const agent = account("agent").address;
const bob = account("bob").address;
const AMOUNT = 10_000n; // 0.01 USDC
const usd = (v: bigint) => `${formatUnits(v, 6)} USDC`;
const line = (s = "") => console.log(s);
const hr = () => line("─".repeat(66));

async function scenario(name: string, ctx: GateContext, payload: PaymentPayload, req: PaymentRequirements) {
  const res = await evaluate(ctx, payload, req);
  line(`${res.ok ? "✅ SETTLED   " : `⛔ BLOCKED @ ${res.stage.padEnd(9)}`} ${name}`);
  if (res.ok) line(`   tx: ${res.txHash}`);
  else line(`   reason: ${res.reasons.join("; ")}`);
  line();
  return res;
}

async function main() {
  line();
  hr();
  line(`  BSA Gate — end-to-end demo   (RPC_MODE=${RPC_MODE})`);
  hr();
  line();

  line("① Setup — BSA Gate stands up its ENS namespace (bsagate.eth)");
  const ns = await setupNamespace(issuer);
  line(`   resolver     ${ns.resolver}`);
  line(`   bsaRegistry  ${ns.bsaRegistry}`);
  line();

  line("② Onboard — KYC + issue identities (attestations only BSA can write)");
  const aliceId = await issueIdentity(issuer, ns, "alice", alice, { over18: "true", jurisdiction: "CH" });
  await delegateAgent(issuer, ns, aliceId.registry, "agent", agent);
  await issueIdentity(issuer, ns, "bob", bob, { jurisdiction: "CH" });
  line("   alice.bsagate.eth  over18=true, jurisdiction=CH   (+ agent.alice.bsagate.eth)");
  line("   bob.bsagate.eth    jurisdiction=CH   (NOT 18+)");
  line();

  const ctx: GateContext = { bsaRegistry: ns.bsaRegistry, resolver: ns.resolver, relayer: issuer };
  const req = (attest: Record<string, string> = { over18: "true" }, maxAmount?: bigint): PaymentRequirements => ({
    chainId: 11155111,
    token: USDC,
    payTo: merchant,
    amount: AMOUNT,
    requiredAttestations: attest,
    maxAmount,
  });

  hr();
  line("③ Merchant sells 18+ content → requires over18=true");
  hr();
  line();

  const before = await usdcBalance(USDC, merchant);

  await scenario(
    "Alice's AGENT pays (inherits Alice's over18)",
    ctx,
    { authorization: await signTransferAuthorization(wallet("agent"), USDC, { to: merchant, value: AMOUNT }), ensName: "agent.alice.bsagate.eth" },
    req(),
  );
  await scenario(
    "BOB pays (verified, but not 18+)",
    ctx,
    { authorization: await signTransferAuthorization(wallet("bob"), USDC, { to: merchant, value: AMOUNT }), ensName: "bob.bsagate.eth" },
    req(),
  );
  await scenario(
    "Alice's agent pays OVER the spend cap",
    ctx,
    { authorization: await signTransferAuthorization(wallet("agent"), USDC, { to: merchant, value: AMOUNT }), ensName: "agent.alice.bsagate.eth" },
    req({ over18: "true" }, AMOUNT - 1n),
  );
  process.env.INTERCEPTA_TEST_DENYLIST = merchant.toLowerCase();
  await scenario(
    "Alice's agent pays a FLAGGED merchant (Intercepta)",
    ctx,
    { authorization: await signTransferAuthorization(wallet("agent"), USDC, { to: merchant, value: AMOUNT }), ensName: "agent.alice.bsagate.eth" },
    req(),
  );
  delete process.env.INTERCEPTA_TEST_DENYLIST;

  const after = await usdcBalance(USDC, merchant);
  hr();
  line(`  Merchant received exactly ${usd(after - before)} — only the compliant, safe payment settled.`);
  hr();
  line();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
