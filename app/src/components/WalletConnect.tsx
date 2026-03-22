"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface WalletConnectProps {
  onConnect: (address: string) => void;
  onDisconnect: () => void;
  address: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEthereum(): any | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

export default function WalletConnect({
  onConnect,
  onDisconnect,
  address,
}: WalletConnectProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenerRef = useRef<((accounts: string[]) => void) | null>(null);

  const handleAccountsChanged = useCallback(
    (accounts: string[]) => {
      if (accounts.length === 0) {
        onDisconnect();
      } else {
        onConnect(accounts[0]);
      }
    },
    [onConnect, onDisconnect]
  );

  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;

    listenerRef.current = handleAccountsChanged;

    try {
      eth.on("accountsChanged", handleAccountsChanged);
    } catch {
      // Some providers don't support .on()
    }

    return () => {
      try {
        eth.removeListener("accountsChanged", handleAccountsChanged);
      } catch {
        // ignore cleanup errors
      }
    };
  }, [handleAccountsChanged]);

  async function connect() {
    const eth = getEthereum();
    if (!eth) {
      setError("MetaMask not found");
      return;
    }

    setConnecting(true);
    setError(null);
    try {
      const accounts: string[] = await eth.request({
        method: "eth_requestAccounts",
      });
      if (accounts.length > 0) {
        onConnect(accounts[0]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  function truncate(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  if (address) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 bg-zinc-100 px-3 py-1.5 rounded-md text-[13px] text-zinc-600 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {truncate(address)}
        </span>
        <button
          onClick={onDisconnect}
          className="text-[12px] text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        data-wallet-connect
        onClick={connect}
        disabled={connecting}
        className="bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
      >
        {connecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && <p className="text-red-500 text-[11px] mt-1">{error}</p>}
    </div>
  );
}
