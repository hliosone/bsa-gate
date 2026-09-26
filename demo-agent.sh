#!/bin/sh
# Live agent demo for the video: the agent pays over x402 (settles), then is blocked over
# its spend cap, then blocked by Intercepta on a sanctioned address.
#
# Use YOUR delegated agent:   sh demo-agent.sh agent.<your-handle>.bsagate.eth
# Or the default demo agent:  sh demo-agent.sh
cd "$(dirname "$0")" || exit 1
set -a; . ./.env; set +a
PAY_NAME="${1:-}" RPC_MODE=live pnpm --filter @bsa/facilitator demo:agent
