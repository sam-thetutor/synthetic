// x402 payment client for AI agents on Celo.
// Wraps fetch with automatic micropayment capability so any agent can pay
// for x402-gated APIs using the operator wallet.

import { createThirdwebClient } from "thirdweb";
import { celo } from "thirdweb/chains";
import { createWalletAdapter, privateKeyToAccount } from "thirdweb/wallets";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { parseUnits } from "viem";
import { getEnvConfig } from "./env";

const DEFAULT_MAX_VALUE = "1000000";
const MAX_RESPONSE_BODY_LENGTH = 20_000;

type X402WrappedFetch = ReturnType<typeof wrapFetchWithPayment>;

let cachedClient: ReturnType<typeof createThirdwebClient> | null = null;
let cachedWallet: ReturnType<typeof createWalletAdapter> | null = null;
const cachedFetches = new Map<string, X402WrappedFetch>();

function normalizeMaxValue(maxValue: string) {
  const trimmed = maxValue.trim();
  if (trimmed.includes(".")) {
    return parseUnits(trimmed, 18);
  }

  return BigInt(trimmed);
}

export interface X402FetchResult {
  url: string;
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  bodyJson: unknown | null;
  truncated: boolean;
}

function getThirdwebClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getEnvConfig();
  if (!config.thirdwebClientId) {
    throw new Error(
      "THIRDWEB_CLIENT_ID not configured. Add it to enable x402 payments."
    );
  }

  cachedClient = createThirdwebClient({ clientId: config.thirdwebClientId });
  return cachedClient;
}

function getX402Wallet() {
  if (cachedWallet) {
    return cachedWallet;
  }

  const config = getEnvConfig();
  const client = getThirdwebClient();
  const account = privateKeyToAccount({
    client,
    privateKey: config.operatorPrivateKey,
  });

  cachedWallet = createWalletAdapter({
    client,
    adaptedAccount: account,
    chain: celo,
    onDisconnect: () => {
      cachedFetches.clear();
    },
    switchChain: async () => {
      // x402 may request a chain switch. The adapter updates wallet state.
    },
  });

  return cachedWallet;
}

export function getX402Fetch(maxValue = DEFAULT_MAX_VALUE) {
  const cachedFetch = cachedFetches.get(maxValue);
  if (cachedFetch) {
    return cachedFetch;
  }

  const fetchWithPayment = wrapFetchWithPayment(
    globalThis.fetch,
    getThirdwebClient(),
    getX402Wallet(),
    { maxValue: normalizeMaxValue(maxValue) }
  );

  cachedFetches.set(maxValue, fetchWithPayment);
  return fetchWithPayment;
}

export async function x402Fetch(
  url: string,
  init?: RequestInit,
  maxValue = DEFAULT_MAX_VALUE
): Promise<X402FetchResult> {
  const response = await getX402Fetch(maxValue)(url, init);
  const headers = Object.fromEntries(response.headers.entries());

  const rawBody = await response.text();
  const truncated = rawBody.length > MAX_RESPONSE_BODY_LENGTH;
  const bodyText = truncated
    ? `${rawBody.slice(0, MAX_RESPONSE_BODY_LENGTH)}\n...[truncated]`
    : rawBody;

  let bodyJson: unknown | null = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json") || /^[\[{]/.test(bodyText.trim())) {
    try {
      bodyJson = JSON.parse(rawBody);
    } catch {
      bodyJson = null;
    }
  }

  return {
    url: response.url || url,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers,
    bodyText,
    bodyJson,
    truncated,
  };
}

export function isX402Configured(): boolean {
  try {
    const config = getEnvConfig();
    return Boolean(config.thirdwebClientId);
  } catch {
    return false;
  }
}

export function resetX402Cache() {
  cachedClient = null;
  cachedWallet = null;
  cachedFetches.clear();
}
