import { createPublicClient, http, pad } from "viem";
import { celo } from "viem/chains";

// Self Agent Registry on Celo Mainnet (EIP-1967 proxy)
const SELF_AGENT_REGISTRY = "0xaC3DF9ABf80d0F5c020C06B04Cced27763355944" as const;

// Correct ABI matching the actual deployed contract
const REGISTRY_ABI = [
  {
    name: "isVerifiedAgent",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentPubKey", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getAgentId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentPubKey", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "hasHumanProof",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getHumanNullifier",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getAgentCountForHuman",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "proofExpiresAt",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isProofFresh",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "agentRegisteredAt",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getAgentsForNullifier",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "uint256" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
] as const;

const client = createPublicClient({
  chain: celo,
  transport: http("https://forno.celo.org"),
});

/**
 * Check if an address is a verified Self agent on-chain.
 * The registry uses bytes32 keys = zeroPadValue(address, 32).
 */
export async function checkSelfAgentOnChain(agentAddress: `0x${string}`): Promise<{
  isVerified: boolean;
  agentId: string;
  hasHumanProof: boolean;
  isProofFresh: boolean;
  proofExpiresAt: string | null;
  owner: string | null;
}> {
  const agentKey = pad(agentAddress, { size: 32 });

  try {
    const isVerified = await client.readContract({
      address: SELF_AGENT_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "isVerifiedAgent",
      args: [agentKey],
    });

    if (!isVerified) {
      return { isVerified: false, agentId: "0", hasHumanProof: false, isProofFresh: false, proofExpiresAt: null, owner: null };
    }

    const agentId = await client.readContract({
      address: SELF_AGENT_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "getAgentId",
      args: [agentKey],
    });

    const humanProof = await client.readContract({
      address: SELF_AGENT_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "hasHumanProof",
      args: [agentId],
    });

    const proofFresh = await client.readContract({
      address: SELF_AGENT_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "isProofFresh",
      args: [agentId],
    });

    const expiresAt = await client.readContract({
      address: SELF_AGENT_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "proofExpiresAt",
      args: [agentId],
    });

    const owner = await client.readContract({
      address: SELF_AGENT_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    });

    return {
      isVerified: true,
      agentId: agentId.toString(),
      hasHumanProof: humanProof,
      isProofFresh: proofFresh,
      proofExpiresAt: new Date(Number(expiresAt) * 1000).toISOString(),
      owner,
    };
  } catch {
    return { isVerified: false, agentId: "0", hasHumanProof: false, isProofFresh: false, proofExpiresAt: null, owner: null };
  }
}

