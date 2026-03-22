"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  capabilities: string;
  reportsTo: string | null;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
}

interface CompanyDetail {
  company: {
    id: string;
    name: string;
    description: string;
    status: string;
    createdAt: string;
  };
  agents: Agent[];
  issues: Issue[];
  mainOperatorId: string | null;
}

interface TrustState {
  treasuryAddress?: string | null;
  treasuryStatus?: "unfunded" | "funded" | "active" | null;
  selfVerified: boolean;
  selfVerifiedAt: string | null;
  erc8004Registered: boolean;
  erc8004AgentId: string | null;
  erc8004TxHash: string | null;
  erc8004RegisteredAt: string | null;
  delegationActive: boolean;
  delegationPolicy: {
    token: string;
    maxAmountPerTx: string;
    recipientAddress: string;
  } | null;
  lastPaymentTxHash: string | null;
  lastPaymentAt: string | null;
  lastPaymentAmount: string | null;
}

interface PaymentCheck {
  allowed: boolean;
  reason?: string;
}

interface CompanySpendPolicy {
  token: string;
  maxAmountPerTx: string;
  maxAmountPerDay: string;
  allowedRecipients: string[];
}

interface AgentSpendPolicy {
  agentId: string;
  enabled: boolean;
  maxAmountPerTx: string;
  maxAmountPerDay: string;
  maxAmountPerWeek: string;
  spentToday: string;
  spentWeek: string;
  updatedAt: string;
}

interface TreasuryResponse {
  treasury: {
    address: string;
    status: "unfunded" | "funded" | "active";
    createdAt: string | null;
    balances: {
      celo: string;
      cusd: string;
    };
  };
  companySpendPolicy: CompanySpendPolicy | null;
  agentSpendPolicies: Record<string, AgentSpendPolicy>;
  policyAuditEvents: {
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    agentId?: string;
    changes: Record<string, unknown>;
  }[];
}

