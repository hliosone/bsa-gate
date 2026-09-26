#!/bin/sh
# BSA Gate WooCommerce demo bootstrap — idempotent WP-CLI provisioning.
set -eu
WP="wp --path=/var/www/html"
export HOME=/tmp WP_CLI_CACHE_DIR=/tmp/.wp-cli-cache
opt() { $WP option update "$@" >/dev/null 2>&1 || echo "   (option $1 unchanged)"; }

echo "==> waiting for database..."
i=0; until $WP db check >/dev/null 2>&1; do i=$((i+1)); [ "$i" -gt 60 ] && { echo "!! db timeout"; exit 1; }; sleep 2; done

if [ "$($WP option get bsagate_demo_seeded 2>/dev/null || echo '')" = "1" ]; then
  echo "==> already seeded (run 'docker compose down -v' to reset)."; exit 0
fi

$WP core is-installed >/dev/null 2>&1 || $WP core install \
  --url="http://localhost:8090" --title="BSA Gate Demo Store" \
  --admin_user="admin" --admin_password="admin_pass" --admin_email="admin@example.com" --skip-email

$WP rewrite structure '/%postname%/' --hard && $WP rewrite flush --hard

$WP plugin is-installed woocommerce >/dev/null 2>&1 || $WP plugin install woocommerce --activate
$WP plugin is-active woocommerce >/dev/null 2>&1 || $WP plugin activate woocommerce
$WP plugin activate bsa-gate-woo

# WooCommerce onboarding / coming-soon gates
opt woocommerce_coming_soon "no"
opt woocommerce_store_pages_only "no"
opt woocommerce_onboarding_profile '{"skipped":true}' --format=json
opt woocommerce_task_list_hidden "yes"
opt woocommerce_allow_tracking "no"
opt woocommerce_currency "USD"
opt woocommerce_default_country "US:CA"
opt woocommerce_enable_guest_checkout "yes"

$WP wc tool run install_pages --user=admin || echo "   (install_pages non-fatal)"

# Classic checkout/cart — the block checkout does NOT fire woocommerce_receipt_<gateway>,
# which our order-pay wallet step relies on.
_C="$($WP option get woocommerce_checkout_page_id 2>/dev/null || echo '')"
[ -n "$_C" ] && $WP post update "$_C" --post_content='[woocommerce_checkout]' >/dev/null 2>&1 || true
_K="$($WP option get woocommerce_cart_page_id 2>/dev/null || echo '')"
[ -n "$_K" ] && $WP post update "$_K" --post_content='[woocommerce_cart]' >/dev/null 2>&1 || true

echo "==> writing BSA Gate gateway settings..."
$WP option update woocommerce_bsagate_settings --format=json '{"enabled":"yes","title":"USDC (Ethereum)","description":"Pay with USDC on Ethereum via your wallet.","facilitator_url":"http://host.docker.internal:8787","chain_id":"11155111","usdc":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","usdc_name":"USDC","usdc_version":"2","merchant":"0x9B49d993499d8bB15D7c0f4dc6214380B0Cbf212","required_attestations":"{\"over18\":\"true\"}","explorer_url":"https://sepolia.etherscan.io/tx/"}'

create_product() {
  _existing="$($WP wc product list --user=admin --field=id --name="$1" --format=ids 2>/dev/null || echo '')"
  [ -n "$_existing" ] && { echo "   product '$1' exists ($_existing)"; return 0; }
  $WP wc product create --user=admin --name="$1" --type=simple --regular_price="$2" --status=publish --virtual=true >/dev/null
  echo "   created '$1' @ $2"
}
create_product "18+ Trading Signals" "19.99"

$WP option update bsagate_demo_seeded "1"
cat <<'BANNER'

============================================================
  BSA GATE WOOCOMMERCE DEMO — READY
  Storefront : http://localhost:8090/shop/
  Admin      : http://localhost:8090/wp-admin/ (admin / admin_pass)
  Product    : "18+ Trading Signals" $19.99 (requires over18=true)
  Pay method : "USDC (Ethereum)" — connect MetaMask on the order-pay page.
  (Facilitator must run on the host at :8787 with alice issued.)
============================================================
BANNER
