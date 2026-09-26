<?php
/**
 * Thin HTTP client for the BSA Gate facilitator.
 *
 * @package BSAGateWoo
 */

defined( 'ABSPATH' ) || exit;

class BSAGate_Facilitator {

	/** @var string */
	private $base;

	public function __construct( $base_url ) {
		$this->base = rtrim( (string) $base_url, '/' );
	}

	/**
	 * POST /settle { payload, requirements } -> { ok, stage, reasons[], txHash, identityName }.
	 *
	 * @param array $payload      { ensName, authorization }.
	 * @param array $requirements { chainId, token, payTo, amount, requiredAttestations, maxAmount? }.
	 * @return array
	 */
	public function settle( array $payload, array $requirements ) {
		$res = wp_remote_post(
			$this->base . '/settle',
			array(
				'timeout' => 90,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'payload'      => $payload,
						'requirements' => $requirements,
					)
				),
			)
		);

		if ( is_wp_error( $res ) ) {
			return array( 'ok' => false, 'reasons' => array( $res->get_error_message() ) );
		}

		$body = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! is_array( $body ) ) {
			return array( 'ok' => false, 'reasons' => array( 'Invalid facilitator response.' ) );
		}
		return $body;
	}
}
