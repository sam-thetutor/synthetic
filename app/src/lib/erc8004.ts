import { getEnvConfig } from "./env";

// ERC-8004 IdentityRegistry ABI (minimal for register + setAgentURI)
const IDENTITY_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "setAgentURI",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "agentURI", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "getAgentURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// Celo Mainnet IdentityRegistry
const IDENTITY_REGISTRY_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as `0x${string}`;

export { IDENTITY_REGISTRY_ABI, IDENTITY_REGISTRY_ADDRESS };

export async function registerAgent(agentURI: string): Promise<{
  agentId: string;
  txHash: string;
}> {
  // Dynamic import to avoid issues with viem in different contexts
  const { createWalletClient, createPublicClient, http } = await import("viem");
  const { celo } = await import("viem/chains");
  const { privateKeyToAccount } = await import("viem/accounts");

  const config = getEnvConfig();
  const account = privateKeyToAccount(config.operatorPrivateKey);

  const walletClient = createWalletClient({
    account,
    chain: celo,
    transport: http(config.celoRpcUrl),
  });

  const publicClient = createPublicClient({
    chain: celo,
    transport: http(config.celoRpcUrl),
  });

  // Send register transaction
  const txHash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [agentURI],
  });

  // Wait for receipt to get the agentId from logs
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // The agentId is emitted in the Transfer event (ERC-721)
  // Topic[0] = Transfer event signature, Topic[3] = tokenId
  let agentId = "0";
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === IDENTITY_REGISTRY_ADDRESS.toLowerCase() && log.topics.length >= 4) {
      // tokenId is the 4th topic (index 3)
      agentId = BigInt(log.topics[3]!).toString();
      break;
    }
  }

  return {
    agentId: `42220:${agentId}`,
    txHash,
  };
}
