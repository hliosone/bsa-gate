# How it's made

_Living technical write-up — updated each phase._

## What it is
BSA Gate inserts one checkpoint before a stablecoin payment settles: it decides **who may pay**
(ENSv2 permissions) and **whether the payment is safe** (Intercepta), then settles USDC over x402.

## Architecture
One facilitator gate, two checks (ENS permission + Intercepta safety), multiple front doors
(an AI agent paying an x402 API, a WooCommerce checkout, a Shopify checkout).

## How ENSv2 is used (and why it's load-bearing)
_TBD — attestations as records only the issuer can write; revocable, capped agent delegation._

## How Intercepta is used
_TBD — screening payer / payee / token / authorization in the facilitator's verify step._

## x402 / EIP-3009 settlement
_TBD — 402 flow, transferWithAuthorization on Circle USDC (Sepolia)._

## Technologies
_TBD._

## Notable / hacky bits
_TBD._
