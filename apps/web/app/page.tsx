import Activity from "./Activity";

// Real WooCommerce order settled through the gate, live on Sepolia.
const TX = "0xdc4be85eb961ac21bdf617af39a35ed2ad76a602e69d32642fbfb80143807577";

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="eyebrow rise"><span className="dot" />Live on Ethereum Sepolia</span>
        <h1 className="rise rise-2">Who may pay. <span className="grad">Whether it&rsquo;s safe.</span></h1>
        <p className="lede rise rise-2">
          BSA Gate is a checkpoint for stablecoin payments. Before any USDC settles, one gate checks the payer&rsquo;s
          on-chain permission with ENSv2 and screens the payment with Intercepta, then settles over x402. The same gate
          protects online stores and autonomous agents.
        </p>
        <div className="cta rise rise-3">
          <a className="btn" href="/checkout">Try the checkout</a>
          <a className="btn ghost" href="/agent">Open the agent console</a>
        </div>
      </section>

      <section>
        <p className="section-title">The gate — one pipeline</p>
        <div className="flow">
          <div className="step"><div className="n">01</div><b>Verify</b><span>the gasless EIP-3009 authorization</span></div>
          <div className="step ens"><div className="n">02</div><b>ENS</b><span>owns a valid bsagate.eth name with the required attestations, within the agent&rsquo;s cap</span></div>
          <div className="step itc"><div className="n">03</div><b>Screen</b><span>payer and payee checked for risk with Intercepta</span></div>
          <div className="step"><div className="n">04</div><b>Settle</b><span>USDC moves from payer to merchant</span></div>
        </div>
      </section>

      <Activity />

      <section>
        <p className="section-title">Explore</p>
        <div className="grid cols-3">
          <a className="card lift" href="/checkout">
            <h3>Checkout demo</h3>
            <p>Pay a gated resource with USDC. Eligible identities pass; others are blocked with a reason.</p>
            <span className="btn sm">Pay 0.01 USDC →</span>
          </a>
          <a className="card lift" href="/agent">
            <h3>Agent console</h3>
            <p>Issue an identity, delegate a revocable agent, and set its per-payment spend cap.</p>
            <span className="btn sm ghost">Manage →</span>
          </a>
          <a className="card lift" href={`https://sepolia.etherscan.io/tx/${TX}`} target="_blank" rel="noreferrer">
            <h3>On-chain proof</h3>
            <p>A real WooCommerce order settled USDC through the gate, live on Sepolia.</p>
            <span className="btn sm ghost">View on Etherscan →</span>
          </a>
        </div>
      </section>
    </>
  );
}
