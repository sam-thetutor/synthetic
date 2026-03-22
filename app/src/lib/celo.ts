import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, encodeFunctionData } from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getEnvConfig } from "./env";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export function getPublicClient() {
  const config = getEnvConfig();
  return createPublicClient({
    chain: celo,
    transport: http(config.celoRpcUrl),
  });
}

export function getWalletClient() {
  const config = getEnvConfig();
  const account = privateKeyToAccount(config.operatorPrivateKey);
  return createWalletClient({
    account,
    chain: celo,
    transport: http(config.celoRpcUrl),
  });
}

export function getWalletClientFromPrivateKey(privateKey: `0x${string}`) {
  const config = getEnvConfig();
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: celo,
    transport: http(config.celoRpcUrl),
  });
}

export function getOperatorAddress(): `0x${string}` {
  const config = getEnvConfig();
  const account = privateKeyToAccount(config.operatorPrivateKey);
  return account.address;
}

export async function getCeloBalance(address: `0x${string}`) {
  const client = getPublicClient();
  const balance = await client.getBalance({ address });
  return formatUnits(balance, 18);
}

export async function getCusdBalance(address: `0x${string}`) {
  const config = getEnvConfig();
  const client = getPublicClient();
  const balance = await client.readContract({
    address: config.cusdContractAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return formatUnits(balance, 18);
}

export async function getBlockNumber() {
  const client = getPublicClient();
  return client.getBlockNumber();
}

/**
 * Transfer cUSD from operator wallet to a recipient.
 * Returns the transaction hash.
 */
export async function transferCusd(
  to: `0x${string}`,
  amount: string
): Promise<{ txHash: string; amount: string; to: string; from: string }> {
  const config = getEnvConfig();
  return transferCusdFromPrivateKey(config.operatorPrivateKey, to, amount);
}

export async function transferCusdFromPrivateKey(
  privateKey: `0x${string}`,
  to: `0x${string}`,
  amount: string
): Promise<{ txHash: string; amount: string; to: string; from: string }> {
  const config = getEnvConfig();
  const walletClient = getWalletClientFromPrivateKey(privateKey);
  const publicClient = getPublicClient();

  const amountWei = parseUnits(amount, 18);

  const balance = await publicClient.readContract({
    address: config.cusdContractAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletClient.account.address],
  });

  if (balance < amountWei) {
    throw new Error(
      `Insufficient cUSD balance. Have: ${formatUnits(balance, 18)}, need: ${amount}`
    );
  }

  const txHash = await walletClient.writeContract({
    address: config.cusdContractAddress,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, amountWei],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    amount,
    to,
    from: walletClient.account.address,
  };
}

// ── Uniswap V3 Swap Infrastructure ──────────────────────────────────

const UNISWAP_SWAP_ROUTER = "0x5615CDAb10dc425a742d643d949a7F474C01abc4" as const;
const UNISWAP_QUOTER_V2 = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8" as const;

// Well-known tokens on Celo mainnet
export const CELO_TOKENS: Record<string, { address: `0x${string}`; decimals: number; name: string }> = {
  CELO:  { address: "0x471EcE3750Da237f93B8E339c536989b8978a438", decimals: 18, name: "Wrapped CELO" },
  cUSD:  { address: "0x765DE816845861e75A25fCA122bb6898B8B1282a", decimals: 18, name: "Celo Dollar" },
  USDC:  { address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6,  name: "USD Coin" },
  USDT:  { address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6,  name: "Tether USD" },
};

const SWAP_ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "multicall",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "deadline", type: "uint256" },
      { name: "data", type: "bytes[]" },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

const QUOTER_V2_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

function resolveToken(symbolOrAddress: string): { address: `0x${string}`; decimals: number; symbol: string } {
  const upper = symbolOrAddress.toUpperCase();
  if (CELO_TOKENS[upper]) {
    return { ...CELO_TOKENS[upper], symbol: upper };
  }
  // Treat as raw address — default to 18 decimals, caller can override
  if (symbolOrAddress.startsWith("0x") && symbolOrAddress.length === 42) {
    return { address: symbolOrAddress as `0x${string}`, decimals: 18, symbol: "UNKNOWN" };
  }
  throw new Error(`Unknown token: ${symbolOrAddress}. Supported: ${Object.keys(CELO_TOKENS).join(", ")}`);
}

/**
 * Get a swap quote from Uniswap V3 QuoterV2.
 * Returns the expected output amount as a human-readable string.
 */
