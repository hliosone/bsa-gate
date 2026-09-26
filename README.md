# BSA Gate

**A compliance-and-safety checkpoint for stablecoin payments — for online stores and AI agents.**
Before any USDC payment settles, one facilitator gate checks **who may pay** (ENSv2 permissions
and attestations) and **whether it's safe** (Intercepta screening), then settles on Ethereum
(Sepolia) over **x402 / EIP-3009** (gasless for the payer).

> ETHGlobal Tokyo 2026 · targets **ENS — Best Use of ENSv2** and **Intercepta — Safe Agent-to-Agent Payments with x402**.

Remove ENSv2 and the product stops working: identity issuance, the attestations that gate a
payment, agent delegation, spend caps, and revocation all live in ENSv2.

## Live demo

- **Web app:** https://bsa-gate.vercel.app — checkout, judge self-serve verification, live activity feed
- **Facilitator gate:** https://bsa-gate-production.up.railway.app — [`/health`](https://bsa-gate-production.up.railway.app/health) (real Sepolia + Intercepta, `mode=live`)

Both are public. The web app calls the live facilitator; free eligibility checks (`/verify`) run the
full ENS walk + Intercepta screening without moving any USDC.

---

## Architecture

Every surface — an AI agent hitting an x402 API, a WooCommerce checkout, a Shopify checkout, or
the web checkout — speaks to **one facilitator gate**. The gate runs four ordered checks and only
then moves money:

```
  AI agent ─┐
 WooCommerce ├──▶  FACILITATOR GATE ──▶  USDC moves (Sepolia)
  Shopify   ┤        1 verify EIP-3009 signature (amount, recipient, replay)
  web       ┘        2 ENS      — payer owns a valid *.bsagate.eth name,
                                  its identity carries the required attestations,
                                  and the payment is within the agent's spend cap
                     3 Intercepta — screen payer + payee for sanctions / scam / mixer
                     4 settle    — transferWithAuthorization; USDC payer → merchant
                     (fails at the first check with a precise reason; no money moves)
```

**Identity is a tree of ENSv2 registries, not a database:**

```
Root registry (bsagate.eth)         ── admin: issuer (all root roles)
 ├─ alice  → owner alice, RENEW ─────▶ Alice's registry
 │                                      └─ agent → owner agentWallet, no roles
 │                                         (alice holds UNREGISTER = kill switch)
 └─ bob    → owner bob,   RENEW
Shared resolver ── records (over18, jurisdiction) writable ONLY by the issuer
```

- **No database.** The facilitator keeps two small JSON files (`deployments.json` = namespace +
  issued users + agent caps, `transactions.json` = the log). The source of truth for identity is
  on-chain. WordPress uses its own MySQL; Shopify uses its hosted store.

### Components

| Path | What it does | Tech |
|---|---|---|
| `packages/ens` | ENSv2 ops: deploy registry/resolver (via VerifiableFactory), register names, grant roles, write/read attestations, walk registries | TypeScript · viem |
| `packages/facilitator` | the gate: `eip3009` (settle), `ensGate` (permission walk), `intercepta` (screen), `policy` (spend cap), `gate` (pipeline), `server` (HTTP API), `txlog` | TypeScript · viem · Express |
| `apps/agent` | autonomous x402 client (agent-to-agent payment) | TypeScript |
| `apps/web` | Next.js app: landing, checkout, issuer console (issue / delegate / sign a cap), live activity feed | Next.js · viem |
| `plugins/woocommerce` | "Pay with USDC" gateway + REST settle + **per-product attestations** | PHP · WordPress |
| `plugins/shopify` | hosted pay page + Admin API write-back + **per-product attestations** | Node · Express |

---

## How ENSv2 is load-bearing

- BSA Gate is the **attestation authority**. We deploy a root registry for `bsagate.eth` and a
  shared resolver; the **issuer is the admin** of both.
- After KYC we give a principal their **own `UserRegistry`** and register `alice.bsagate.eth` to
  them with **`RENEW` only** — no `SET_RESOLVER`, no sub-minting, no transfer.
- Attestations (`over18`, `jurisdiction`) are resolver records **only the issuer can write** (the
  issuer is the resolver admin; the user holds no resolver role) — the owner **cannot forge** them.
- **Per-key delegation** (`authorizeTextRoles`): the finest-grained EAC — an account can be scoped to
  write a *single* record key (e.g. only `over18`) and nothing else. Proven by test.
- The principal delegates a **non-transferable, revocable** agent `agent.alice.bsagate.eth`
  (`roleBitmap = 0`); the agent **inherits** the principal's attestations by living under their
  name, and the principal holds **`ROLE_UNREGISTER`** = an on-chain kill switch.
