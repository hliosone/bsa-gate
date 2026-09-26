# BSA Gate — Shopify pay service

A hosted pay-page service: **Pay a Shopify order with USDC on Ethereum**, gated by BSA Gate and
settled via EIP-3009. Node/Express, EVM/MetaMask. Mirrors EdelGate's `shopify-pay` security model.

## Flow
```
GET  /checkout?amount=&order=   → open a server-side session, redirect to /pay?pid=<opaque>
GET  /pay?pid=...               → HTML pay page (connect wallet, sign EIP-3009)
POST /settle { pid, ensName, authorization }
                               → server rebuilds requirements from the SESSION (amount/payTo never
                                 come from the browser) → facilitator /settle → mark order paid
```

The browser only ever holds the opaque `pid`. The server owns the amount and pay-to and rebuilds
the facilitator `requirements`; the facilitator re-verifies the signed authorization against them.

## Run (DRY_RUN — real settle, no Shopify Admin calls)
```bash
cd plugins/shopify && npm install
FACILITATOR_URL=http://localhost:8787 DRY_RUN=true node server.mjs
# open http://localhost:8088/checkout?amount=0.01&order=DEMO-1
```

## Going live (needs your store — finish manually)
Set `DRY_RUN=false` and provide `SHOPIFY_ADMIN_TOKEN` (+ shop domain), then implement the
`draftOrderComplete` + `metafieldsSet` Admin GraphQL calls in `/settle` (marked with a TODO). The
settlement path itself (facilitator `/settle`) is identical to the tested agent/WooCommerce path.

## Config (env)
`FACILITATOR_URL`, `USDC`, `CHAIN_ID`, `MERCHANT` (pay-to), `USDC_NAME`, `USDC_VERSION`,
`REQUIRED_ATTESTATIONS` (JSON, default `{"over18":"true"}`), `DRY_RUN`, `PORT` (default 8088).
