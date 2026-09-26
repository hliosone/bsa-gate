# BSA Gate

**A compliance-and-safety checkpoint for stablecoin payments — for online stores and AI agents.**
Before any USDC payment settles, one facilitator gate checks **who may pay** (ENSv2 permissions)
and **whether it's safe** (Intercepta screening), then settles on Ethereum (Sepolia) over
x402 / EIP-3009.

> ETHGlobal Tokyo 2026 · targets **ENS – Best Use of ENSv2** and **Intercepta – Safe Agent-to-Agent Payments with x402**.

Remove ENSv2 and the product stops working: identity issuance, the attestations that gate a
payment, agent delegation, and revocation all live in ENSv2 permissions.

## The gate (one pipeline, every surface)

```
pay → [ 1 verify EIP-3009 ] → [ 2 ENS: own a valid name + attestations + cap ] → [ 3 Intercepta ] → [ 4 settle USDC ]
                                        ▲ ENS (who may pay)         ▲ Intercepta (is it safe)
```

An AI agent hitting an x402 API, a WooCommerce checkout, and a Shopify checkout all call the
same gate (`packages/facilitator/src/gate.ts`).

## How ENSv2 is load-bearing

- BSA Gate owns `bsagate.eth` and is the **attestation authority**.
- After KYC we issue a principal `alice.bsagate.eth` (their own `UserRegistry`), owned by them
  but registered **without `ROLE_SET_RESOLVER`/`SET_SUBREGISTRY`/`CAN_TRANSFER`**.
- Attestations (`over18`, `jurisdiction`) are resolver records **only the issuer can write** —
  the owner cannot forge them.
- The principal delegates a **non-transferable, revocable** agent `agent.alice.bsagate.eth`; the
  agent **inherits** the principal's attestations by living under their name, and the principal
  holds `ROLE_UNREGISTER` (on-chain kill switch). Spend cap is facilitator policy.
- The facilitator **walks the registries** (`getState`/`getSubregistry`) — an unregistered name
  served a default record can never pass.

Addresses are sourced from `@ensdomains/ensjs` (`sepolia-fix`), the post-2026-09-15 redeploy.

## Packages

| Path | What |
|---|---|
| `packages/ens` | ENSv2 ops (deploy/register/grant/attest/read) + fork tests |
| `packages/facilitator` | the gate: EIP-3009 settle · ENS gate · Intercepta · issuer flow · HTTP API · demo |
| `apps/agent` | autonomous x402 client (agent-to-agent) |
| `plugins/woocommerce` · `plugins/shopify` | drop-in "Pay with USDC" checkouts (same gate) |
| `apps/web` | minimal UI: verify · manage agent · checkout |

## Run it (fork = free)

```bash
pnpm install
cp .env.example .env                 # fill the 5 role keys
anvil --fork-url <sepolia-rpc>       # a local fork of Sepolia

pnpm test                            # ENS + gate suites (fork)
pnpm --filter @bsa/facilitator demo  # narrated end-to-end (1 settles, 3 blocked)

# HTTP + agent:
RPC_MODE=fork PORT=8787 pnpm --filter @bsa/facilitator start
curl -X POST localhost:8787/admin/setup
# ... /admin/issue, /admin/delegate ...
RPC_MODE=fork PAY_AS=agent pnpm --filter @bsa/agent pay
```

Set `RPC_MODE=live` to run against real Sepolia (uses Circle USDC `0x1c7D…7238`, EIP-3009).

## Open-source libraries
viem, `@ensdomains/ensjs` + `@ensdomains/ensjs-abi` (sepolia-fix), express, dotenv, vitest, tsx.

## Status
ENS layer ✓ · facilitator gate ✓ (10/10 tests) · HTTP API ✓ · agent a2a ✓ · demo ✓.
Commerce plugins + web UI + live-Sepolia pass: see `HOW_ITS_MADE.md`.
