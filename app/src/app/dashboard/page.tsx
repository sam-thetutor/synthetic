"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import WalletConnect from "@/components/WalletConnect";

interface BlueprintAgent {
  name: string;
  role: string;
  capabilities: string;
  adapterType: string;
  reportsTo: string | null;
}

interface CompanyBlueprint {
  companyName: string;
  companyDescription: string;
  agents: BlueprintAgent[];
}

interface CompanySummary {
  id: string;
  name: string;
  status: string;
  agentCount: number;
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  ceo: "border-amber-400",
  cto: "border-blue-400",
  cmo: "border-purple-400",
  engineer: "border-green-400",
  designer: "border-pink-400",
  pm: "border-cyan-400",
  qa: "border-orange-400",
  researcher: "border-indigo-400",
  defi: "border-emerald-400",
  general: "border-zinc-400",
};

const EXAMPLE_PROMPTS = [
  "DeFi lending protocol",
  "NFT marketplace",
  "DAO governance",
  "Cross-border payments",
];

export default function Dashboard() {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [blueprint, setBlueprint] = useState<CompanyBlueprint | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const loadCompanies = useCallback(async (address: string) => {
    setLoadingCompanies(true);
    try {
      const res = await fetch(`/api/companies?deployer=${address}`);
      const data = await res.json();
      setCompanies(data);
    } catch {
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (eth) {
      eth
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
            loadCompanies(accounts[0]);
          } else {
            setLoadingCompanies(false);
          }
        })
        .catch(() => setLoadingCompanies(false));
    } else {
      setLoadingCompanies(false);
    }
  }, [loadCompanies]);

  function handleConnect(address: string) {
    setWalletAddress(address);
    loadCompanies(address);
  }

  function handleDisconnect() {
    setWalletAddress(null);
    setCompanies([]);
    setBlueprint(null);
  }

  async function handleGenerate(input?: string) {
    const text = input || prompt;
    if (!text.trim()) return;
    setGenerating(true);
    setBlueprint(null);
    setDeployError(null);
    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json();
      setBlueprint(data);
      if (input) setPrompt(input);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeploy() {
    if (!blueprint || !walletAddress) return;
    setDeploying(true);
    setDeployError(null);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint, deployerAddress: walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeployError(data.error || "Deploy failed");
        return;
      }
      await loadCompanies(walletAddress);
      setBlueprint(null);
      setPrompt("");
      router.push(`/company/${data.companyId}`);
    } catch (e) {
      setDeployError((e as Error).message);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-zinc-200/70">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <a href="/" className="text-[18px] font-bold tracking-tight hover:opacity-80 transition-opacity">
              Synthetic
            </a>
            <div className="hidden md:flex items-center gap-6 text-[14px] text-zinc-500">
              <a href="/" className="hover:text-zinc-700 transition-colors">Home</a>
              <a href="/dashboard" className="text-zinc-900 font-medium">Dashboard</a>
              <a href="https://docs.celo.org" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-700 transition-colors">
                Celo Docs
              </a>
            </div>
          </div>
          <WalletConnect
            address={walletAddress}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight">Dashboard</h1>
            <p className="text-[14px] text-zinc-500 mt-1">
              Create and manage your onchain companies
            </p>
          </div>
          {walletAddress && (
            <span className="text-[12px] text-zinc-400 bg-zinc-100 px-3 py-1.5 rounded-md font-mono">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
          )}
        </div>

        {/* Not connected */}
        {!walletAddress && !loadingCompanies && (
          <div className="bg-white border border-zinc-200/80 rounded-xl p-12 text-center shadow-sm">
            <p className="text-zinc-500 text-[15px] mb-4">Connect your wallet to view your companies</p>
            <button
              onClick={() => {
                const btn = document.querySelector("[data-wallet-connect]") as HTMLButtonElement;
                btn?.click();
              }}
              className="bg-zinc-900 text-white hover:bg-zinc-800 px-6 py-2.5 rounded-lg text-[14px] font-medium transition-colors"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {/* Connected */}
        {walletAddress && (
          <div className="space-y-8">
            {/* Create company */}
            <div className="bg-white rounded-xl border border-zinc-200/80 p-6 shadow-sm">
              <h2 className="text-[16px] font-semibold mb-3">Create a new company</h2>
              <div className="flex gap-2">
                <input
                  id="company-input"
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                  placeholder="Describe your company..."
                  className="flex-1 border border-zinc-200 rounded-lg px-4 py-2.5 text-[15px] text-zinc-900 placeholder-zinc-400 bg-[#fafafa] focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                />
                <button
                  onClick={() => handleGenerate()}
                  disabled={generating || !prompt.trim()}
                  className="bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 px-5 py-2.5 rounded-lg text-[15px] font-medium transition-colors"
                >
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => handleGenerate(ex)}
                    className="text-[12px] text-zinc-400 hover:text-zinc-600 bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 hover:border-zinc-200 px-2.5 py-1 rounded-md transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* Blueprint preview */}
            {blueprint && (
              <div className="bg-white rounded-xl border border-zinc-200/80 overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-[17px] font-semibold">{blueprint.companyName}</h2>
                    <p className="text-[13px] text-zinc-500 mt-0.5">
                      {blueprint.agents.length} agents configured &middot; Ready to deploy
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBlueprint(null)}
                      className="text-[13px] text-zinc-500 hover:text-zinc-700 px-3 py-1.5 rounded-md hover:bg-zinc-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeploy}
                      disabled={deploying}
                      className="bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors"
                    >
                      {deploying ? "Deploying..." : "Deploy"}
                    </button>
                  </div>
                </div>

                {deployError && (
                  <div className="mx-6 mt-4 border border-red-200 bg-red-50 rounded-lg p-3 text-red-600 text-sm">
                    {deployError}
                  </div>
                )}

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {blueprint.agents.map((agent, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border-l-2 ${
                        ROLE_COLORS[agent.role] || "border-zinc-300"
                      } bg-zinc-50/50 px-4 py-3.5`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[15px]">{agent.name}</span>
                        {agent.reportsTo === null && (
                          <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                            Lead
                          </span>
                        )}
                      </div>
                      <span className="text-[12px] text-zinc-400 uppercase tracking-wide">
                        {agent.role}
                      </span>
                      <p className="text-[13px] text-zinc-500 mt-1.5 leading-relaxed">
                        {agent.capabilities}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Companies list */}
            <div>
              <h2 className="text-[16px] font-semibold mb-4">Your Companies</h2>

              {loadingCompanies && (
                <p className="text-[13px] text-zinc-400">Loading...</p>
              )}

              {!loadingCompanies && companies.length === 0 && (
                <div className="bg-white border border-zinc-200/80 rounded-xl p-10 text-center shadow-sm">
                  <p className="text-zinc-400 text-[14px]">
                    No companies yet. Describe your idea above to create one.
                  </p>
                </div>
              )}

              {companies.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/company/${c.id}`)}
                      className="bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl p-5 text-left transition-all group shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-[15px]">{c.name}</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      </div>
                      <div className="text-[13px] text-zinc-400">
                        {c.agentCount} agents &middot;{" "}
                        {new Date(c.createdAt).toLocaleDateString()}
                      </div>
                      <span className="text-[12px] text-zinc-400 group-hover:text-zinc-600 mt-3 inline-block transition-colors">
                        Open dashboard &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
