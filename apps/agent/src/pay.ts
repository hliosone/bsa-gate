/**
 * BSA Gate — autonomous agent x402 client.
 *
 * Probes a paid resource, gets HTTP 402 + terms, signs a gasless EIP-3009
 * authorization with its OWN key, and retries with the X-PAYMENT header.
 * The facilitator runs the ENS + Intercepta gate before settling.
 *
 *   PAY_AS=agent PAY_NAME=agent.alice.bsagate.eth pnpm --filter @bsa/agent pay
 */
import { wallet, type Role } from "@bsa/ens/config";
import { signTransferAuthorization } from "@bsa/facilitator/eip3009";

const SERVER = process.env.SERVER_URL ?? "http://localhost:8787";
const ROLE = (process.env.PAY_AS ?? "agent") as Role;
const ENS_NAME = process.env.PAY_NAME ?? "agent.alice.bsagate.eth";

async function main() {
  console.log(`\nAgent ${ROLE} (${ENS_NAME}) → ${SERVER}/demo/quote`);

  // 1. Probe — expect 402 with the terms.
  const probe = await fetch(`${SERVER}/demo/quote`);
  if (probe.status !== 402) {
    console.log(`unexpected ${probe.status}:`, await probe.text());
    return;
  }
  const { accepts } = (await probe.json()) as { accepts: Array<{ token: `0x${string}`; payTo: `0x${string}`; amount: string }> };
  const terms = accepts[0]!;
  console.log(`← 402 Payment Required: ${terms.amount} base-units USDC → ${terms.payTo}`);

  // 2. Sign a gasless EIP-3009 authorization (the agent's own key; no gas).
  const auth = await signTransferAuthorization(wallet(ROLE), terms.token, {
    to: terms.payTo,
    value: BigInt(terms.amount),
  });
  const payload = {
    ensName: ENS_NAME,
    authorization: {
      ...auth,
      value: auth.value.toString(),
      validAfter: auth.validAfter.toString(),
      validBefore: auth.validBefore.toString(),
    },
  };
  const header = Buffer.from(JSON.stringify(payload)).toString("base64");

  // 3. Retry with X-PAYMENT.
  const res = await fetch(`${SERVER}/demo/quote`, { headers: { "X-PAYMENT": header } });
  const out = await res.json();
  console.log(`→ retried with X-PAYMENT`);
  console.log(`← HTTP ${res.status}`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
