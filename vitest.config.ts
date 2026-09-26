import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests share on-chain accounts (issuer) on one fork; run files serially to
    // avoid nonce races. Deploys/registers are fast on Anvil but need headroom.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
