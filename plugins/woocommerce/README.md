# BSA Gate for WooCommerce

A classic WooCommerce payment gateway: **Pay with USDC on Ethereum**, gated by BSA Gate
(ENSv2 permissions + Intercepta screening) and settled via EIP-3009. Reuses the structure of the
XRPL EdelGate plugin, swapping XRPL/Crossmark for EVM/MetaMask.

## Flow
1. Shopper checks out → order set `pending` → redirected to the order-pay page.
2. `assets/js/order-pay.js` connects an EVM wallet, has the shopper sign a gasless
   `TransferWithAuthorization` (EIP-712), and POSTs `{ order_id, order_key, ens_name, authorization }`
   to `POST /wp-json/bsagate/v1/settle`.
3. `class-bsagate-rest.php` builds the `requirements` **server-side** (chain, USDC token, merchant
   pay-to, amount from the order, required attestations) and calls the facilitator `/settle`.
4. The facilitator runs the gate (verify → ENS → Intercepta → settle). On success the order is
   marked paid with the settlement tx hash.

**Security:** the browser never sends the amount, pay-to, or facilitator URL, and never calls the
facilitator directly — PHP builds those from the order + settings; the facilitator re-verifies the
signed authorization against them.

## Setup
1. Copy `plugins/woocommerce/` into `wp-content/plugins/bsa-gate-woo/` and activate it.
2. WooCommerce → Settings → Payments → **BSA Gate (USDC on Ethereum)**: set the **Facilitator URL**,
   **Merchant address** (pay-to), and **Required attestations** (e.g. `{"over18":"true"}`).
   Defaults target Sepolia + Circle USDC `0x1c7D…7238`.
3. Run the facilitator (`pnpm --filter @bsa/facilitator start`) and issue the shopper an identity
   (`/admin/setup`, `/admin/issue`). The shopper connects the wallet that **owns** their
   `*.bsagate.eth` name.

## Manual test note
Full checkout requires WordPress + a browser wallet (MetaMask), so it is verified manually. A
Dockerized WP demo can be added mirroring EdelGate's `wc-demo/`. The server-side settle contract it
calls is covered by the facilitator's automated tests.
