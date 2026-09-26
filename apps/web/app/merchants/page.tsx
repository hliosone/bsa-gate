const REPO = "https://github.com/hliosone/bsa-gate";

export default function Merchants() {
  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <p className="section-title">For merchants</p>
        <h2>Accept USDC, pre-checked at the gate</h2>
        <p className="lede" style={{ fontSize: 17 }}>
          BSA Gate is a drop-in payment method for your store. Customers pay in USDC, and every payment reaches you
          already checked: the payer proved who they are with ENS, and Intercepta screened the transaction for
          sanctions, scams and mixers. You decide what each product requires.
        </p>
      </section>

      <section style={{ paddingTop: 8 }}>
        <p className="section-title">How you add it</p>
        <div className="grid cols-3">
          <div className="card">
            <span className="stepno">1</span>
            <h3>Install</h3>
            <p>Add the WooCommerce plugin to your WordPress store, or run the Shopify pay service for your Shopify
              store. Both call the same BSA Gate facilitator.</p>
          </div>
          <div className="card">
            <span className="stepno">2</span>
            <h3>Point it at the gate</h3>
            <p>Set the facilitator URL and the address you want to be paid at. Nothing else to run: the gate verifies,
              screens and settles.</p>
          </div>
          <div className="card">
            <span className="stepno">3</span>
            <h3>Set product rules</h3>
            <p>On each product, choose the attestations it requires. The rule lives on the product, so different items
              can have different requirements.</p>
          </div>
        </div>
      </section>

      <section>
        <p className="section-title">The key idea</p>
        <h2>Requirements live on the product</h2>
        <p className="lede" style={{ fontSize: 16 }}>
          You do not gate the whole store the same way. A bottle of wine can require <span className="mono">over18=true</span>,
          a regulated product can require <span className="mono">jurisdiction=CH</span>, and everything else stays open.
          The gate reads the rule for the exact items in the cart and enforces it before any USDC moves.
        </p>
      </section>

      <section>
        <p className="section-title">Platforms</p>
        <div className="grid cols-2">
          <div className="card">
            <h3>WooCommerce (WordPress)</h3>
            <p>A real WordPress plugin. It adds a &ldquo;Pay with USDC (BSA Gate)&rdquo; checkout method and a{" "}
              <b>required attestations</b> field on every product, stored as <span className="mono">_bsagate_attestations</span>.
              A store-wide default covers products with no rule of their own.</p>
            <div className="cta-row">
              <a className="btn sm ghost" href={`${REPO}/tree/main/plugins/woocommerce`} target="_blank" rel="noreferrer">Plugin source</a>
            </div>
          </div>
          <div className="card">
            <h3>Shopify</h3>
            <p>A hosted pay service, not an installable Shopify app. It creates a draft order, runs the payment through
              the gate, then marks the order paid through the Admin API and stamps the settlement transaction on it.
              Per-product rules come from a <span className="mono">bsagate.attestations</span> metafield.</p>
            <div className="cta-row">
              <a className="btn sm ghost" href={`${REPO}/tree/main/plugins/shopify`} target="_blank" rel="noreferrer">Service source</a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="note">
          <b>Status.</b> Both integrations are built and were proven live on Sepolia: a real WooCommerce order and a real
          Shopify order settled USDC through the gate, each with per-product rules enforced. In this demo the stores run
          against our test shops. The full code is open source at{" "}
          <a href={REPO} target="_blank" rel="noreferrer">github.com/hliosone/bsa-gate</a>.
        </div>
      </section>
    </>
  );
}
