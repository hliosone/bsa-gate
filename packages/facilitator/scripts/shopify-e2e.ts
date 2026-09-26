/**
 * Headless Shopify end-to-end: prove a real Shopify order settles USDC through the
 * BSA Gate — without a browser. Same shape as wc-e2e: open the checkout, scrape the
 * pay page's BSAGATE config, sign the EIP-3009 authorization in Node, POST /settle.
 *
 *   SHOP_URL=http://localhost:8088 PAY_AS=alice PAY_NAME=alice.bsagate.eth \
 *     AMOUNT=0.10 RPC_MODE=fork tsx scripts/shopify-e2e.ts
 */
import type { Role } from "@bsa/ens/config";
import { USDC, wallet } from "@bsa/ens/config";
import { signTransferAuthorization } from "../src/eip3009.js";

const SHOP = process.env.SHOP_URL ?? "http://localhost:8088";
const AMOUNT = process.env.AMOUNT ?? "0.10";
const ROLE = (process.env.PAY_AS ?? "alice") as Role;
const ENS_NAME = process.env.PAY_NAME ?? "alice.bsagate.eth";

/** Pull the `const CFG={...}` object out of the pay page HTML (balanced braces). */
function extractCfg(html: string): any | null {
  const at = html.indexOf("const CFG=");
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  let depth = 0;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return JSON.parse(html.slice(start, j + 1)); }
  }
  return null;
}

async function main() {
  const url = `${SHOP}/checkout?amount=${AMOUNT}&order=E2E-${Date.now()}`;
  console.log(`GET ${url}`);
  const page = await fetch(url, { redirect: "follow" });
  const html = await page.text();
  const CFG = extractCfg(html);
  if (!CFG) {
    console.error(`✗ CFG not found on the pay page (HTTP ${page.status}). Is the Shopify service running?`);
    process.exit(1);
  }
  console.log(`  order=${CFG.order} units=${CFG.units} payTo=${CFG.payTo} chain=${CFG.chainId}`);

  const auth = await signTransferAuthorization(wallet(ROLE), USDC, { to: CFG.payTo, value: BigInt(CFG.units) });
  const body = {
    pid: CFG.pid,
    ensName: ENS_NAME,
    authorization: {
      ...auth,
      value: auth.value.toString(),
      validAfter: auth.validAfter.toString(),
      validBefore: auth.validBefore.toString(),
    },
  };

  console.log(`POST ${SHOP}/settle (as ${ROLE} / ${ENS_NAME})`);
  const res = await fetch(`${SHOP}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  console.log(`← HTTP ${res.status}: ${JSON.stringify(out)}`);
  const ok = res.ok && (out as any).paid === true && (out as any).txHash;
  console.log(
    ok
      ? `\n✓ PASS — paid, tx ${(out as any).txHash}${(out as any).shopifyOrderId ? `, Shopify order ${(out as any).shopifyOrderId}` : ""}`
      : "\n✗ FAIL",
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
