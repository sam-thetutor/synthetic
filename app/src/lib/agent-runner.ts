// Autonomous agent runner — processes pending tasks for an agent using LLM + tools.
// This is the "brain" that makes agents autonomous.

import { runAgentLoop, TOOL_LOOP_INCOMPLETE_RESPONSE } from "./gemini";
import { AGENT_TOOLS, createToolExecutor } from "./agent-tools";
import {
  listAgents,
  listIssues,
  listIssueComments,
  checkoutIssue,
  releaseIssue,
  addIssueComment,
  updateIssue,
  createActivity,
} from "./paperclip";
import { getTrustState } from "./trust-store";
import { getOperatorAddress, getCusdBalance } from "./celo";
import { ToolCallResult } from "./gemini";

export interface AgentRunResult {
  agentId: string;
  agentName: string;
  issuesProcessed: {
    issueId: string;
    identifier: string;
    title: string;
    response: string;
    toolCalls: ToolCallResult[];
    status: "completed" | "failed";
    error?: string;
  }[];
}

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

function taskCompletedReliably(loopResult: {
  response: string;
  toolCalls: ToolCallResult[];
}) {
  if (!loopResult.response.trim()) {
    return false;
  }

  if (loopResult.response === TOOL_LOOP_INCOMPLETE_RESPONSE) {
    return false;
  }

  if (loopResult.toolCalls.length === 0) {
    return true;
  }

  return loopResult.toolCalls.some((toolCall) => !toolResultFailed(toolCall.result));
}

function isPendingStatus(status: string) {
  return status === "todo" || status === "in_progress";
}

function isImplicitlyTargetedMessageIssue(
  issue: {
    title: string;
    description?: string;
    assigneeAgentId: string | null;
  },
  agent: { id: string; name: string }
) {
  if (issue.assigneeAgentId) {
    return false;
  }

  const targetedTitleMarker = `-> ${agent.name}]`;
  return (
    issue.title.includes(targetedTitleMarker) &&
    issue.description?.startsWith("Inter-agent message from ") === true
  );
}

/**
 * Run an agent: pick up all todo issues assigned to it, process each one.
 */
