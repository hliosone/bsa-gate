<?php
/**
 * BSA Gate REST route: POST /wp-json/bsagate/v1/settle.
 *
 * SECURITY MODEL (do not weaken):
 *   - The browser sends ONLY { order_id, order_key, ens_name, authorization }.
 *   - PHP builds `requirements` 100% server-side from the order + gateway settings.
 *   - The facilitator re-verifies the signed authorization against those requirements
 *     (recipient, amount) and checks the payer owns `ens_name` + attestations.
 *   - The browser NEVER calls the facilitator directly.
 *
 * @package BSAGateWoo
 */

defined( 'ABSPATH' ) || exit;

class BSAGate_REST {

	const NS       = 'bsagate/v1';
	const LOCK_TTL = 120;
	const GENERIC_COMPLIANCE = 'This payment could not be approved. Please use a different wallet or contact the store.';

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes() {
		register_rest_route(
			self::NS,
			'/settle',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle_settle' ),
				'permission_callback' => array( __CLASS__, 'settle_permission' ),
			)
		);
	}

	public static function settle_permission( WP_REST_Request $request ) {
		$nonce = $request->get_header( 'X-WP-Nonce' );
		if ( ! $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new WP_Error( 'bsagate_nonce', 'Invalid security token.', array( 'status' => 403 ) );
		}
		$order = wc_get_order( absint( $request->get_param( 'order_id' ) ) );
		$key   = (string) $request->get_param( 'order_key' );
		if ( ! $order || ! hash_equals( (string) $order->get_order_key(), $key ) ) {
			return new WP_Error( 'bsagate_order', 'Order not found.', array( 'status' => 404 ) );
		}
		if ( 'bsagate' !== $order->get_payment_method() ) {
			return new WP_Error( 'bsagate_order', 'Not a BSA Gate order.', array( 'status' => 400 ) );
		}
		return true;
	}

	public static function handle_settle( WP_REST_Request $request ) {
		if ( function_exists( 'set_time_limit' ) ) {
			set_time_limit( 0 );
		}
		$order = wc_get_order( absint( $request->get_param( 'order_id' ) ) );
		if ( ! $order ) {
			return self::respond( array( 'paid' => false, 'error' => 'Order not found.' ) );
		}
		if ( $order->is_paid() ) {
			return self::respond(
				array(
					'paid'     => true,
					'tx_hash'  => (string) $order->get_meta( '_bsagate_tx' ),
					'redirect' => $order->get_checkout_order_received_url(),
				)
			);
		}
		if ( ! self::acquire_lock( $order->get_id() ) ) {
			return self::respond( array( 'paid' => false, 'error' => 'A settlement is already in progress. Please wait.' ) );
		}

		$ens_name = sanitize_text_field( (string) $request->get_param( 'ens_name' ) );
		$auth     = (array) $request->get_param( 'authorization' );
		if ( '' === $ens_name || empty( $auth['signature'] ) || empty( $auth['from'] ) ) {
			self::release_lock( $order->get_id() );
			return self::respond( array( 'paid' => false, 'error' => 'Missing signed authorization.' ) );
		}

		$s = self::settings();

		// requirements — built server-side, never from the client.
		$requirements = array(
			'chainId'              => (int) $s['chain_id'],
			'token'               => $s['usdc'],
			'payTo'               => $s['merchant'],
			'amount'              => (string) (int) round( ( (float) $order->get_total() ) * 1000000 ),
			'requiredAttestations' => self::parse_attestations( $s['required_attestations'] ),
		);

		// payload — pass the client-signed authorization + claimed ENS name through;
		// the facilitator validates the signature against `requirements`.
		$payload = array(
			'ensName'       => $ens_name,
			'authorization' => array(
				'from'        => sanitize_text_field( (string) ( $auth['from'] ?? '' ) ),
				'to'          => sanitize_text_field( (string) ( $auth['to'] ?? '' ) ),
				'value'       => (string) ( $auth['value'] ?? '' ),
				'validAfter'  => (string) ( $auth['validAfter'] ?? '0' ),
				'validBefore' => (string) ( $auth['validBefore'] ?? '0' ),
				'nonce'       => sanitize_text_field( (string) ( $auth['nonce'] ?? '' ) ),
				'signature'   => sanitize_text_field( (string) ( $auth['signature'] ?? '' ) ),
			),
		);

		$facilitator = new BSAGate_Facilitator( $s['facilitator_url'] );
		$result      = $facilitator->settle( $payload, $requirements );

		self::release_lock( $order->get_id() );

		if ( ! empty( $result['ok'] ) && ! empty( $result['txHash'] ) ) {
			$tx = sanitize_text_field( (string) $result['txHash'] );
			if ( ! $order->is_paid() ) {
				$order->payment_complete( $tx );
			}
			$order->update_meta_data( '_bsagate_tx', $tx );
			$order->update_meta_data( '_bsagate_from', sanitize_text_field( (string) $payload['authorization']['from'] ) );
			$order->add_order_note( sprintf( 'BSA Gate USDC payment settled. Tx: %s', $tx ) );
			$order->save();
			return self::respond(
				array(
					'paid'     => true,
					'tx_hash'  => $tx,
					'redirect' => $order->get_checkout_order_received_url(),
				)
			);
		}

		$stage   = isset( $result['stage'] ) ? (string) $result['stage'] : '';
		$reasons = isset( $result['reasons'] ) && is_array( $result['reasons'] ) ? implode( '; ', $result['reasons'] ) : '';
		$order->add_order_note( sprintf( 'BSA Gate rejected at %s: %s', $stage ? $stage : 'gate', $reasons ) );
		$order->save();

		return self::respond( array( 'paid' => false, 'error' => self::friendly( $stage, $reasons ) ) );
	}

	private static function friendly( $stage, $reasons ) {
		if ( 'intercepta' === $stage ) {
			return self::GENERIC_COMPLIANCE;
		}
		if ( 'ens' === $stage ) {
			return __( 'Your on-chain identity is not eligible for this purchase (missing an attestation, over a limit, or not registered).', 'bsa-gate-woo' );
		}
		if ( 'verify' === $stage ) {
			return __( 'The signed payment did not match this order. Please reconnect your wallet and try again.', 'bsa-gate-woo' );
		}
		return __( 'The payment could not be completed. Please try again.', 'bsa-gate-woo' );
	}

	private static function settings() {
		$o        = get_option( 'woocommerce_bsagate_settings', array() );
		$defaults = array(
			'facilitator_url'       => 'http://localhost:8787',
			'chain_id'              => '11155111',
			'usdc'                  => '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
			'merchant'              => '',
			'required_attestations' => '{"over18":"true"}',
		);
		return wp_parse_args( is_array( $o ) ? $o : array(), $defaults );
	}

	private static function parse_attestations( $raw ) {
		$decoded = json_decode( (string) $raw, true );
		if ( ! is_array( $decoded ) ) {
			return array();
		}
		$out = array();
		foreach ( $decoded as $k => $v ) {
			$out[ sanitize_text_field( (string) $k ) ] = sanitize_text_field( (string) $v );
		}
		return $out;
	}

	private static function lock_key( $id ) {
		return 'bsagate_settling_' . absint( $id );
	}
	private static function acquire_lock( $id ) {
		$key = self::lock_key( $id );
		if ( add_option( $key, time(), '', 'no' ) ) {
			return true;
		}
		$held = (int) get_option( $key, 0 );
		if ( $held && ( time() - $held ) >= self::LOCK_TTL ) {
			update_option( $key, time(), false );
			return true;
		}
		return false;
	}
	private static function release_lock( $id ) {
		delete_option( self::lock_key( $id ) );
	}
	private static function respond( $data ) {
		return new WP_REST_Response( $data, 200 );
	}
}
