# BSA Gate

**A compliance-and-safety checkpoint for stablecoin payments — for online stores and AI agents.**
Before any USDC payment settles, the gate checks **who may pay** (ENSv2 permissions) and
**whether it's safe** (Intercepta screening), then settles on Ethereum (Sepolia) over x402 / EIP-3009.

> ETHGlobal Tokyo 2026 — work in progress.

## Stack
- **ENSv2** (Sepolia) — permissioned registry + resolver with per-key roles: the permission layer.
- **x402 + EIP-3009** (Circle USDC on Sepolia) — the payment rail.
- **Intercepta** (Web3 Antivirus) — payment risk screening in the facilitator.
- TypeScript, viem, Foundry, Next.js, pnpm workspaces.

## Open-source libraries used
viem, dotenv, vitest, tsx. (x402 libs, Next.js, wagmi added as those parts land — listed here for transparency.)

## Packages
- `packages/ens` — ENSv2 setup + spike (register names, resolver, scoped roles).
- _More added per phase: facilitator, agent, web, plugins._

## Getting started
```bash
pnpm install
cp .env.example .env   # fill in the 5 role keys
pnpm spike             # read-only preflight against Sepolia
```

## Status
Phase 0 — scaffold + ENS spike.
