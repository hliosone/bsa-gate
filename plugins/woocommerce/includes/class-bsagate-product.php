<?php
/**
 * Per-product BSA Gate attestations.
 *
 * Adds a field on the product edit page (Product data -> General) so a merchant
 * sets "who may buy THIS product" as JSON, e.g. {"over18":"true","jurisdiction":"CH"}.
 * Stored as the `_bsagate_attestations` product meta and read per-order by the REST route.
 * Blank = fall back to the gateway default.
 *
 * @package BSAGateWoo
 */

defined( 'ABSPATH' ) || exit;

class BSAGate_Product {

	const META = '_bsagate_attestations';

	public static function init() {
		add_action( 'woocommerce_product_options_general_product_data', array( __CLASS__, 'field' ) );
		add_action( 'woocommerce_admin_process_product_object', array( __CLASS__, 'save' ) );
	}

	/** Render the JSON field in the product "General" tab. */
	public static function field() {
		woocommerce_wp_text_input(
			array(
				'id'          => self::META,
				'value'       => get_post_meta( get_the_ID(), self::META, true ),
				'label'       => __( 'BSA Gate required attestations (JSON)', 'bsa-gate-woo' ),
				'description' => __( 'Who may buy this product, as JSON, e.g. {"over18":"true","jurisdiction":"CH"}. Leave blank to use the payment method default.', 'bsa-gate-woo' ),
				'desc_tip'    => true,
				'placeholder' => '{"over18":"true"}',
			)
		);
	}

	/** Validate + store (WooCommerce verifies the product-edit nonce before this fires). */
	public static function save( $product ) {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- WC core checks the product nonce.
		$raw = isset( $_POST[ self::META ] ) ? trim( wp_unslash( (string) $_POST[ self::META ] ) ) : '';
		if ( '' === $raw ) {
			$product->delete_meta_data( self::META );
			return;
		}
		$decoded = json_decode( $raw, true );
		if ( is_array( $decoded ) ) {
			$product->update_meta_data( self::META, wp_json_encode( $decoded ) );
		}
	}
}