export async function runAgent(
  companyId: string,
  agentId: string,
  issueId?: string
): Promise<AgentRunResult> {
  const [agents, issues] = await Promise.all([
    listAgents(companyId),
    listIssues(companyId),
  ]);

  const agent = agents.find((a: { id: string }) => a.id === agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // Find todo issues assigned to this agent
  const pendingIssues = issues
    .filter(
      (i: {
        id: string;
        title: string;
        description?: string;
        assigneeAgentId: string | null;
        status: string;
      }) =>
        isPendingStatus(i.status) &&
        (i.assigneeAgentId === agentId ||
          isImplicitlyTargetedMessageIssue(i, {
            id: agentId,
            name: agent.name,
          }))
    )
    .filter((i: { id: string }) => (issueId ? i.id === issueId : true));

  const result: AgentRunResult = {
    agentId,
    agentName: agent.name,
    issuesProcessed: [],
  };

  if (pendingIssues.length === 0) return result;

  // Get onchain context once
  const trustState = getTrustState(companyId);
  const operatorAddress = getOperatorAddress();
  let cusdBalance = "unknown";
  try {
    cusdBalance = await getCusdBalance(operatorAddress);
  } catch {
    // Non-critical
  }

  const executor = createToolExecutor(companyId, agentId);

  for (const issue of pendingIssues) {
    try {
      // Try atomic checkout for unowned tasks, but allow already-assigned work to continue.
      try {
        await checkoutIssue(issue.id, agentId, ["todo", "in_progress"]);
      } catch {
        if (issue.assigneeAgentId !== agentId) {
          // Already checked out by someone else, skip.
          continue;
        }
      }

      await updateIssue(issue.id, { status: "in_progress" });

      // Get existing comments for context
      const comments = await listIssueComments(issue.id);
      const commentContext = comments
        .slice(0, 10)
        .map((c: { body: string }) => c.body)
        .join("\n---\n");

      // Build the prompt from the issue
      const taskPrompt = buildTaskPrompt(issue, commentContext);

      // Build system prompt
      const systemPrompt = buildAgentSystemPrompt(
        agent,
        agents,
        issues,
        trustState,
        operatorAddress,
        cusdBalance
      );

      // Run the agent loop
      const loopResult = await runAgentLoop(
        systemPrompt,
        taskPrompt,
        AGENT_TOOLS,
        executor,
        5
      );

      // Record tool calls
      for (const tc of loopResult.toolCalls) {
        const resultStr =
          typeof tc.result === "string"
            ? tc.result
            : JSON.stringify(tc.result, null, 2);
        await addIssueComment(
          issue.id,
          `**Tool: ${tc.name}**\nArgs: \`${JSON.stringify(tc.args)}\`\nResult:\n\`\`\`json\n${resultStr}\n\`\`\``
        );
      }

      // Record response
      await addIssueComment(
        issue.id,
        `**${agent.name}** (${agent.role}):\n\n${loopResult.response}`
      );

      const completed = taskCompletedReliably(loopResult);
      await updateIssue(issue.id, {
        status: completed ? "done" : "blocked",
        ...(completed
          ? {}
          : {
              comment:
                "Execution did not finish with a reliable deliverable. Review the failed tool calls or provide a specific working endpoint before retrying.",
            }),
      });

      // Release checkout
      try {
        await releaseIssue(issue.id);
      } catch {
        // Already released or completed
      }

      // Log activity
      await createActivity(companyId, {
        type: completed ? "agent_task_completed" : "agent_task_blocked",
        summary: completed
          ? `${agent.name} completed: ${issue.title}`
          : `${agent.name} blocked: ${issue.title}`,
        agentId,
        issueId: issue.id,
        metadata: {
          toolCallCount: loopResult.toolCalls.length,
          completed,
        },
      }).catch(() => {});

      result.issuesProcessed.push({
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        response: loopResult.response,
        toolCalls: loopResult.toolCalls,
        status: completed ? "completed" : "failed",
        ...(completed
          ? {}
          : {
              error:
                "Task did not complete with a reliable deliverable before the tool loop ended.",
            }),
      });
    } catch (e) {
      const error = (e as Error).message;

      // Record failure
      await addIssueComment(issue.id, `**Error:** ${error}`).catch(() => {});
      await updateIssue(issue.id, { status: "blocked" }).catch(() => {});
      try {
        await releaseIssue(issue.id);
      } catch {
        // ignore
      }

      result.issuesProcessed.push({
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        response: "",
        toolCalls: [],
        status: "failed",
        error,
      });
    }
  }

  return result;
}

/**
 * Send a message from one agent to another:
 * Creates an issue assigned to the target, runs the target agent, returns response.
 */
export async function messageAgent(
  companyId: string,
  fromAgentId: string,
  toAgentId: string,
  message: string
): Promise<{
  response: string;
  toolCalls: ToolCallResult[];
  issueId: string;
  identifier: string;
}> {
  const agents = await listAgents(companyId);
  const fromAgent = agents.find((a: { id: string }) => a.id === fromAgentId);
  const toAgent = agents.find((a: { id: string }) => a.id === toAgentId);

  if (!fromAgent) throw new Error(`Sender agent ${fromAgentId} not found`);
  if (!toAgent) throw new Error(`Target agent ${toAgentId} not found`);

  // Create the issue as inter-agent communication
  const { createIssue } = await import("./paperclip");
  const issue = await createIssue(companyId, {
    title: `[${fromAgent.name} -> ${toAgent.name}] ${message.slice(0, 60)}...`,
    description: `Inter-agent message from ${fromAgent.name} (${fromAgent.role}):\n\n${message}`,
    priority: "medium",
    status: "todo",
    assigneeAgentId: toAgentId,
  });

  await addIssueComment(
    issue.id,
    `**${fromAgent.name}** (${fromAgent.role}) says:\n\n${message}`
  );

  // Log activity
  await createActivity(companyId, {
    type: "agent_message",
    summary: `${fromAgent.name} messaged ${toAgent.name}: ${message.slice(0, 80)}`,
    agentId: fromAgentId,
    issueId: issue.id,
  }).catch(() => {});

  // Now run the target agent on this specific issue
  const result = await runAgent(companyId, toAgentId, issue.id);

  const processed = result.issuesProcessed.find(
    (p) => p.issueId === issue.id
  );

  return {
    response: processed?.response || "Agent did not produce a response.",
    toolCalls: processed?.toolCalls || [],
    issueId: issue.id,
    identifier: issue.identifier,
  };
}

function buildTaskPrompt(
  issue: { title: string; description?: string },
  commentContext: string
) {
  let prompt = `## Task: ${issue.title}`;
  if (issue.description) {
    prompt += `\n\n${issue.description}`;
  }
  if (commentContext) {
    prompt += `\n\n## Previous Discussion:\n${commentContext}`;
  }
  prompt += "\n\nProcess this task. Use your tools to take real action, then report what you did.";
  return prompt;
}

function buildAgentSystemPrompt(
  agent: { name: string; role: string; capabilities: string },
  allAgents: { name: string; role: string; id: string }[],
  issues: { title: string; status: string; identifier: string }[],
  trustState: {
    selfVerified: boolean;
    erc8004Registered: boolean;
    delegationActive: boolean;
    delegationPolicy: {
      token: string;
      maxAmountPerTx: string;
      recipientAddress: string;
    } | null;
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

  return `You are ${agent.name}, an autonomous AI agent with the role of ${agent.role} in an AI-powered company on Celo.

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
- You are an AUTONOMOUS agent. Take real action, don't just describe what you'd do.
- Use tools to check balances, make payments, create tasks, and communicate.
- Every agent has x402 payment support by default, but never invent external API URLs or assume a paid endpoint exists.
- Only use x402_fetch when the exact endpoint is provided in the task, comments, or company context, or when you already know the endpoint is real and reachable.
- If no specific external endpoint is given, complete the task using the existing company context, issue history, teammate messages, and your own reasoning instead of fabricating network calls.
- When a task is outside your expertise, use message_agent to delegate to the right teammate.
- If you need help from a specific teammate, use create_task to assign them work.
- Be concise. Report what you did and the concrete deliverable you produced.
- If a tool call fails, explain the error clearly.`;
}
