<?php
/**
 * Plugin Name: BSA Gate for WooCommerce
 * Description: Accept compliance-gated USDC payments on Ethereum via BSA Gate. The shopper connects an EVM wallet (MetaMask) and signs a gasless EIP-3009 authorization on the order-pay page; the BSA Gate facilitator runs the ENS + Intercepta gate and settles server-side.
 * Version:     0.1.0
 * Author:      BSA Gate
 * Requires PHP: 7.4
 * WC requires at least: 8.0
 * Text Domain: bsa-gate-woo
 *
 * @package BSAGateWoo
 */

defined( 'ABSPATH' ) || exit;

define( 'BSAGATE_VERSION', '0.1.0' );
define( 'BSAGATE_FILE', __FILE__ );
define( 'BSAGATE_DIR', plugin_dir_path( __FILE__ ) );
define( 'BSAGATE_URL', plugin_dir_url( __FILE__ ) );

// Bail (with notice) if WooCommerce is not active, and wire up REST routes.
add_action(
	'plugins_loaded',
	static function () {
		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action(
				'admin_notices',
				static function () {
					echo '<div class="notice notice-error"><p>' .
						esc_html__( 'BSA Gate for WooCommerce requires WooCommerce.', 'bsa-gate-woo' ) .
						'</p></div>';
				}
			);
			return;
		}
		require_once BSAGATE_DIR . 'includes/class-bsagate-facilitator.php';
		require_once BSAGATE_DIR . 'includes/class-bsagate-rest.php';
		BSAGate_REST::init();
			require_once BSAGATE_DIR . 'includes/class-bsagate-product.php';
			BSAGate_Product::init();
	},
	5
);

// HPOS (custom order tables) compatibility.
add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', BSAGATE_FILE, true );
		}
	}
);

// Register the classic gateway.
add_action(
	'plugins_loaded',
	static function () {
		if ( class_exists( 'WC_Payment_Gateway' ) ) {
			require_once BSAGATE_DIR . 'includes/class-bsagate-gateway.php';
		}
	},
	10
);
add_filter(
	'woocommerce_payment_gateways',
	static function ( $gateways ) {
		$gateways[] = 'WC_Gateway_BSAGate';
		return $gateways;
	}
);
