# BSA Gate — WooCommerce demo (Docker)

Real WordPress + WooCommerce + the BSA Gate plugin, with a headless end-to-end that proves a
product purchase settles USDC through the gate (no browser needed — the e2e signs the EIP-3009
authorization in Node exactly as `order-pay.js` does in the browser).

## Prereqs (on the host)
```bash
anvil --fork-url <sepolia-rpc>                       # local fork
RPC_MODE=fork PORT=8787 pnpm --filter @bsa/facilitator start
curl -XPOST localhost:8787/admin/setup
curl -XPOST localhost:8787/admin/issue   -H 'content-type: application/json' \
  -d '{"label":"alice","owner":"0x…alice","attestations":{"over18":"true","jurisdiction":"CH"}}'
```

## Run WordPress
```bash
cd wc-demo && docker compose up -d          # WP+WC+plugin; wp-cli bootstraps a $19.99 18+ product
docker compose logs -f wp-cli               # wait for "DEMO READY"
```

## Prove a purchase (headless)
```bash
eval "$(docker compose exec -T wp-cli wp eval-file /test/make-order.php --path=/var/www/html)"
ORDER_ID=$ORDER_ID ORDER_KEY=$ORDER_KEY PAY_AS=alice PAY_NAME=alice.bsagate.eth \
  RPC_MODE=fork pnpm --filter @bsa/facilitator exec tsx scripts/wc-e2e.ts
docker compose exec -T wp-cli wp wc order get $ORDER_ID --field=status --user=1   # -> processing/completed
curl "localhost:8787/transactions?address=0x9B49…merchant"                         # -> the settlement
```

## Browser (human)
Open `http://localhost:8090/shop/`, buy the product, choose **USDC (Ethereum)**, connect MetaMask
(import the key that owns `alice.bsagate.eth`), sign. Same path as the e2e, end to end.
