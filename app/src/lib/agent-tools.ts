// Agent tool definitions and executors for the tool-calling loop.
// These are the real actions agents can perform.

import { ToolDeclaration } from "./gemini";
import {
  getCusdBalance,
  getCeloBalance,
  transferCusdFromPrivateKey,
  getSwapQuote,
  swapTokens,
  getTokenBalance,
  listSupportedTokens,
} from "./celo";
import {
  consumeSpendLimits,
  evaluateSpendLimits,
  getTrustState,
  isPaymentAllowed,
} from "./trust-store";
import { createIssue, addIssueComment, listAgents, listIssues, listIssueComments, updateIssue } from "./paperclip";
import { isX402Configured, x402Fetch } from "./x402";
import { decryptPrivateKey } from "./treasury";

// ── Tool declarations (sent to LLM) ────────────────────────────────

export const AGENT_TOOLS: ToolDeclaration[] = [
  {
    name: "check_cusd_balance",
    description:
      "Check the cUSD stablecoin balance of the operator wallet. Returns the balance as a string.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "check_celo_balance",
    description:
      "Check the native CELO balance of the operator wallet. Returns the balance as a string.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "transfer_cusd",
    description:
      "Transfer cUSD stablecoin to a recipient address. This executes a real onchain transaction on Celo mainnet. The transfer is bounded by the delegation policy (max amount per tx, allowed recipient).",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient Ethereum/Celo address (0x...)",
        },
        amount: {
          type: "string",
          description: "Amount of cUSD to send (e.g. '0.01')",
        },
      },
      required: ["to", "amount"],
    },
  },
  {
    name: "check_trust_status",
    description:
      "Check the current trust/verification status of this company: Self verification, ERC-8004 identity, delegation policy, and payment readiness.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "x402_fetch",
    description:
      "Call an x402-enabled HTTP API and auto-pay from the operator wallet when payment is required. Use this for premium APIs, paid data, or other x402-gated services.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full https:// URL for the x402-enabled API endpoint",
        },
        method: {
          type: "string",
          description: "HTTP method to use",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        },
        body: {
          type: "string",
          description: "Optional request body as a raw string. For JSON requests, also set contentType to application/json.",
        },
        contentType: {
          type: "string",
          description: "Optional Content-Type header value, for example application/json",
        },
        headersJson: {
          type: "string",
          description: "Optional JSON object string of additional request headers",
        },
        maxValue: {
          type: "string",
          description: "Maximum x402 payment allowed for this request in token base units",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "list_team_agents",
    description:
      "List all agents in the company with their names, roles, status, and capabilities.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_company_tasks",
    description:
      "List recent tasks/issues in the company with their status and assignee.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_task",
    description:
      "Create a new task (issue) in the company and optionally assign it to a specific agent. Use this to delegate work to teammates.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title for the task",
        },
        description: {
          type: "string",
          description: "Detailed description of what needs to be done",
        },
        priority: {
          type: "string",
          description: "Task priority",
          enum: ["low", "medium", "high", "critical"],
        },
        assigneeAgentId: {
          type: "string",
          description: "ID of the agent to assign this task to (optional)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "comment_on_task",
    description:
      "Add a comment to an existing task/issue. Use this to provide updates or communicate with other agents.",
    parameters: {
      type: "object",
      properties: {
        issueId: {
          type: "string",
          description: "The issue ID to comment on",
        },
        body: {
          type: "string",
          description: "The comment text",
        },
      },
      required: ["issueId", "body"],
    },
  },
  {
    name: "update_task_status",
    description:
      "Update the status of a task/issue.",
    parameters: {
      type: "object",
      properties: {
        issueId: {
          type: "string",
          description: "The issue ID to update",
        },
        status: {
          type: "string",
          description: "New status",
          enum: ["todo", "in_progress", "blocked", "done"],
        },
      },
      required: ["issueId", "status"],
    },
  },
  {
    name: "message_agent",
    description:
      "Send a message to another agent on your team and get their response. The target agent will process your message using their own expertise and tools, then respond. Use this to collaborate, delegate, or ask questions.",
    parameters: {
      type: "object",
      properties: {
        toAgentId: {
          type: "string",
          description: "The ID of the agent to message (use list_team_agents to find IDs)",
        },
        message: {
          type: "string",
          description: "The message or task to send to the agent",
        },
      },
      required: ["toAgentId", "message"],
    },
  },
  {
    name: "get_task_comments",
    description:
      "Read the comments/conversation on a specific task/issue. Use this to understand what has been discussed or reported on a task.",
    parameters: {
      type: "object",
      properties: {
        issueId: {
          type: "string",
          description: "The issue ID to read comments from",
        },
      },
      required: ["issueId"],
    },
  },
  {
    name: "swap_tokens",
    description:
      "Swap tokens on Uniswap V3 on Celo mainnet. Swaps from one token to another using the company treasury wallet. Supported tokens: CELO, cUSD, USDC, USDT. This executes a real onchain transaction.",
    parameters: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description: "Token to swap from (e.g. 'CELO', 'cUSD', 'USDC', 'USDT')",
        },
        toToken: {
          type: "string",
          description: "Token to swap to (e.g. 'cUSD', 'USDC', 'USDT', 'CELO')",
        },
        amountIn: {
          type: "string",
          description: "Amount of fromToken to swap (e.g. '1.5')",
        },
        slippage: {
          type: "string",
          description: "Slippage tolerance in percent (default '1')",
        },
      },
      required: ["fromToken", "toToken", "amountIn"],
    },
  },
  {
    name: "get_swap_quote",
    description:
      "Get a price quote for a token swap on Uniswap V3 without executing it. Shows expected output amount. Supported tokens: CELO, cUSD, USDC, USDT.",
    parameters: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description: "Token to swap from (e.g. 'CELO', 'cUSD')",
        },
        toToken: {
          type: "string",
          description: "Token to swap to (e.g. 'USDC', 'USDT')",
        },
        amountIn: {
          type: "string",
          description: "Amount of fromToken (e.g. '10')",
        },
      },
      required: ["fromToken", "toToken", "amountIn"],
    },
  },
  {
    name: "check_token_balance",
    description:
      "Check the balance of any supported token (CELO, cUSD, USDC, USDT) in the company treasury wallet.",
    parameters: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Token symbol (e.g. 'CELO', 'cUSD', 'USDC', 'USDT')",
        },
      },
      required: ["token"],
    },
  },
  {
    name: "list_supported_tokens",
    description:
      "List all supported tokens on Celo with their addresses and decimals.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

// ── Tool executor ───────────────────────────────────────────────────

export function createToolExecutor(companyId: string, callingAgentId?: string) {
  return async function executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case "check_cusd_balance": {
        const state = getTrustState(companyId);
        if (!state.treasuryAddress) {
          return { error: "Company treasury is not initialized" };
        }
        const address = state.treasuryAddress as `0x${string}`;
        const balance = await getCusdBalance(address);
        return { balance, token: "cUSD", address };
      }

      case "check_celo_balance": {
        const state = getTrustState(companyId);
        if (!state.treasuryAddress) {
          return { error: "Company treasury is not initialized" };
        }
        const address = state.treasuryAddress as `0x${string}`;
        const balance = await getCeloBalance(address);
        return { balance, token: "CELO", address };
      }

      case "transfer_cusd": {
        const to = args.to as string;
        const amount = args.amount as string;

        if (!callingAgentId) {
          return { error: "Calling agent context is required for transfer_cusd" };
        }

        // Enforce trust gate
        const paymentCheck = isPaymentAllowed(companyId);
        if (!paymentCheck.allowed) {
          return { error: `Payment blocked: ${paymentCheck.reason}` };
        }

        // Enforce delegation policy
        const state = getTrustState(companyId);
        const agents = await listAgents(companyId);
        const isMainOperator = agents.some(
          (agent: { id: string; role: string; reportsTo: string | null }) =>
            agent.id === callingAgentId &&
            agent.role === "ceo" &&
            agent.reportsTo === null
        );
        const policy = state.delegationPolicy;
        if (!policy) {
          return { error: "No delegation policy set" };
        }
        if (!state.treasuryEncryptedPrivateKey) {
          return { error: "Company treasury signing key is missing" };
        }
        if (policy.token !== "cUSD") {
          return { error: `Unsupported delegation token: ${policy.token}` };
        }
        if (state.companySpendPolicy?.token && state.companySpendPolicy.token !== "cUSD") {
          return {
            error: `Company spend policy token must be cUSD for this payment flow (currently ${state.companySpendPolicy.token})`,
          };
        }

        const requestedAmount = parseFloat(amount);
        const maxAmount = parseFloat(policy.maxAmountPerTx);

        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
          return { error: "Amount must be greater than 0" };
        }

        if (requestedAmount > maxAmount) {
          return {
            error: `Amount ${amount} exceeds delegation limit of ${policy.maxAmountPerTx} ${policy.token} per transaction`,
          };
        }

        if (!isMainOperator && state.companySpendPolicy?.allowedRecipients?.length) {
          const allowedRecipients = state.companySpendPolicy.allowedRecipients.map((recipient) =>
            recipient.toLowerCase()
          );
          if (!allowedRecipients.includes(to.toLowerCase())) {
            return {
              error: `Recipient ${to} not allowed by company spend policy`,
            };
          }
        }

        const spendCheck = evaluateSpendLimits(
          companyId,
          requestedAmount,
          callingAgentId,
          { privilegedAgent: isMainOperator }
        );
        if (!spendCheck.allowed) {
          return { error: `Payment blocked: ${spendCheck.reason}` };
        }

        const treasuryPrivateKey = decryptPrivateKey(state.treasuryEncryptedPrivateKey);

        // Execute the transfer
        const result = await transferCusdFromPrivateKey(
          treasuryPrivateKey,
          to as `0x${string}`,
          amount
        );

        consumeSpendLimits(companyId, requestedAmount, callingAgentId);

        return {
          success: true,
          txHash: result.txHash,
          amount: result.amount,
          from: result.from,
          to: result.to,
          celoscanUrl: `https://celoscan.io/tx/${result.txHash}`,
        };
      }

      case "check_trust_status": {
        const state = getTrustState(companyId);
        const paymentCheck = isPaymentAllowed(companyId);
        return {
          selfVerified: state.selfVerified,
          selfVerifiedAt: state.selfVerifiedAt,
          erc8004Registered: state.erc8004Registered,
          erc8004AgentId: state.erc8004AgentId,
          delegationActive: state.delegationActive,
          delegationPolicy: state.delegationPolicy,
          paymentAllowed: paymentCheck.allowed,
          paymentBlockedReason: paymentCheck.reason || null,
          lastPayment: state.lastPaymentTxHash
            ? {
                txHash: state.lastPaymentTxHash,
                amount: state.lastPaymentAmount,
                at: state.lastPaymentAt,
              }
            : null,
        };
      }

      case "x402_fetch": {
        if (!isX402Configured()) {
          return {
            error:
              "x402 payments are not configured. Add THIRDWEB_CLIENT_ID to enable paid API calls.",
          };
        }

        const url = String(args.url || "").trim();
        if (!/^https?:\/\//i.test(url)) {
          return { error: "x402_fetch requires a full http(s) URL" };
        }

        const method = ((args.method as string) || "GET").toUpperCase();
        const body = typeof args.body === "string" ? args.body : undefined;
        const contentType =
          typeof args.contentType === "string" ? args.contentType : undefined;
        const maxValue =
          typeof args.maxValue === "string" ? args.maxValue : undefined;

        let extraHeaders: Record<string, string> = {};
        if (typeof args.headersJson === "string" && args.headersJson.trim()) {
          try {
            const parsed = JSON.parse(args.headersJson) as Record<string, unknown>;
            extraHeaders = Object.fromEntries(
              Object.entries(parsed).map(([key, value]) => [key, String(value)])
            );
          } catch {
            return { error: "headersJson must be a valid JSON object string" };
          }
        }

        const headers = contentType
          ? { ...extraHeaders, "Content-Type": contentType }
          : extraHeaders;

        try {
          const result = await x402Fetch(
            url,
            {
              method,
              headers,
              ...(body ? { body } : {}),
            },
            maxValue
          );

          return {
            success: true,
            ...result,
          };
        } catch (error) {
          return {
            error: (error as Error).message,
            url,
            method,
          };
        }
      }

      case "list_team_agents": {
        const agents = await listAgents(companyId);
        return agents.map((a: { id: string; name: string; role: string; status: string; capabilities: string }) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status,
          capabilities: a.capabilities,
        }));
      }

      case "list_company_tasks": {
        const issues = await listIssues(companyId);
        return issues.slice(0, 20).map((i: { id: string; identifier: string; title: string; status: string; priority: string; assigneeAgentId: string | null }) => ({
          id: i.id,
          identifier: i.identifier,
          title: i.title,
          status: i.status,
          priority: i.priority,
          assigneeAgentId: i.assigneeAgentId,
        }));
      }

      case "create_task": {
        const issue = await createIssue(companyId, {
          title: args.title as string,
          description: (args.description as string) || undefined,
          priority: (args.priority as string) || "medium",
          status: "todo",
          assigneeAgentId: (args.assigneeAgentId as string) || undefined,
        });
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          status: issue.status,
        };
      }

      case "comment_on_task": {
        await addIssueComment(args.issueId as string, args.body as string);
        return { success: true };
      }

      case "update_task_status": {
        await updateIssue(args.issueId as string, {
          status: args.status as string,
        });
        return { success: true, issueId: args.issueId, newStatus: args.status };
      }

      case "message_agent": {
        const toAgentId = args.toAgentId as string;
        const message = args.message as string;

        if (!callingAgentId) {
          return { error: "Cannot message agent: no calling agent context" };
        }
        if (toAgentId === callingAgentId) {
          return { error: "Cannot message yourself" };
        }

        // Dynamic import to avoid circular dependency
        const { messageAgent } = await import("./agent-runner");
        const result = await messageAgent(
          companyId,
          callingAgentId,
          toAgentId,
          message
        );
        return {
          success: true,
          agentResponse: result.response,
          issueId: result.issueId,
          identifier: result.identifier,
          toolCalls: result.toolCalls.map((tc) => ({
            name: tc.name,
            result: tc.result,
          })),
        };
      }

      case "get_task_comments": {
        const comments = await listIssueComments(args.issueId as string);
        return comments.slice(0, 20).map((c: { body: string; createdAt: string; authorAgentId?: string }) => ({
          body: c.body,
          createdAt: c.createdAt,
          authorAgentId: c.authorAgentId || null,
        }));
      }

      case "swap_tokens": {
        const fromToken = args.fromToken as string;
        const toToken = args.toToken as string;
        const amountIn = args.amountIn as string;
        const slippage = parseFloat((args.slippage as string) || "1");

        const state = getTrustState(companyId);
        if (!state.treasuryEncryptedPrivateKey) {
          return { error: "Company treasury signing key is missing" };
        }

        const paymentCheck = isPaymentAllowed(companyId);
        if (!paymentCheck.allowed) {
          return { error: `Swap blocked: ${paymentCheck.reason}` };
        }

        try {
          const treasuryPrivateKey = decryptPrivateKey(state.treasuryEncryptedPrivateKey);
          const result = await swapTokens(
            treasuryPrivateKey,
            fromToken,
            toToken,
            amountIn,
            slippage
          );
          return {
            success: true,
            txHash: result.txHash,
            amountIn: result.amountIn,
            amountOut: result.amountOut,
            fromToken: result.fromSymbol,
            toToken: result.toSymbol,
            wallet: result.from,
            celoscanUrl: `https://celoscan.io/tx/${result.txHash}`,
          };
        } catch (e) {
          return { error: `Swap failed: ${(e as Error).message}` };
        }
      }

      case "get_swap_quote": {
        try {
          const result = await getSwapQuote(
            args.fromToken as string,
            args.toToken as string,
            args.amountIn as string
          );
          return {
            amountIn: args.amountIn,
            fromToken: result.fromSymbol,
            toToken: result.toSymbol,
            expectedOutput: result.amountOut,
            fee: `${result.fee / 10000}%`,
          };
        } catch (e) {
          return { error: `Quote failed: ${(e as Error).message}` };
        }
      }

      case "check_token_balance": {
        const state = getTrustState(companyId);
        if (!state.treasuryAddress) {
          return { error: "Company treasury is not initialized" };
        }
        try {
          const result = await getTokenBalance(
            state.treasuryAddress as `0x${string}`,
            args.token as string
          );
          return result;
        } catch (e) {
          return { error: (e as Error).message };
        }
      }

      case "list_supported_tokens": {
        return listSupportedTokens();
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  };
}