- The facilitator **walks the registries** (`getState` / `getSubregistry`) — an unregistered name
  served a default record can never pass.

Addresses come from `@ensdomains/ensjs` (`sepolia-fix`, the post-2026-09-15 redeploy). See
`packages/facilitator/src/ensGate.ts` and `packages/ens/src/ens.ts`.

## Per-agent spend cap (principal-signed)

A principal caps how much their agent may spend **per payment**. Because ENS roles are per-name,
not per-amount, the cap is **facilitator policy** — but a cap change requires a **principal EIP-712
signature** (`SetCap`), so the agent can never raise its own. See `packages/facilitator/src/policy.ts`.

## Safety screening (Intercepta / Web3 Antivirus)

Before settling, the gate calls Intercepta's `quick-scan-address` for the payer and payee. It flags
`sanction_address` / `known_scammer` / `blacklist` / `mixer_transfers` or a toxicScore ≥ 40 and
**fails closed**. Data is mainnet (no testnet chain), which is correct: we screen the address's
reputation. Set `INTERCEPTA_API_KEY` for live screening. See `packages/facilitator/src/intercepta.ts`.

---

## How a merchant configures the gate (per product)

A merchant sets **which attestations a product requires**, as JSON — the gate then requires *every*
key. So `{"over18":"true"}` = 18+ only, `{"jurisdiction":"CH"}` = Swiss only, both = both.

- **WooCommerce**: product edit page → **Product data → General → "BSA Gate — required
  attestations (JSON)"** (per product). Blank falls back to the gateway default in
  WooCommerce → Settings → Payments → **USDC (Ethereum)**.
- **Shopify**: a product **metafield** `bsagate.attestations` (per product). Falls back to the pay
  service's `REQUIRED_ATTESTATIONS` env.

---

## Run it (fork = free)

```bash
pnpm install
cp .env.example .env                 # fill the 5 role keys (issuer, alice, agent, merchant, bob)
anvil --fork-url <sepolia-rpc>       # a local fork of Sepolia

pnpm test                            # 29 tests: ENS (7) + gate (10) + policy (12), all on the fork

RPC_MODE=fork PORT=8787 pnpm --filter @bsa/facilitator start
sh packages/facilitator/scripts/fork-setup.sh   # deploy namespace + issue alice/agent/bob
RPC_MODE=fork PAY_AS=agent pnpm --filter @bsa/agent pay   # agent pays an x402 endpoint
```

Set `RPC_MODE=live` to run against real Sepolia (Circle USDC `0x1c7D…7238`, EIP-3009). The
WooCommerce demo lives in `wc-demo/` (Docker); the Shopify service in `plugins/shopify/`.

Tip: the public fork RPC prunes state after ~25 min — if reads start failing, re-fork and re-run
`fork-setup.sh` (details in that script's header).

---

## Proven live on Sepolia (with the real Intercepta API)

The full flow — including real Intercepta screening — ran on **real Sepolia**:

- **WooCommerce** order settled 0.10 USDC through the gate: [`0xdc4be8…`](https://sepolia.etherscan.io/tx/0xdc4be85eb961ac21bdf617af39a35ed2ad76a602e69d32642fbfb80143807577)
- **Shopify** order marked paid via the Admin API: [`0x4d6581…`](https://sepolia.etherscan.io/tx/0x4d65815fa1ca466cb7448634bbb62e8e6e393158b9868168ac5ddf3a0fc13242)
- **Per-product** rule enforced live on both surfaces (WooCommerce `0xbaaec1…`, Shopify `0xc536ab…`)
- **Every refusal run live**: not 18+, wrong jurisdiction (CH vs FR), over the spend cap, and a real
  OFAC-sanctioned payee (Intercepta toxicScore 100) — each blocked with the exact reason.

## Status

ENS layer ✓ (incl. per-key `authorizeTextRoles` ✓) · facilitator gate ✓ (**29/29 tests**) ·
principal-signed spend cap ✓ · agent revocation ✓ · agent a2a proven live ✓ · **live Intercepta
screening ✓** · WooCommerce plugin ✓ (per-product ✓) · Shopify service ✓ (per-product ✓) · Next.js
web app: live activity feed with block reasons + **judge self-serve verification** ✓ · **settled live on Sepolia ✓**.

**Deployed:** facilitator on Railway (Dockerfile) + web app on Vercel — both public (see **Live demo** above),
gate proven live from the cloud (agent climb-the-ladder pass + refusals). **Left (packaging):** the demo video.

## Open-source libraries
viem, `@ensdomains/ensjs` + `@ensdomains/ensjs-abi` (sepolia-fix), express, dotenv, vitest, tsx, Next.js.
