"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import WalletConnect from "@/components/WalletConnect";

type Check = { status: string; detail?: string };
type HealthData = { status: string; checks: Record<string, Check> };

interface CompanySummary {
  id: string;
  name: string;
  status: string;
  agentCount: number;
  createdAt: string;
}

export default function Home() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);

  const loadCompanies = useCallback(async (address: string) => {
    try {
      const res = await fetch(`/api/companies?deployer=${address}`);
      const data = await res.json();
      setCompanies(data);
    } catch {
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "error", checks: {} }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (eth) {
      eth
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
            loadCompanies(accounts[0]);
          }
        })
        .catch(() => {});
    }
  }, [loadCompanies]);

  function handleConnect(address: string) {
    setWalletAddress(address);
    loadCompanies(address);
  }

  function handleDisconnect() {
    setWalletAddress(null);
    setCompanies([]);
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-zinc-200/70">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <a href="/" className="text-[18px] font-bold tracking-tight hover:opacity-80 transition-opacity">Synthetic</a>
            <div className="hidden md:flex items-center gap-6 text-[14px] text-zinc-500">
              <a href="/" className="text-zinc-900 font-medium">Home</a>
              <a href="/dashboard" className="hover:text-zinc-700 transition-colors">Dashboard</a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-700 transition-colors">GitHub</a>
              <a href="https://docs.celo.org" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-700 transition-colors">Celo Docs</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            
            <WalletConnect
              address={walletAddress}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        {/* Gradient orbs */}
        <div className="absolute top-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-100/60 to-cyan-100/40 blur-3xl" />
        <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-violet-100/40 to-pink-100/30 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-8 pt-6 pb-12 md:pt-8 md:pb-16">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-center">
            {/* Left column */}
            <div>
              <h1 className="text-[36px] md:text-[48px] font-bold tracking-[-0.02em] leading-[1.1] text-zinc-900">
                The operating system for{" "}
                <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                  onchain companies
                </span>
              </h1>

              <p className="mt-5 text-[16px] md:text-[18px] leading-[1.6] text-zinc-500 max-w-[520px]">
                Deploy teams of autonomous agents with verified identity, delegation
                policies, and native stablecoin payments. From idea to launch in
                under a minute.
              </p>

              <div className="flex items-center gap-4 mt-8">
                {!walletAddress ? (
                  <>
                    <button
                      onClick={() => {
                        const btn = document.querySelector("[data-wallet-connect]") as HTMLButtonElement;
                        btn?.click();
                      }}
                      className="bg-zinc-900 text-white hover:bg-zinc-800 px-6 py-3 rounded-lg text-[15px] font-medium transition-colors shadow-sm"
                    >
                      Get started
                    </button>
                    <button className="text-[14px] text-zinc-500 hover:text-zinc-700 font-medium transition-colors">
                      Learn more
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => router.push("/dashboard")}
                      className="bg-zinc-900 text-white hover:bg-zinc-800 px-6 py-3 rounded-lg text-[15px] font-medium transition-colors shadow-sm"
                    >
                      Go to Dashboard
                    </button>
                    <span className="text-[14px] text-zinc-400">
                      {companies.length > 0
                        ? `${companies.length} ${companies.length === 1 ? "company" : "companies"} deployed`
                        : "Deploy your first company"}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-6 mt-10 pt-6 border-t border-zinc-200/80">
                {["Celo Mainnet", "Self Protocol", "ERC-8004", "x402 Payments"].map((label) => (
                  <span key={label} className="text-[13px] text-zinc-400 font-medium">
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Right column — hero image */}
            <div className="hidden md:block">
              <img
                src="/hero-right.png"
                alt="Autonomous company on blockchain"
                className="w-[460px] h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-8">
        {/* Not connected */}
        {!walletAddress && (
          <section className="pb-24">
            {/* Feature cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">
              {[
                {
                  title: "Describe & Deploy",
                  desc: "Tell us your business idea in one sentence. We generate the org chart, assign roles, and deploy agents in seconds.",
                },
                {
                  title: "Verified Identity",
                  desc: "Every company gets a Self Protocol verification and ERC-8004 onchain identity — no anonymous actors.",
                },
                {
                  title: "Native Payments",
                  desc: "Agents transact with cUSD on Celo. Delegation policies cap spend per transaction. Full audit trail onchain.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="bg-white rounded-xl border border-zinc-200/80 p-6 shadow-sm"
                >
                  <h3 className="text-[16px] font-semibold mb-2">{f.title}</h3>
                  <p className="text-[14px] text-zinc-500 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Connected — redirect to dashboard */}
        {walletAddress && (
          <section className="pb-24">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">
              {[
                {
                  title: "Describe & Deploy",
                  desc: "Tell us your business idea in one sentence. We generate the org chart, assign roles, and deploy agents in seconds.",
                },
                {
                  title: "Verified Identity",
                  desc: "Every company gets a Self Protocol verification and ERC-8004 onchain identity — no anonymous actors.",
                },
                {
                  title: "Native Payments",
                  desc: "Agents transact with cUSD on Celo. Delegation policies cap spend per transaction. Full audit trail onchain.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="bg-white rounded-xl border border-zinc-200/80 p-6 shadow-sm"
                >
                  <h3 className="text-[16px] font-semibold mb-2">{f.title}</h3>
                  <p className="text-[14px] text-zinc-500 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200/80 bg-white">
        <div className="max-w-7xl mx-auto px-8 py-8 flex items-center justify-between text-[12px] text-zinc-400">
          <span>Synthetic &middot; Built on Celo</span>
          <div className="flex items-center gap-4">
            <a href="https://docs.celo.org" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 transition-colors">Celo Docs</a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
