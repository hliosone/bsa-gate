<?php
/**
 * BSA Gate classic WooCommerce payment gateway (USDC on Ethereum via EIP-3009).
 *
 * process_payment() only redirects to the order-pay page; the wallet connect /
 * sign / server-side settle flow runs there (assets/js/order-pay.js).
 *
 * @package BSAGateWoo
 */

defined( 'ABSPATH' ) || exit;

class WC_Gateway_BSAGate extends WC_Payment_Gateway {

	public function __construct() {
		$this->id                 = 'bsagate';
		$this->method_title       = __( 'BSA Gate (USDC on Ethereum)', 'bsa-gate-woo' );
		$this->method_description = __( 'Compliance-gated USDC payments. The shopper connects an EVM wallet and signs a gasless EIP-3009 authorization; BSA Gate runs the ENS + Intercepta gate and settles server-side.', 'bsa-gate-woo' );
		$this->has_fields         = true;
		$this->supports           = array( 'products' );

		$this->init_form_fields();
		$this->init_settings();
		$this->enabled     = $this->get_option( 'enabled' );
		$this->title       = $this->get_option( 'title' );
		$this->description = $this->get_option( 'description' );

		add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
		add_action( 'woocommerce_receipt_' . $this->id, array( $this, 'receipt_page' ) );
	}

	public function init_form_fields() {
		$this->form_fields = array(
			'enabled'               => array(
				'title'   => __( 'Enable/Disable', 'bsa-gate-woo' ),
				'type'    => 'checkbox',
				'label'   => __( 'Enable BSA Gate USDC payments', 'bsa-gate-woo' ),
				'default' => 'no',
			),
			'title'                 => array(
				'title'   => __( 'Title', 'bsa-gate-woo' ),
				'type'    => 'text',
				'default' => __( 'USDC (Ethereum)', 'bsa-gate-woo' ),
			),
			'description'           => array(
				'title'   => __( 'Description', 'bsa-gate-woo' ),
				'type'    => 'textarea',
				'default' => __( 'Pay with USDC. You will connect your wallet and confirm on the next page.', 'bsa-gate-woo' ),
			),
			'facilitator_url'       => array(
				'title'       => __( 'Facilitator URL', 'bsa-gate-woo' ),
				'type'        => 'text',
				'description' => __( 'Base URL of the BSA Gate facilitator.', 'bsa-gate-woo' ),
				'default'     => 'http://localhost:8787',
			),
			'chain_id'              => array(
				'title'   => __( 'Chain ID', 'bsa-gate-woo' ),
				'type'    => 'number',
				'default' => '11155111',
			),
			'usdc'                  => array(
				'title'   => __( 'USDC token address', 'bsa-gate-woo' ),
				'type'    => 'text',
				'default' => '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
			),
			'usdc_name'             => array(
				'title'   => __( 'USDC EIP-712 name', 'bsa-gate-woo' ),
				'type'    => 'text',
				'default' => 'USDC',
			),
			'usdc_version'          => array(
				'title'   => __( 'USDC EIP-712 version', 'bsa-gate-woo' ),
				'type'    => 'text',
				'default' => '2',
			),
			'merchant'              => array(
				'title'       => __( 'Merchant address (pay-to)', 'bsa-gate-woo' ),
				'type'        => 'text',
				'description' => __( 'Your 0x address that receives USDC.', 'bsa-gate-woo' ),
				'default'     => '',
				'placeholder' => '0x...',
			),
			'required_attestations' => array(
				'title'       => __( 'Required attestations (JSON)', 'bsa-gate-woo' ),
				'type'        => 'textarea',
				'description' => __( 'ENS attestations the payer must carry, e.g. {"over18":"true","jurisdiction":"CH"}.', 'bsa-gate-woo' ),
				'default'     => '{"over18":"true"}',
			),
			'explorer_url'          => array(
				'title'   => __( 'Explorer tx URL prefix', 'bsa-gate-woo' ),
				'type'    => 'text',
				'default' => 'https://sepolia.etherscan.io/tx/',
			),
		);
	}

	public function payment_fields() {
		if ( $this->description ) {
			echo wp_kses_post( wpautop( wptexturize( $this->description ) ) );
		}
	}

	public function is_available() {
		return 'yes' === $this->enabled && '' !== trim( (string) $this->get_option( 'merchant' ) );
	}

	public function process_payment( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wc_add_notice( __( 'Unable to load your order.', 'bsa-gate-woo' ), 'error' );
			return array( 'result' => 'failure' );
		}
		$order->update_status( 'pending', __( 'Awaiting BSA Gate USDC payment.', 'bsa-gate-woo' ) );
		$order->save();
		return array( 'result' => 'success', 'redirect' => $order->get_checkout_payment_url( true ) );
	}

	public function receipt_page( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}

		wp_enqueue_style( 'bsagate', BSAGATE_URL . 'assets/css/bsa-gate.css', array(), BSAGATE_VERSION );
		wp_enqueue_script( 'bsagate-order-pay', BSAGATE_URL . 'assets/js/order-pay.js', array(), BSAGATE_VERSION, true );

		$usdc  = (string) $this->get_option( 'usdc' );
		$chain = (int) $this->get_option( 'chain_id' );
		// USD total → USDC base units (6 dp).
		$units = (string) (int) round( ( (float) $order->get_total() ) * 1000000 );

		wp_localize_script(
			'bsagate-order-pay',
			'BSAGATE_PAY',
			array(
				'restUrl'         => rest_url( 'bsagate/v1/' ),
				'nonce'           => wp_create_nonce( 'wp_rest' ),
				'orderId'         => $order->get_id(),
				'orderKey'        => $order->get_order_key(),
				'chainId'         => $chain,
				'usdc'            => $usdc,
				'payTo'           => (string) $this->get_option( 'merchant' ),
				'amountBaseUnits' => $units,
				'domain'          => array(
					'name'              => (string) $this->get_option( 'usdc_name' ),
					'version'           => (string) $this->get_option( 'usdc_version' ),
					'chainId'           => $chain,
					'verifyingContract' => $usdc,
				),
				'thankYouUrl'     => $order->get_checkout_order_received_url(),
				'explorerTxUrl'   => (string) $this->get_option( 'explorer_url' ),
			)
		);

		echo '<div id="bsagate-pay" class="bsagate-order-pay"></div>';
		echo '<noscript><p>' . esc_html__( 'JavaScript is required to pay with USDC.', 'bsa-gate-woo' ) . '</p></noscript>';
	}

	public static function get_setting( $key, $default = '' ) {
		$settings = get_option( 'woocommerce_bsagate_settings', array() );
		return is_array( $settings ) && isset( $settings[ $key ] ) ? (string) $settings[ $key ] : $default;
	}
}