const ROLE_COLORS: Record<string, string> = {
  ceo: "bg-amber-500",
  cto: "bg-blue-500",
  cmo: "bg-purple-500",
  engineer: "bg-green-500",
  designer: "bg-pink-500",
  pm: "bg-cyan-500",
  qa: "bg-orange-500",
  researcher: "bg-indigo-500",
  defi: "bg-emerald-500",
  general: "bg-zinc-500",
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400",
  idle: "text-zinc-400",
  running: "text-blue-400",
  paused: "text-yellow-400",
  error: "text-red-400",
  done: "text-green-400",
  todo: "text-zinc-400",
  in_progress: "text-blue-400",
  blocked: "text-red-400",
  backlog: "text-zinc-500",
};

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;

  const [data, setData] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trustState, setTrustState] = useState<TrustState | null>(null);
  const [paymentCheck, setPaymentCheck] = useState<PaymentCheck | null>(null);
  const [treasury, setTreasury] = useState<TreasuryResponse | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(true);
  const [savingCompanyPolicy, setSavingCompanyPolicy] = useState(false);
  const [savingAgentPolicyId, setSavingAgentPolicyId] = useState<string | null>(
    null
  );
  const [companyPolicyForm, setCompanyPolicyForm] = useState({
    token: "cUSD",
    maxAmountPerTx: "0.10",
    maxAmountPerDay: "2.00",
    allowedRecipientsRaw: "",
  });
  const [agentPolicyForms, setAgentPolicyForms] = useState<
    Record<
      string,
      {
        enabled: boolean;
        maxAmountPerTx: string;
        maxAmountPerDay: string;
        maxAmountPerWeek: string;
      }
    >
  >({});

  // Self verification states
  const [selfDeepLink, setSelfDeepLink] = useState<string | null>(null);
  const [selfInstructions, setSelfInstructions] = useState<string[]>([]);
  const [selfPolling, setSelfPolling] = useState(false);

  // Action states
  const [verifyingSelf, setVerifyingSelf] = useState(false);
  const [registeringErc8004, setRegisteringErc8004] = useState(false);
  const [settingDelegation, setSettingDelegation] = useState(false);
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delegationForm, setDelegationForm] = useState({
    token: "cUSD",
    maxAmountPerTx: "0.01",
    recipientAddress: "",
  });
  const [executingPayment, setExecutingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    txHash: string;
    amount: string;
    token: string;
    celoscanUrl: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Agent chat states
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatTargetAgentId, setChatTargetAgentId] = useState<string>("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    {
      prompt: string;
      response: string;
      agentName: string;
      agentRole: string;
      issueIdentifier: string;
      timestamp: string;
      toolCalls?: { name: string; args: string; result: string }[];
    }[]
  >([]);

  // Autonomous run states
  const [runningAgents, setRunningAgents] = useState(false);
  const [runResult, setRunResult] = useState<{
    agentsRun: number;
    totalIssuesProcessed: number;
  } | null>(null);

  // Activity feed
  const [activityFeed, setActivityFeed] = useState<
    { type: string; summary: string; createdAt: string; agentId?: string }[]
  >([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"trust" | "treasury" | "agents" | "issues">(
    "trust"
  );

  const loadTrustState = useCallback(async () => {
    try {
      const res = await fetch(`/api/trust/state/${companyId}`);
      const trustData = await res.json();
      setTrustState(trustData.state);
      setPaymentCheck(trustData.paymentCheck);
    } catch {
      // Trust state not critical for page load
    }
  }, [companyId]);

  const loadTreasury = useCallback(async () => {
    setTreasuryLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/treasury`);
      if (!res.ok) {
        setTreasury(null);
        return;
      }
      const payload: TreasuryResponse = await res.json();
      setTreasury(payload);
    } catch {
      setTreasury(null);
    } finally {
      setTreasuryLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!treasury) return;

    const companyPolicy = treasury.companySpendPolicy;
    if (companyPolicy) {
      setCompanyPolicyForm({
        token: companyPolicy.token,
        maxAmountPerTx: companyPolicy.maxAmountPerTx,
        maxAmountPerDay: companyPolicy.maxAmountPerDay,
        allowedRecipientsRaw: companyPolicy.allowedRecipients.join("\n"),
      });
    }

    const nextAgentForms: Record<
      string,
      {
        enabled: boolean;
        maxAmountPerTx: string;
        maxAmountPerDay: string;
        maxAmountPerWeek: string;
      }
    > = {};

    for (const [agentId, policy] of Object.entries(treasury.agentSpendPolicies)) {
      nextAgentForms[agentId] = {
        enabled: policy.enabled,
        maxAmountPerTx: policy.maxAmountPerTx,
        maxAmountPerDay: policy.maxAmountPerDay,
        maxAmountPerWeek: policy.maxAmountPerWeek,
      };
    }
    setAgentPolicyForms(nextAgentForms);
  }, [treasury]);

  function formatAmount(value: string | undefined) {
    const parsed = Number.parseFloat(value || "0");
    if (!Number.isFinite(parsed)) return "0.00";
    return parsed.toFixed(2);
  }

  async function handleSaveCompanyPolicy() {
    setSavingCompanyPolicy(true);
    setActionError(null);
    try {
      const allowedRecipients = companyPolicyForm.allowedRecipientsRaw
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      const res = await fetch(`/api/companies/${companyId}/treasury`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: `company-ui:${companyId}`,
          companySpendPolicy: {
            token: companyPolicyForm.token,
            maxAmountPerTx: companyPolicyForm.maxAmountPerTx,
            maxAmountPerDay: companyPolicyForm.maxAmountPerDay,
            allowedRecipients,
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to save company policy");
      }
      await loadTreasury();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSavingCompanyPolicy(false);
    }
  }

  async function handleSaveAgentPolicy(agentId: string) {
    const form = agentPolicyForms[agentId];
    if (!form) return;

    setSavingAgentPolicyId(agentId);
    setActionError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/treasury`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: `company-ui:${companyId}`,
          agentSpendPolicy: {
            agentId,
            enabled: form.enabled,
            maxAmountPerTx: form.maxAmountPerTx,
            maxAmountPerDay: form.maxAmountPerDay,
            maxAmountPerWeek: form.maxAmountPerWeek,
          },
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to save agent policy");
      }
      await loadTreasury();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSavingAgentPolicyId(null);
    }
  }

  const loadChatHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/history?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(
          data.conversations.map(
            (c: {
              prompt: string;
              response: string;
              agentName: string;
              agentRole: string;
              issueIdentifier: string;
              timestamp: string;
              toolCalls: { name: string; args: string; result: string }[];
            }) => ({
              prompt: c.prompt,
              response: c.response,
              agentName: c.agentName,
              agentRole: c.agentRole,
              issueIdentifier: c.issueIdentifier,
              timestamp: c.timestamp,
              toolCalls: c.toolCalls,
            })
          )
        );
      }
    } catch {
      // Chat history is not critical
    } finally {
      setChatHistoryLoaded(true);
    }
  }, [companyId]);

  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/activity?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setActivityFeed(
          (data.activity || []).slice(0, 30).map(
            (a: { type: string; summary: string; createdAt: string; agentId?: string }) => ({
              type: a.type,
              summary: a.summary,
              createdAt: a.createdAt,
              agentId: a.agentId,
            })
          )
        );
      }
    } catch {
      // Activity not critical
    } finally {
      setActivityLoaded(true);
    }
  }, [companyId]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/companies/${companyId}`)
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load company");
          return r.json();
        })
        .then(setData),
      loadTrustState(),
      loadTreasury(),
      loadChatHistory(),
      loadActivity(),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyId, loadTrustState, loadTreasury, loadChatHistory, loadActivity]);

  async function handleVerifySelf() {
    if (!data) return;
    setVerifyingSelf(true);
    setActionError(null);
    setSelfDeepLink(null);
    setSelfInstructions([]);
    try {
      const startRes = await fetch("/api/trust/verify-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          mainOperatorId: data.mainOperatorId,
          issueId: data.issues[0]?.id,
          action: "start",
        }),
      });
      const startData = await startRes.json();

      if (!startRes.ok) {
        throw new Error(startData.error || "Failed to start Self verification");
      }

      // Show deep link and start polling
      setSelfDeepLink(startData.deepLink);
      setSelfInstructions(startData.instructions || []);
      setSelfPolling(true);
      setVerifyingSelf(false);

      // Start polling for completion
      const pollInterval = setInterval(async () => {
        try {
          const checkRes = await fetch("/api/trust/verify-self", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId, action: "check" }),
          });
          const checkData = await checkRes.json();

          if (checkData.verified) {
            clearInterval(pollInterval);
            setSelfPolling(false);
            setSelfDeepLink(null);
            setSelfInstructions([]);
            await loadTrustState();
          }
          // Don't close on errors — keep QR visible so user can use "Confirm Verification"
        } catch {
          // Keep polling on network errors
        }
      }, 3000);

      // Auto-stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setSelfPolling(false);
      }, 300_000);
    } catch (e) {
      setActionError((e as Error).message);
      setVerifyingSelf(false);
    }
  }

  async function handleConfirmSelf() {
    if (!data) return;
    setActionError(null);
    try {
      const res = await fetch("/api/trust/verify-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          mainOperatorId: data.mainOperatorId,
          issueId: data.issues[0]?.id,
          action: "confirm",
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (result.error) throw new Error(result.error);
      if (result.verified) {
        setSelfPolling(false);
        setSelfDeepLink(null);
        setSelfInstructions([]);
        await loadTrustState();
        // Reload company data to reflect updated agent status
        const companyRes = await fetch(`/api/companies/${companyId}`);
        if (companyRes.ok) setData(await companyRes.json());
      } else {
        setActionError(result.message || "Agent not verified on-chain yet. Scan the QR code first.");
      }
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function handleRegisterErc8004() {
    if (!data) return;
    setRegisteringErc8004(true);
    setActionError(null);
    try {
      const res = await fetch("/api/trust/register-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          mainOperatorId: data.mainOperatorId,
          issueId: data.issues[0]?.id,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      await loadTrustState();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setRegisteringErc8004(false);
    }
  }

  async function handleSetDelegation() {
    if (!data) return;
    setSettingDelegation(true);
    setActionError(null);
    try {
      const res = await fetch("/api/trust/set-delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          issueId: data.issues[0]?.id,
          token: delegationForm.token,
          maxAmountPerTx: delegationForm.maxAmountPerTx,
          recipientAddress: delegationForm.recipientAddress,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setShowDelegationModal(false);
      await Promise.all([loadTrustState(), loadTreasury()]);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSettingDelegation(false);
    }
  }

  async function handleExecutePayment() {
    if (!data) return;
    setExecutingPayment(true);
    setActionError(null);
    setPaymentResult(null);
    try {
      const res = await fetch("/api/trust/execute-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          issueId: data.issues[0]?.id,
          amount: trustState?.delegationPolicy?.maxAmountPerTx || "0.01",
          agentId: mainOperatorId,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setPaymentResult({
        txHash: result.txHash,
        amount: result.amount,
        token: result.token,
        celoscanUrl: result.celoscanUrl,
      });
      await Promise.all([loadTrustState(), loadTreasury()]);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setExecutingPayment(false);
    }
  }

  async function handleSendPrompt() {
    if (!chatPrompt.trim() || !data) return;
    setChatLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/agents/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          agentId: chatTargetAgentId || undefined,
          prompt: chatPrompt.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setChatMessages((prev) => [
        {
          prompt: chatPrompt.trim(),
          response: result.response,
          agentName: result.agent.name,
          agentRole: result.agent.role,
          issueIdentifier: result.issueIdentifier,
          timestamp: new Date().toISOString(),
          toolCalls: result.toolCalls?.map(
            (tc: { name: string; args: Record<string, unknown>; result: unknown }) => ({
              name: tc.name,
              args: JSON.stringify(tc.args),
              result:
                typeof tc.result === "string"
                  ? tc.result
                  : JSON.stringify(tc.result, null, 2),
            })
          ),
        },
        ...prev,
      ]);
      setChatPrompt("");
      // Reload issues and trust state to reflect any changes from tool calls
      const [companyRes] = await Promise.all([
        fetch(`/api/companies/${companyId}`),
        loadTrustState(),
        loadTreasury(),
      ]);
      if (companyRes.ok) setData(await companyRes.json());
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleRunAgents(targetAgentId?: string) {
    if (!data) return;
    setRunningAgents(true);
    setActionError(null);
    setRunResult(null);
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          agentId: targetAgentId || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setRunResult({
        agentsRun: result.agentsRun,
        totalIssuesProcessed: result.totalIssuesProcessed,
      });
      // Refresh everything
      const [companyRes] = await Promise.all([
        fetch(`/api/companies/${companyId}`),
        loadTrustState(),
        loadTreasury(),
        loadChatHistory(),
        loadActivity(),
      ]);
      if (companyRes.ok) setData(await companyRes.json());
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setRunningAgents(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-8 flex items-center justify-center">
        <p className="text-zinc-500">Loading company...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-8">
        <div className="max-w-[1400px] mx-auto">
          <p className="text-red-400">{error || "Company not found"}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 text-zinc-400 hover:text-white transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const { company, agents, issues, mainOperatorId } = data;
  const mainOperator = agents.find((a) => a.id === mainOperatorId);

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-6 py-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <button
          onClick={() => router.push("/")}
          className="text-zinc-500 hover:text-white text-sm mb-3 transition-colors"
        >
          &larr; Back to Home
        </button>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <p className="text-sm text-zinc-400">
              Created {new Date(company.createdAt).toLocaleDateString()}
            </p>
          </div>
          <span className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-400 capitalize">{company.status}</span>
          </span>
        </div>

        {actionError && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm">
            {actionError}
            <button
              onClick={() => setActionError(null)}
              className="ml-2 text-red-400 hover:text-red-200"
            >
              dismiss
            </button>
          </div>
        )}

        <div className="bg-zinc-900 rounded-lg p-2 border border-zinc-800 mb-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              onClick={() => setActiveTab("trust")}
              className={`px-3 py-2 rounded text-xs md:text-sm font-medium transition-colors ${
                activeTab === "trust"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              Trust & Command
            </button>
            <button
              onClick={() => setActiveTab("treasury")}
              className={`px-3 py-2 rounded text-xs md:text-sm font-medium transition-colors ${
                activeTab === "treasury"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              Treasury & Budgets
            </button>
            <button
              onClick={() => setActiveTab("agents")}
              className={`px-3 py-2 rounded text-xs md:text-sm font-medium transition-colors ${
                activeTab === "agents"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              Agents ({agents.length})
            </button>
            <button
              onClick={() => setActiveTab("issues")}
              className={`px-3 py-2 rounded text-xs md:text-sm font-medium transition-colors ${
                activeTab === "issues"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              Issues & Activity
            </button>
          </div>
        </div>

        {activeTab === "treasury" && (
        <div className="bg-zinc-900 rounded-lg p-5 border border-zinc-800 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Treasury & Spend Controls</h2>
            {treasury && (
              <span
                className={`text-xs px-2 py-1 rounded border ${
                  treasury.treasury.status === "funded" || treasury.treasury.status === "active"
                    ? "text-green-300 border-green-700 bg-green-900/20"
                    : "text-yellow-300 border-yellow-700 bg-yellow-900/20"
                }`}
              >
                {treasury.treasury.status}
              </span>
            )}
          </div>

          {treasuryLoading ? (
            <p className="text-sm text-zinc-500">Loading treasury details...</p>
          ) : !treasury ? (
            <p className="text-sm text-zinc-500">
              Treasury details are not available yet for this company.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                  <p className="text-xs text-zinc-400 mb-1">Treasury Address</p>
                  <p className="text-xs font-mono text-zinc-200 break-all">
                    {treasury.treasury.address}
                  </p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                  <p className="text-xs text-zinc-400 mb-1">cUSD Balance</p>
                  <p className="text-xl font-semibold text-zinc-100">
                    {formatAmount(treasury.treasury.balances.cusd)}
                  </p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                  <p className="text-xs text-zinc-400 mb-1">CELO Balance</p>
                  <p className="text-xl font-semibold text-zinc-100">
                    {formatAmount(treasury.treasury.balances.celo)}
                  </p>
                </div>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Company Budget Defaults
                  </h3>
                  <button
                    onClick={handleSaveCompanyPolicy}
                    disabled={savingCompanyPolicy}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  >
                    {savingCompanyPolicy ? "Saving..." : "Save Defaults"}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Token</label>
                    <select
                      value={companyPolicyForm.token}
                      onChange={(e) =>
                        setCompanyPolicyForm((prev) => ({
                          ...prev,
                          token: e.target.value,
                        }))
                      }
                      className="w-full bg-zinc-900 border border-zinc-600 rounded px-2 py-2 text-sm"
                    >
                      <option value="cUSD">cUSD</option>
                      <option value="CELO">CELO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Max per Tx</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={companyPolicyForm.maxAmountPerTx}
                      onChange={(e) =>
                        setCompanyPolicyForm((prev) => ({
                          ...prev,
                          maxAmountPerTx: e.target.value,
                        }))
                      }
                      className="w-full bg-zinc-900 border border-zinc-600 rounded px-2 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Max per Day</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={companyPolicyForm.maxAmountPerDay}
                      onChange={(e) =>
                        setCompanyPolicyForm((prev) => ({
                          ...prev,
                          maxAmountPerDay: e.target.value,
                        }))
                      }
                      className="w-full bg-zinc-900 border border-zinc-600 rounded px-2 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Allowed Recipients</label>
                    <textarea
                      value={companyPolicyForm.allowedRecipientsRaw}
                      onChange={(e) =>
                        setCompanyPolicyForm((prev) => ({
                          ...prev,
                          allowedRecipientsRaw: e.target.value,
                        }))
                      }
                      className="w-full bg-zinc-900 border border-zinc-600 rounded px-2 py-2 text-xs font-mono h-18"
                      placeholder="One address per line"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">
                  Per-Agent Spend Limits
                </h3>
                <div className="space-y-3">
                  {agents
                    .filter((agent) => agent.id !== mainOperatorId)
                    .map((agent) => {
                      const form =
                        agentPolicyForms[agent.id] ||
                        {
                          enabled: true,
                          maxAmountPerTx:
                            treasury.companySpendPolicy?.maxAmountPerTx || "0.10",
                          maxAmountPerDay:
                            treasury.companySpendPolicy?.maxAmountPerDay || "2.00",
                          maxAmountPerWeek: "10.00",
                        };
                      const savedPolicy = treasury.agentSpendPolicies[agent.id];

                      return (
                        <div
                          key={agent.id}
                          className="bg-zinc-900 border border-zinc-700 rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-zinc-100">
                                {agent.name}
                              </p>
                              <p className="text-xs text-zinc-500">{agent.role}</p>
                            </div>
                            <button
                              onClick={() => handleSaveAgentPolicy(agent.id)}
                              disabled={savingAgentPolicyId === agent.id}
                              className="bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                            >
                              {savingAgentPolicyId === agent.id ? "Saving..." : "Save"}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <label className="text-xs text-zinc-400 flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={form.enabled}
                                onChange={(e) =>
                                  setAgentPolicyForms((prev) => ({
                                    ...prev,
                                    [agent.id]: {
                                      ...form,
                                      enabled: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              Enabled
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={form.maxAmountPerTx}
                              onChange={(e) =>
                                setAgentPolicyForms((prev) => ({
                                  ...prev,
                                  [agent.id]: {
                                    ...form,
                                    maxAmountPerTx: e.target.value,
                                  },
                                }))
                              }
                              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs"
                              placeholder="Max/TX"
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={form.maxAmountPerDay}
                              onChange={(e) =>
                                setAgentPolicyForms((prev) => ({
                                  ...prev,
                                  [agent.id]: {
                                    ...form,
                                    maxAmountPerDay: e.target.value,
                                  },
                                }))
                              }
                              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs"
                              placeholder="Max/Day"
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={form.maxAmountPerWeek}
                              onChange={(e) =>
                                setAgentPolicyForms((prev) => ({
                                  ...prev,
                                  [agent.id]: {
                                    ...form,
                                    maxAmountPerWeek: e.target.value,
                                  },
                                }))
                              }
                              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs"
                              placeholder="Max/Week"
                            />
                          </div>

                          {savedPolicy && (
                            <p className="text-[11px] text-zinc-500 mt-2">
                              Spent today: {formatAmount(savedPolicy.spentToday)} | Spent week: {formatAmount(savedPolicy.spentWeek)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">
                  Policy Audit Trail
                </h3>
                {!treasury.policyAuditEvents?.length ? (
                  <p className="text-xs text-zinc-500">No policy changes recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {treasury.policyAuditEvents.slice(0, 20).map((event) => (
                      <div
                        key={event.id}
                        className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
                      >
                        <p className="text-xs text-zinc-200">
                          {event.action === "company_policy_updated"
                            ? "Company policy updated"
                            : `Agent policy updated${event.agentId ? ` (${event.agentId})` : ""}`}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          By {event.actor} at {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {activeTab === "trust" && (
        <>
        {/* Two-column: Trust Layer + Agent Command Center */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">

        {/* Main Operator + Trust Layer */}
        {mainOperator && (
          <div className="bg-zinc-900 rounded-lg p-5 border border-amber-900/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <h2 className="text-lg font-semibold">{mainOperator.name}</h2>
                <span className="text-xs bg-amber-900 text-amber-300 px-2 py-0.5 rounded">
                  Main Operator
                </span>
              </div>
              <span
                className={`text-sm capitalize ${STATUS_COLORS[mainOperator.status] || "text-zinc-400"}`}
              >
                {mainOperator.status}
              </span>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
              {mainOperator.capabilities}
            </p>

            {/* Trust actions */}
            <div className="space-y-3">
              {/* Step 1: Self Verification */}
              <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${trustState?.selfVerified ? "bg-green-500" : selfPolling ? "bg-yellow-500 animate-pulse" : "bg-zinc-600"}`}
                    />
                    <div>
                      <div className="text-sm font-medium">
                        Self Verification
                      </div>
                      <div className="text-xs text-zinc-400">
                        {trustState?.selfVerified
                          ? `Verified ${new Date(trustState.selfVerifiedAt!).toLocaleString()}`
                          : selfPolling
                            ? "Waiting for you to scan with Self app..."
                            : "Identity verification required"}
                      </div>
                    </div>
                  </div>
                  {!trustState?.selfVerified && !selfPolling && (
                    <button
                      onClick={handleVerifySelf}
                      disabled={verifyingSelf}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                    >
                      {verifyingSelf ? "Starting..." : "Verify"}
                    </button>
                  )}
                  {trustState?.selfVerified && (
                    <span className="text-xs text-green-400 font-medium">
                      Verified
                    </span>
                  )}
                </div>

                {/* QR code for Self verification */}
                {selfDeepLink && !trustState?.selfVerified && (
                  <div className="mt-4 pt-4 border-t border-zinc-700">
                    <p className="text-sm text-zinc-300 mb-4">
                      Scan with your Self app to verify identity:
                    </p>

                    <div className="flex flex-col items-center gap-4">
                      <div className="bg-white p-4 rounded-lg">
                        <QRCodeSVG
                          value={selfDeepLink}
                          size={200}
                          level="M"
                        />
                      </div>

                      {selfInstructions.length > 0 && (
                        <ul className="text-xs text-zinc-400 space-y-1 self-start">
                          {selfInstructions.map((inst, i) => (
                            <li key={i}>{i + 1}. {inst}</li>
                          ))}
                        </ul>
                      )}

                      <div className="flex gap-3 w-full">
                        <a
                          href={selfDeepLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium transition-colors"
                        >
                          Open in Self App
                        </a>
                      </div>
                    </div>

                    {selfPolling && (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs text-yellow-400 flex items-center justify-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                          Waiting for verification... this will update automatically
                        </p>
                        <div className="border-t border-zinc-700 pt-3">
                          <p className="text-xs text-zinc-400 mb-2">
                            Already verified in the Self app? Click below to confirm:
                          </p>
                          <button
                            onClick={handleConfirmSelf}
                            className="w-full bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-medium transition-colors"
                          >
                            Confirm Verification
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: ERC-8004 Registration */}
              <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${trustState?.erc8004Registered ? "bg-green-500" : "bg-zinc-600"}`}
                    />
                    <div>
                      <div className="text-sm font-medium">
                        ERC-8004 Identity
                      </div>
                      <div className="text-xs text-zinc-400">
                        {trustState?.erc8004Registered ? (
                          <>
                            Agent ID: {trustState.erc8004AgentId}
                            <br />
                            <a
                              href={`https://celoscan.io/tx/${trustState.erc8004TxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              View on CeloScan
                            </a>
                          </>
                        ) : (
                          "Onchain identity registration required"
                        )}
                      </div>
                    </div>
                  </div>
                  {!trustState?.erc8004Registered && (
                    <button
                      onClick={handleRegisterErc8004}
                      disabled={registeringErc8004 || !trustState?.selfVerified}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                      title={
                        !trustState?.selfVerified
                          ? "Self verification required first"
                          : undefined
                      }
                    >
                      {registeringErc8004 ? "Registering..." : "Register"}
                    </button>
                  )}
                  {trustState?.erc8004Registered && (
                    <span className="text-xs text-green-400 font-medium">
                      Registered
                    </span>
                  )}
                </div>
              </div>

              {/* Step 3: Delegation Policy */}
              <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${trustState?.delegationActive ? "bg-green-500" : "bg-zinc-600"}`}
                    />
                    <div>
                      <div className="text-sm font-medium">
                        Delegation Policy
                      </div>
                      <div className="text-xs text-zinc-400">
                        {trustState?.delegationActive &&
                        trustState.delegationPolicy
                          ? `${trustState.delegationPolicy.token} | Max: ${trustState.delegationPolicy.maxAmountPerTx} per tx | To: ${trustState.delegationPolicy.recipientAddress.slice(0, 10)}...`
                          : "Bounded spending policy required"}
                      </div>
                    </div>
                  </div>
                  {!trustState?.delegationActive && (
                    <button
                      onClick={() => setShowDelegationModal(true)}
                      disabled={!trustState?.erc8004Registered}
                      className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                      title={
                        !trustState?.erc8004Registered
                          ? "ERC-8004 registration required first"
                          : undefined
                      }
                    >
                      Configure
                    </button>
                  )}
                  {trustState?.delegationActive && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-400 font-medium">
                        Active
                      </span>
                      <button
                        onClick={() => {
                          if (trustState.delegationPolicy) {
                            setDelegationForm({
                              token: trustState.delegationPolicy.token,
                              maxAmountPerTx: trustState.delegationPolicy.maxAmountPerTx,
                              recipientAddress: trustState.delegationPolicy.recipientAddress,
                            });
                          }
                          setShowDelegationModal(true);
                        }}
                        className="text-xs text-zinc-400 hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Delegation Policy Modal */}
              {showDelegationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
                    <h3 className="text-lg font-semibold mb-1">
                      Delegation Policy
                    </h3>
                    <p className="text-xs text-zinc-400 mb-5">
                      Set the spending rules for the Main Operator agent.
                    </p>

                    <div className="space-y-4">
                      {/* Token */}
                      <div>
                        <label className="block text-sm text-zinc-300 mb-1">
                          Token
                        </label>
                        <select
                          value={delegationForm.token}
                          onChange={(e) =>
                            setDelegationForm((f) => ({
                              ...f,
                              token: e.target.value,
                            }))
                          }
                          className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="cUSD">cUSD (Celo Dollar)</option>
                          <option value="CELO">CELO</option>
                        </select>
                      </div>

                      {/* Max Amount */}
                      <div>
                        <label className="block text-sm text-zinc-300 mb-1">
                          Max Amount Per Transaction
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={delegationForm.maxAmountPerTx}
                          onChange={(e) =>
                            setDelegationForm((f) => ({
                              ...f,
                              maxAmountPerTx: e.target.value,
                            }))
                          }
                          className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                          placeholder="0.01"
                        />
                      </div>

                      {/* Recipient */}
                      <div>
                        <label className="block text-sm text-zinc-300 mb-1">
                          Recipient Address
                        </label>
                        <input
                          type="text"
                          value={delegationForm.recipientAddress}
                          onChange={(e) =>
                            setDelegationForm((f) => ({
                              ...f,
                              recipientAddress: e.target.value,
                            }))
                          }
                          className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                          placeholder="0x..."
                        />
                      </div>
                    </div>

                    {/* Policy summary */}
                    <div className="mt-4 bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                      <p className="text-xs text-zinc-400">
                        The agent will be allowed to send up to{" "}
                        <span className="text-white font-medium">
                          {delegationForm.maxAmountPerTx} {delegationForm.token}
                        </span>{" "}
                        per transaction to{" "}
                        <span className="text-white font-mono">
                          {delegationForm.recipientAddress
                            ? `${delegationForm.recipientAddress.slice(0, 8)}...${delegationForm.recipientAddress.slice(-6)}`
                            : "—"}
                        </span>
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 mt-5">
                      <button
                        onClick={() => setShowDelegationModal(false)}
                        className="flex-1 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSetDelegation}
                        disabled={
                          settingDelegation ||
                          !delegationForm.recipientAddress ||
                          !delegationForm.maxAmountPerTx
                        }
                        className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        {settingDelegation ? "Saving..." : "Activate Policy"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Delegated Payment */}
              <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        trustState?.lastPaymentTxHash
                          ? "bg-green-500"
                          : paymentCheck?.allowed
                            ? "bg-yellow-500"
                            : "bg-zinc-600"
                      }`}
                    />
                    <div>
                      <div className="text-sm font-medium">
                        Delegated Payment
                      </div>
                      <div className="text-xs text-zinc-400">
                        {trustState?.lastPaymentTxHash ? (
                          <>
                            Sent {trustState.lastPaymentAmount} cUSD
                            {" "}
                            <a
                              href={`https://celoscan.io/tx/${trustState.lastPaymentTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              View on CeloScan
                            </a>
                          </>
                        ) : paymentCheck?.allowed
                          ? `Ready to send ${trustState?.delegationPolicy?.maxAmountPerTx || "0.01"} cUSD`
                          : paymentCheck?.reason || "Complete trust steps first"
                        }
                      </div>
                    </div>
                  </div>
                  {paymentCheck?.allowed && !trustState?.lastPaymentTxHash && (
                    <button
                      onClick={handleExecutePayment}
                      disabled={executingPayment}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                    >
                      {executingPayment ? "Sending..." : "Execute Payment"}
                    </button>
                  )}
                  {trustState?.lastPaymentTxHash && (
                    <span className="text-xs text-green-400 font-medium">
                      Sent
                    </span>
                  )}
                </div>

                {/* Payment result */}
                {paymentResult && (
                  <div className="mt-3 pt-3 border-t border-zinc-700">
                    <div className="bg-green-900/20 border border-green-800/50 rounded p-3 space-y-1">
                      <p className="text-sm text-green-300 font-medium">
                        Payment successful
                      </p>
                      <p className="text-xs text-zinc-400">
                        Amount: {paymentResult.amount} {paymentResult.token}
                      </p>
                      <p className="text-xs text-zinc-400 font-mono break-all">
                        Tx: {paymentResult.txHash}
                      </p>
                      <a
                        href={paymentResult.celoscanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        View on CeloScan
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment readiness indicator */}
              <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${paymentCheck?.allowed ? "bg-green-500" : "bg-red-500"}`}
                  />
                  <span className="text-xs text-zinc-400">
                    Payment:{" "}
                    {paymentCheck?.allowed
                      ? "Ready — all trust requirements met"
                      : paymentCheck?.reason || "Trust requirements not met"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agent Chat */}
        <div className="bg-zinc-900 rounded-lg p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Agent Command Center</h2>
            <div className="flex items-center gap-2">
              {runResult && (
                <span className="text-xs text-green-400">
                  {runResult.totalIssuesProcessed} tasks processed
                </span>
              )}
              <button
                onClick={() => handleRunAgents()}
                disabled={runningAgents}
                className="bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-3 py-1.5 rounded text-xs font-medium transition-colors"
              >
                {runningAgents ? "Running..." : "Run All Agents"}
              </button>
            </div>
          </div>
          <div className="flex gap-3 mb-4">
            <select
              value={chatTargetAgentId}
              onChange={(e) => setChatTargetAgentId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 min-w-[160px]"
            >
              <option value="">Auto (best match)</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendPrompt();
                }
              }}
              placeholder="Ask your agents to do something..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              disabled={chatLoading}
            />
            <button
              onClick={handleSendPrompt}
              disabled={chatLoading || !chatPrompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 px-5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              {chatLoading ? "Thinking..." : "Send"}
            </button>
          </div>

          {/* Chat messages */}
          {chatMessages.length > 0 && (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className="bg-zinc-800 rounded-lg p-4 border border-zinc-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${ROLE_COLORS[msg.agentRole] || "bg-zinc-500"}`}
                      />
                      <span className="text-sm font-medium">
                        {msg.agentName}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {msg.agentRole}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-xs text-zinc-500 font-mono">
                        {msg.issueIdentifier}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 mb-2 italic">
                    &ldquo;{msg.prompt}&rdquo;
                  </p>

                  {/* Tool calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-3 space-y-1.5">
                      {msg.toolCalls.map((tc, j) => {
                        let parsedResult: Record<string, unknown> = {};
                        try {
                          parsedResult = JSON.parse(tc.result);
                        } catch {
                          // not json
                        }
                        const isError = "error" in parsedResult;
                        const isTx = "txHash" in parsedResult;

                        return (
                          <div
                            key={j}
                            className={`rounded px-3 py-2 text-xs font-mono border ${
                              isError
                                ? "bg-red-900/20 border-red-800/50 text-red-300"
                                : isTx
                                  ? "bg-emerald-900/20 border-emerald-800/50 text-emerald-300"
                                  : "bg-zinc-700/50 border-zinc-600/50 text-zinc-300"
                            }`}
                          >
                            <span className="font-semibold">{tc.name}</span>
                            {tc.args !== "{}" && (
                              <span className="text-zinc-500 ml-1">
                                ({tc.args})
                              </span>
                            )}
                            <span className="mx-1 text-zinc-500">&rarr;</span>
                            {isTx && parsedResult.celoscanUrl ? (
                              <a
                                href={parsedResult.celoscanUrl as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline"
                              >
                                Tx: {(parsedResult.txHash as string).slice(0, 14)}...
                              </a>
                            ) : isError ? (
                              <span>{parsedResult.error as string}</span>
                            ) : (
                              <span>
                                {tc.result.length > 120
                                  ? tc.result.slice(0, 120) + "..."
                                  : tc.result}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="text-sm text-zinc-200 whitespace-pre-wrap">
                    {msg.response}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!chatHistoryLoaded && (
            <p className="text-xs text-zinc-500 text-center py-4">
              Loading conversation history...
            </p>
          )}

          {chatHistoryLoaded && chatMessages.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-4">
              Send a prompt to start interacting with your AI agents. Agents can
              check balances, execute real cUSD transfers, create tasks, and
              more. All actions are tracked as Paperclip issues.
            </p>
          )}
        </div>

        </div>{/* End two-column grid */}
        </>
        )}

        {activeTab === "agents" && (
        <>
        {/* Agent list */}
        <div className="bg-zinc-900 rounded-lg p-5 mb-5">
          <h2 className="text-lg font-semibold mb-3">
            Agents ({agents.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agents
              .filter((a) => a.id !== mainOperatorId)
              .map((agent) => (
                <div
                  key={agent.id}
                  className="bg-zinc-800 rounded-lg p-4 border border-zinc-700"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${ROLE_COLORS[agent.role] || "bg-zinc-500"}`}
                      />
                      <span className="font-semibold text-sm">
                        {agent.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRunAgents(agent.id)}
                        disabled={runningAgents}
                        className="text-xs text-amber-400 hover:text-amber-300 disabled:text-zinc-600 transition-colors"
                        title="Run this agent on pending tasks"
                      >
                        Run
                      </button>
                      <span
                        className={`text-xs capitalize ${STATUS_COLORS[agent.status] || "text-zinc-400"}`}
                      >
                        {agent.status}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                    {agent.role}
                  </span>
                  <p className="text-xs text-zinc-400 mt-2">
                    {agent.capabilities}
                  </p>
                </div>
              ))}
          </div>
        </div>
        </>
        )}

        {activeTab === "issues" && (
        <>
        {/* Issues + Activity side by side */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Issues */}
        <div className="bg-zinc-900 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3">
            Issues ({issues.length})
          </h2>
          {issues.length === 0 ? (
            <p className="text-zinc-500 text-sm">No issues yet</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {issues.map((issue) => {
                const assignee = agents.find(
                  (a) => a.id === issue.assigneeAgentId
                );
                return (
                  <div
                    key={issue.id}
                    className="bg-zinc-800 rounded p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 font-mono">
                          {issue.identifier}
                        </span>
                        <span className="text-sm font-medium">
                          {issue.title}
                        </span>
                      </div>
                      {assignee && (
                        <span className="text-xs text-zinc-400">
                          Assigned to {assignee.name}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs capitalize ${STATUS_COLORS[issue.status] || "text-zinc-400"}`}
                    >
                      {issue.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="bg-zinc-900 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3">Activity Feed</h2>
          {!activityLoaded ? (
            <p className="text-xs text-zinc-500">Loading activity...</p>
          ) : activityFeed.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No activity yet. Send tasks to agents or run them autonomously to
              see activity here.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {activityFeed.map((entry, i) => {
                const entryAgent = entry.agentId
                  ? agents.find((a) => a.id === entry.agentId)
                  : null;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 text-xs border-l-2 border-zinc-700 pl-3 py-1"
                  >
                    <span className="text-zinc-600 whitespace-nowrap min-w-[70px]">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
                    <div>
                      {entryAgent && (
                        <span className="text-zinc-400 font-medium">
                          {entryAgent.name}:{" "}
                        </span>
                      )}
                      <span className="text-zinc-300">{entry.summary}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        </div>{/* End Issues + Activity grid */}
        </>
        )}
      </div>
    </div>
  );
}