export async function getSwapQuote(
  fromToken: string,
  toToken: string,
  amountIn: string,
  fee: number = 3000
): Promise<{ amountOut: string; fromSymbol: string; toSymbol: string; fee: number }> {
  const from = resolveToken(fromToken);
  const to = resolveToken(toToken);
  const client = getPublicClient();

  const amountInWei = parseUnits(amountIn, from.decimals);

  const result = await client.simulateContract({
    address: UNISWAP_QUOTER_V2,
    abi: QUOTER_V2_ABI,
    functionName: "quoteExactInputSingle",
    args: [{
      tokenIn: from.address,
      tokenOut: to.address,
      amountIn: amountInWei,
      fee,
      sqrtPriceLimitX96: BigInt(0),
    }],
  });

  const amountOut = formatUnits(result.result[0], to.decimals);

  return {
    amountOut,
    fromSymbol: from.symbol,
    toSymbol: to.symbol,
    fee,
  };
}

/**
 * Execute a token swap on Uniswap V3 via SwapRouter02.
 * Uses the company treasury wallet.
 */
export async function swapTokens(
  privateKey: `0x${string}`,
  fromToken: string,
  toToken: string,
  amountIn: string,
  slippagePercent: number = 1,
  fee: number = 3000
): Promise<{
  txHash: string;
  amountIn: string;
  amountOut: string;
  fromSymbol: string;
  toSymbol: string;
  from: string;
}> {
  const fromT = resolveToken(fromToken);
  const toT = resolveToken(toToken);
  const walletClient = getWalletClientFromPrivateKey(privateKey);
  const publicClient = getPublicClient();
  const sender = walletClient.account.address;

  const amountInWei = parseUnits(amountIn, fromT.decimals);

  // Check balance
  const balance = await publicClient.readContract({
    address: fromT.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [sender],
  });

  if (balance < amountInWei) {
    throw new Error(
      `Insufficient ${fromT.symbol} balance. Have: ${formatUnits(balance, fromT.decimals)}, need: ${amountIn}`
    );
  }

  // Check and set approval
  const allowance = await publicClient.readContract({
    address: fromT.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [sender, UNISWAP_SWAP_ROUTER],
  });

  if (allowance < amountInWei) {
    const approveTx = await walletClient.writeContract({
      address: fromT.address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [UNISWAP_SWAP_ROUTER, amountInWei * BigInt(2)],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  // Get quote for slippage calculation
  let amountOutMinimum = BigInt(0);
  try {
    const quoteResult = await publicClient.simulateContract({
      address: UNISWAP_QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [{
        tokenIn: fromT.address,
        tokenOut: toT.address,
        amountIn: amountInWei,
        fee,
        sqrtPriceLimitX96: BigInt(0),
      }],
    });
    const quoted = quoteResult.result[0];
    amountOutMinimum = quoted - (quoted * BigInt(Math.floor(slippagePercent * 100)) / BigInt(10000));
  } catch {
    // If quote fails, proceed with 0 minimum (not ideal but functional)
  }

  // Build swap calldata
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min

  const swapData = encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn: fromT.address,
      tokenOut: toT.address,
      fee,
      recipient: sender,
      amountIn: amountInWei,
      amountOutMinimum,
      sqrtPriceLimitX96: BigInt(0),
    }],
  });

  // Execute via multicall with deadline
  const txHash = await walletClient.writeContract({
    address: UNISWAP_SWAP_ROUTER,
    abi: SWAP_ROUTER_ABI,
    functionName: "multicall",
    args: [deadline, [swapData]],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Read output balance change (approximate — get toToken balance after)
  const outputBalance = await publicClient.readContract({
    address: toT.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [sender],
  });

  return {
    txHash,
    amountIn,
    amountOut: formatUnits(outputBalance, toT.decimals),
    fromSymbol: fromT.symbol,
    toSymbol: toT.symbol,
    from: sender,
  };
}

/**
 * Get token balance for any supported token.
 */
export async function getTokenBalance(
  address: `0x${string}`,
  tokenSymbol: string
): Promise<{ balance: string; symbol: string; tokenAddress: string }> {
  const token = resolveToken(tokenSymbol);
  const client = getPublicClient();
  const balance = await client.readContract({
    address: token.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return {
    balance: formatUnits(balance, token.decimals),
    symbol: token.symbol,
    tokenAddress: token.address,
  };
}

/**
 * List all supported tokens with their addresses.
 */
export function listSupportedTokens() {
  return Object.entries(CELO_TOKENS).map(([symbol, info]) => ({
    symbol,
    address: info.address,
    decimals: info.decimals,
    name: info.name,
  }));
}
