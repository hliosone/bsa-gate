/**
 * Headless WooCommerce end-to-end: prove a real product purchase settles through
 * the BSA Gate plugin — WITHOUT a browser. We do exactly what order-pay.js does:
 * scrape the localized BSAGATE_PAY config, sign the EIP-3009 authorization in Node,
 * and POST it to the plugin's REST /settle (carrying the wp_rest nonce + cookies).
 *
 *   ORDER_ID=.. ORDER_KEY=.. PAY_AS=alice PAY_NAME=alice.bsagate.eth \
 *     RPC_MODE=fork tsx scripts/wc-e2e.ts
 */
import type { Role } from "@bsa/ens/config";
import { USDC, wallet } from "@bsa/ens/config";
import { signTransferAuthorization } from "../src/eip3009.js";

const WP = process.env.WP_URL ?? "http://localhost:8090";
const ORDER_ID = process.env.ORDER_ID;
const ORDER_KEY = process.env.ORDER_KEY;
const ROLE = (process.env.PAY_AS ?? "alice") as Role;
const ENS_NAME = process.env.PAY_NAME ?? "alice.bsagate.eth";

if (!ORDER_ID || !ORDER_KEY) {
  console.error("Set ORDER_ID and ORDER_KEY (from wp eval-file test/make-order.php).");
  process.exit(2);
}

function extractConfig(html: string, name: string): any | null {
  const at = html.indexOf(name + " = ");
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  let depth = 0;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(start, j + 1));
    }
  }
  return null;
}

function cookieHeader(res: Response, jar: Map<string, string>) {
  const raw = typeof (res.headers as any).getSetCookie === "function" ? (res.headers as any).getSetCookie() : [];
  for (const c of raw as string[]) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  const jar = new Map<string, string>();
  const payUrl = `${WP}/checkout/order-pay/${ORDER_ID}/?key=${encodeURIComponent(ORDER_KEY!)}`;
  console.log(`GET ${payUrl}`);
  const page = await fetch(payUrl, { redirect: "follow" });
  const cookies = cookieHeader(page, jar);
  const html = await page.text();
  const CFG = extractConfig(html, "BSAGATE_PAY");
  if (!CFG) {
    console.error(`✗ BSAGATE_PAY not found on the order-pay page (HTTP ${page.status}). Is the order payable with bsagate?`);
    process.exit(1);
  }
  console.log(`  BSAGATE_PAY: payTo=${CFG.payTo} amount=${CFG.amountBaseUnits} chain=${CFG.chainId}`);

  const auth = await signTransferAuthorization(wallet(ROLE), USDC, {
    to: CFG.payTo,
    value: BigInt(CFG.amountBaseUnits),
  });
  const body = {
    order_id: CFG.orderId,
    order_key: CFG.orderKey,
    ens_name: ENS_NAME,
    authorization: {
      ...auth,
      value: auth.value.toString(),
      validAfter: auth.validAfter.toString(),
      validBefore: auth.validBefore.toString(),
    },
  };

  const settleUrl = `${WP}/wp-json/bsagate/v1/settle`;
  console.log(`POST ${settleUrl} (as ${ROLE} / ${ENS_NAME})`);
  const res = await fetch(settleUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "X-WP-Nonce": CFG.nonce, cookie: cookies },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  console.log(`← HTTP ${res.status}: ${JSON.stringify(out)}`);
  const ok = res.ok && (out as any).paid === true && (out as any).tx_hash;
  console.log(ok ? `\n✓ PASS — order paid, tx ${(out as any).tx_hash}` : "\n✗ FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
