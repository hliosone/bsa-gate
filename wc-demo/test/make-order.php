<?php
// wp eval-file: create a guest BSA Gate order for the first published product.
$products = wc_get_products( array( 'limit' => 1, 'status' => 'publish' ) );
if ( empty( $products ) ) { echo "NO_PRODUCT\n"; exit( 1 ); }
$p     = $products[0];
$order = wc_create_order();
$order->add_product( $p, 1 );
$order->set_payment_method( 'bsagate' );
$order->calculate_totals();
$order->update_status( 'pending' );
$order->save();
echo 'ORDER_ID=' . $order->get_id() . "\n";
echo 'ORDER_KEY=' . $order->get_order_key() . "\n";
echo 'TOTAL=' . $order->get_total() . "\n";
