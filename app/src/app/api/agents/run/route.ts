import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent-runner";
import { listAgents, updateAgent } from "@/lib/paperclip";

/**
 * POST /api/agents/run
 * Trigger an agent (or all agents) to process pending tasks autonomously.
 *
 * Body: { companyId, agentId? }
 * - If agentId provided, run only that agent
 * - If omitted, run all agents with pending tasks
 */
export async function POST(req: NextRequest) {
  const { companyId, agentId } = await req.json();

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  try {
    const agents = await listAgents(companyId);
    const agentsToRun = agentId
      ? agents.filter((a: { id: string }) => a.id === agentId)
      : agents;

    if (agentsToRun.length === 0) {
      return NextResponse.json(
        { error: "No agents found" },
        { status: 404 }
      );
    }

    const results = [];

    for (const agent of agentsToRun) {
      try {
        // Set agent to running
        await updateAgent(agent.id, { status: "running" }).catch(() => {});

        const result = await runAgent(companyId, agent.id);

        // Set back to active if it processed anything, idle if not
        const newStatus =
          result.issuesProcessed.length > 0 ? "active" : "idle";
        await updateAgent(agent.id, { status: newStatus }).catch(() => {});

        results.push(result);
      } catch (e) {
        await updateAgent(agent.id, { status: "error" }).catch(() => {});
        results.push({
          agentId: agent.id,
          agentName: agent.name,
          issuesProcessed: [],
          error: (e as Error).message,
        });
      }
    }

    const totalProcessed = results.reduce(
      (sum, r) => sum + r.issuesProcessed.length,
      0
    );

    return NextResponse.json({
      success: true,
      agentsRun: results.length,
      totalIssuesProcessed: totalProcessed,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
