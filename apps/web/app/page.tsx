import Activity from "./Activity";

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="eyebrow rise"><span className="dot" />Live on Ethereum Sepolia</span>
        <h1 className="rise rise-2">Who may pay. <span className="grad">Whether it&rsquo;s safe.</span></h1>
        <p className="lede rise rise-2">
          BSA Gate is a checkpoint for stablecoin payments. Before any USDC settles, one gate checks the payer&rsquo;s
          on-chain permission with ENSv2 and screens the payment with Intercepta, then settles over x402. The same gate
          protects online stores and autonomous AI agents.
        </p>
        <div className="cta rise rise-3">
          <a className="btn" href="/get-verified">Start here: get verified</a>
          <a className="btn ghost" href="#try">See the 3 steps</a>
        </div>
      </section>

      <section id="try">
        <p className="section-title">New here? Try it in 3 steps</p>
        <h2>Test the live gate yourself</h2>
        <p className="lede" style={{ fontSize: 17, marginBottom: 20 }}>
          You play the shopper. Give yourself an identity, take it to a checkout, and watch the gate decide. Steps 1 and
          2 are free (no USDC). Paying for real is optional.
        </p>
        <div className="grid cols-3">
          <div className="card">
            <span className="stepno">1</span>
            <h3>Get verified</h3>
            <p>Connect your wallet, pick your traits (over 18, country). The issuer mints you a{" "}
              <span className="mono">&lt;handle&gt;.bsagate.eth</span> identity. Only the issuer can write those
              attestations, so you cannot fake them.</p>
            <div className="cta-row"><a className="btn sm" href="/get-verified">Get verified</a></div>
          </div>
          <div className="card">
            <span className="stepno">2</span>
            <h3>Check out</h3>
            <p>Bring that identity to a gated checkout. &ldquo;Check eligibility&rdquo; runs the real ENS and Intercepta
              checks for free. Change what the merchant requires and watch it pass or block, with the reason.</p>
            <div className="cta-row"><a className="btn sm ghost" href="/checkout">Try the checkout</a></div>
          </div>
          <div className="card">
            <span className="stepno">3</span>
            <h3>Watch the feed</h3>
            <p>Every attempt, settled or blocked, shows up in the live activity feed below with the exact reason it
              passed or failed.</p>
            <div className="cta-row"><a className="btn sm ghost" href="#activity">See live activity</a></div>
          </div>
        </div>
        <div className="note">
          Want to go further? The <a href="/agent">agent console</a> lets you delegate a spend-capped, revocable AI agent
          to your identity, so it can pay on your behalf within limits you set.
        </div>
      </section>

      <section>
        <p className="section-title">How it works</p>
        <h2>One gate, four checks</h2>
        <p className="lede" style={{ fontSize: 16, marginBottom: 14 }}>
          Every payment, from a shopper or an AI agent, runs the same four checks. It settles only if all four pass;
          otherwise it stops at the first failure and returns a clear reason. No money moves on a block.
        </p>
        <div className="flow">
          <div className="step"><div className="n">01</div><b>Verify</b><span>the gasless EIP-3009 payment authorization is real, correct and not reused</span></div>
          <div className="step ens"><div className="n">02</div><b>ENS</b><span>the payer owns a valid bsagate.eth name with the required attestations, within the agent&rsquo;s spend cap</span></div>
          <div className="step itc"><div className="n">03</div><b>Screen</b><span>payer and payee checked for sanctions, scams and mixers with Intercepta</span></div>
          <div className="step"><div className="n">04</div><b>Settle</b><span>USDC moves from payer to merchant, gasless for the payer</span></div>
        </div>
      </section>

      <Activity />

      <section>
        <p className="section-title">Who it&rsquo;s for</p>
        <h2>Two sides of one gate</h2>
        <div className="grid cols-2">
          <div className="card">
            <h3>Shoppers &amp; AI agents</h3>
            <p>Get verified once and pay anywhere that trusts BSA Gate. Your identity is portable and only the issuer can
              write it. Delegate an AI agent that inherits your identity, spends within a cap you set, and can be revoked
              on-chain at any time.</p>
            <div className="cta-row">
              <a className="btn sm" href="/get-verified">Get verified</a>
              <a className="btn sm ghost" href="/agent">Agent console</a>
            </div>
          </div>
          <div className="card">
            <h3>Merchants &amp; stores</h3>
            <p>Add a &ldquo;Pay with USDC&rdquo; method where every payment arrives already checked: the payer proved who
              they are, and Intercepta screened the transaction. Set the required attestations per product, so one item
              can require 18+ and another a jurisdiction.</p>
            <div className="cta-row"><a className="btn sm" href="/merchants">For merchants</a></div>
          </div>
        </div>
      </section>

      <section>
        <p className="section-title">Explore</p>
        <div className="grid cols-3">
          <a className="card lift" href="/get-verified">
            <h3>Get verified</h3>
            <p>Connect a wallet, pick your traits, and get issued an on-chain identity you own.</p>
            <span className="btn sm">Get verified</span>
          </a>
          <a className="card lift" href="/checkout">
            <h3>Checkout demo</h3>
            <p>Take your identity to a gated resource. Eligible identities pass; others are blocked with a reason.</p>
            <span className="btn sm ghost">Open checkout</span>
          </a>
          <a className="card lift" href="/agent">
            <h3>Agent console</h3>
            <p>Delegate a revocable AI agent to your identity and set its per-payment spend cap.</p>
            <span className="btn sm ghost">Manage agent</span>
          </a>
        </div>
      </section>
    </>
  );
}
