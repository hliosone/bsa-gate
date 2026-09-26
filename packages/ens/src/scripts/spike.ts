/**
 * Phase-0 spike — step 0: read-only preflight.
 * Confirms the viem wiring, the chain, and each role's live ETH / USDC balance.
 * On-chain steps (register, deploy registry, grant roles) are added next.
 */
import { formatEther, formatUnits } from "viem";
import { ADDRESSES, CHAIN_ID, publicClient, account, type Role } from "../config";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ROLES: Role[] = ["issuer", "alice", "agent", "merchant", "bob"];

async function main() {
  const chainId = await publicClient.getChainId();
  console.log(`chain: ${chainId} (expected ${CHAIN_ID}) ${chainId === CHAIN_ID ? "OK" : "MISMATCH"}`);
  console.log("");
  for (const role of ROLES) {
    const address = account(role).address;
    const eth = await publicClient.getBalance({ address });
    const usdc = (await publicClient.readContract({
      address: ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
    console.log(
      `${role.padEnd(9)} ${address}  ${(+formatEther(eth)).toFixed(4)} ETH  ${(+formatUnits(usdc, 6)).toFixed(2)} USDC`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
