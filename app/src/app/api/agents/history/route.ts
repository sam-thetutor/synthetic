import { NextRequest, NextResponse } from "next/server";
import { listIssues, listIssueComments, listAgents } from "@/lib/paperclip";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 }
    );
  }

  try {
    const [issues, agents] = await Promise.all([
      listIssues(companyId),
      listAgents(companyId),
    ]);

    const agentMap = new Map<string, { name: string; role: string }>();
    for (const a of agents) {
      agentMap.set(a.id, { name: a.name, role: a.role });
    }

    // Find issues that came from agent chat (have "User prompt:" in description)
    const chatIssues = issues
      .filter(
        (i: { description?: string }) =>
          i.description && i.description.startsWith("User prompt:")
      )
      .slice(0, 20);

    // Load comments for each
    const conversations = await Promise.all(
      chatIssues.map(
        async (issue: {
          id: string;
          identifier: string;
          title: string;
          description: string;
          status: string;
          assigneeAgentId: string | null;
          createdAt: string;
        }) => {
          const comments = await listIssueComments(issue.id);
          const assignee = issue.assigneeAgentId
            ? agentMap.get(issue.assigneeAgentId)
            : null;

          // Parse comments to extract user prompt, tool calls, and agent response
          const userComment = comments.find(
            (c: { body: string }) => c.body.startsWith("**User:**")
          );
          const toolComments = comments.filter(
            (c: { body: string }) => c.body.startsWith("**Tool:")
          );
          const agentComment = comments.find(
            (c: { body: string }) =>
              c.body.startsWith("**") &&
              !c.body.startsWith("**User:**") &&
              !c.body.startsWith("**Tool:")
          );

          // Extract tool call info
          const toolCalls = toolComments.map((c: { body: string }) => {
            const nameMatch = c.body.match(/\*\*Tool: (.+?)\*\*/);
            const argsMatch = c.body.match(/Args: `(.+?)`/);
            const resultMatch = c.body.match(/```json\n([\s\S]*?)\n```/);
            return {
              name: nameMatch?.[1] || "unknown",
              args: argsMatch?.[1] || "{}",
              result: resultMatch?.[1] || "",
            };
          });

          // Extract agent response text
          let agentResponse = "";
          if (agentComment) {
            // Remove the agent name prefix
            agentResponse = agentComment.body.replace(
              /^\*\*[^*]+\*\* \([^)]+\):\n\n/,
              ""
            );
          }

          return {
            issueId: issue.id,
            issueIdentifier: issue.identifier,
            prompt: userComment
              ? userComment.body.replace("**User:** ", "")
              : issue.description.replace("User prompt: ", ""),
            response: agentResponse,
            toolCalls,
            agentName: assignee?.name || "Agent",
            agentRole: assignee?.role || "general",
            status: issue.status,
            timestamp: issue.createdAt,
          };
        }
      )
    );

    return NextResponse.json({ conversations });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
