const TX = "0xd41740ca56f63962af775c0077a6cf910fa1b62059794d92fe0098601ab43b5f";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Who may pay. Whether it&rsquo;s safe.</h1>
        <p className="lede">
          BSA Gate is a checkpoint for stablecoin payments. Before any USDC settles, one gate checks the
          payer&rsquo;s on-chain permission (ENSv2) and screens the payment (Intercepta) — then settles on
          Ethereum via x402 / EIP-3009. It works for online stores and for AI agents.
        </p>
      </section>

      <h2>The gate</h2>
      <ol className="steps">
        <li><b>Verify</b> the gasless EIP-3009 authorization.</li>
        <li><b>ENS</b> — the payer owns a valid <span className="mono">bsagate.eth</span> name whose identity carries the required attestations, within their spend cap.</li>
        <li><b>Intercepta</b> — screen payer &amp; payee for sanctions / scam / mixer exposure.</li>
        <li><b>Settle</b> — USDC moves payer → merchant.</li>
      </ol>

      <div className="grid">
        <div className="card">
          <h3>Manage agent</h3>
          <p>Issue an on-chain identity and delegate a revocable, spend-capped agent.</p>
          <a className="btn" href="/agent">Open console</a>
        </div>
        <div className="card">
          <h3>Checkout demo</h3>
          <p>Pay a gated resource with USDC. Eligible identities pass; others are blocked with a reason.</p>
          <a className="btn" href="/checkout">Try it</a>
        </div>
        <div className="card">
          <h3>Live on Sepolia</h3>
          <p>A real EIP-3009 settlement, agent → merchant, through the gate.</p>
          <a className="btn ghost" href={`https://sepolia.etherscan.io/tx/${TX}`} target="_blank" rel="noreferrer">View tx</a>
        </div>
      </div>
    </>
  );
}
