import { NextRequest, NextResponse } from "next/server";
import { runAgentLoop, TOOL_LOOP_INCOMPLETE_RESPONSE, ToolCallResult } from "@/lib/gemini";
import { AGENT_TOOLS, createToolExecutor } from "@/lib/agent-tools";
import {
  createIssue,
  addIssueComment,
  listAgents,
  listIssues,
  updateIssue,
} from "@/lib/paperclip";
import { getTrustState } from "@/lib/trust-store";
import { getOperatorAddress, getCusdBalance } from "@/lib/celo";

function toolResultFailed(result: unknown) {
  if (!result || typeof result !== "object") {
    return false;
  }

  if ("error" in result) {
    return true;
  }

  if ("ok" in result && result.ok === false) {
    return true;
  }

  return false;
}

function taskCompletedReliably(result: { response: string; toolCalls: ToolCallResult[] }) {
  if (!result.response.trim()) {
    return false;
  }

  if (result.response === TOOL_LOOP_INCOMPLETE_RESPONSE) {
    return false;
  }

  if (result.toolCalls.length === 0) {
    return true;
  }

  return result.toolCalls.some((toolCall) => !toolResultFailed(toolCall.result));
}

export async function POST(req: NextRequest) {
  const { companyId, agentId, prompt } = await req.json();

  if (!companyId || !prompt) {
    return NextResponse.json(
      { error: "companyId and prompt are required" },
      { status: 400 }
    );
  }

  try {
    // Get company context
    const [agents, issues] = await Promise.all([
      listAgents(companyId),
      listIssues(companyId),
    ]);

    const targetAgent = agentId
      ? agents.find((a: { id: string }) => a.id === agentId)
      : agents[0];

    if (!targetAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get onchain context
    const trustState = getTrustState(companyId);
    const operatorAddress = getOperatorAddress();
    let cusdBalance = "unknown";
    try {
      cusdBalance = await getCusdBalance(operatorAddress);
    } catch {
      // Non-critical
    }

    // Build system prompt with full context
    const systemPrompt = buildAgentSystemPrompt(
      targetAgent,
      agents,
      issues,
      trustState,
      operatorAddress,
      cusdBalance
    );

    // Create a task issue for tracking
    const issue = await createIssue(companyId, {
      title: prompt.slice(0, 80) + (prompt.length > 80 ? "..." : ""),
      description: `User prompt: ${prompt}`,
      priority: "medium",
      status: "in_progress",
      assigneeAgentId: targetAgent.id,
    });

    // Record the user prompt
    await addIssueComment(issue.id, `**User:** ${prompt}`);

    // Run the agent loop with tool calling
    const executor = createToolExecutor(companyId, targetAgent.id);
    const result = await runAgentLoop(
      systemPrompt,
      prompt,
      AGENT_TOOLS,
      executor,
      5
    );
    const completed = taskCompletedReliably(result);

    // Record tool calls as comments
    for (const tc of result.toolCalls) {
      const resultStr =
        typeof tc.result === "string"
          ? tc.result
          : JSON.stringify(tc.result, null, 2);
      await addIssueComment(
        issue.id,
        `**Tool: ${tc.name}**\nArgs: \`${JSON.stringify(tc.args)}\`\nResult:\n\`\`\`json\n${resultStr}\n\`\`\``
      );
    }

    // Record the agent's final response
    await addIssueComment(
      issue.id,
      `**${targetAgent.name}** (${targetAgent.role}):\n\n${result.response}`
    );

    await updateIssue(issue.id, {
      status: completed ? "done" : "blocked",
      ...(completed
        ? {}
        : {
            comment:
              "This task did not finish with a reliable deliverable. Review the failed tool calls or provide a specific working endpoint before retrying.",
          }),
    });

    return NextResponse.json({
      success: completed,
      completed,
      agent: {
        id: targetAgent.id,
        name: targetAgent.name,
        role: targetAgent.role,
      },
      response: result.response,
      toolCalls: result.toolCalls,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

function buildAgentSystemPrompt(
  agent: { name: string; role: string; capabilities: string },
  allAgents: { name: string; role: string; id: string }[],
  issues: { title: string; status: string; identifier: string }[],
  trustState: {
    selfVerified: boolean;
    erc8004Registered: boolean;
    delegationActive: boolean;
    delegationPolicy: { token: string; maxAmountPerTx: string; recipientAddress: string } | null;
  },
  operatorAddress: string,
  cusdBalance: string
) {
  const teamList = allAgents
    .map((a) => `- ${a.name} (${a.role}) [id: ${a.id}]`)
    .join("\n");

  const recentIssues = issues
    .slice(0, 10)
    .map((i) => `- [${i.identifier}] ${i.title} (${i.status})`)
    .join("\n");

  const policyInfo = trustState.delegationPolicy
    ? `Token: ${trustState.delegationPolicy.token}, Max per tx: ${trustState.delegationPolicy.maxAmountPerTx}, Recipient: ${trustState.delegationPolicy.recipientAddress}`
    : "Not configured";

  return `You are ${agent.name}, an AI agent with the role of ${agent.role} in an AI-powered company running on the Celo blockchain.

Your capabilities: ${agent.capabilities}

## Your Team
${teamList}

## Recent Tasks
${recentIssues || "No tasks yet."}

## Onchain Context
- Operator wallet: ${operatorAddress}
- cUSD balance: ${cusdBalance}
- Self verified: ${trustState.selfVerified ? "Yes" : "No"}
- ERC-8004 registered: ${trustState.erc8004Registered ? "Yes" : "No"}
- Delegation active: ${trustState.delegationActive ? "Yes" : "No"}
- Delegation policy: ${policyInfo}

## Instructions
- You are ${agent.name}. Respond in character with your specific expertise.
- You have access to real tools that execute onchain transactions on Celo mainnet.
- When asked to check balances, actually use the check_cusd_balance or check_celo_balance tools.
- When asked to send money or make payments, use the transfer_cusd tool. This sends REAL cUSD.
- Only use x402_fetch when the exact endpoint is provided in the task or when you already know the endpoint is real and reachable.
- Never invent premium APIs, x402 URLs, partner endpoints, or arbitrary external domains.
- If no specific external endpoint is provided, use your own reasoning plus the task/company context to produce a concrete answer.
- The transfer_cusd tool enforces delegation policy limits automatically.
- When you need to delegate work, use create_task to assign it to a teammate by their agent ID.
- Always use tools when they're relevant and reliable, but do not force tool usage when the task can be solved directly.
- Be concise and action-oriented. Report results clearly.
- If a tool call fails, explain the error and suggest next steps.`;
}
