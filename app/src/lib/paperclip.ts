import { getEnvConfig } from "./env";

async function paperclipFetch(path: string, options?: RequestInit) {
  const config = getEnvConfig();
  const url = `${config.paperclipApiUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paperclip ${res.status}: ${text}`);
  }
  return res.json();
}

// Companies
export async function listCompanies() {
  return paperclipFetch("/companies");
}

export async function createCompany(name: string, description: string) {
  return paperclipFetch("/companies", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function getCompany(companyId: string) {
  return paperclipFetch(`/companies/${companyId}`);
}

export async function deleteCompany(companyId: string) {
  return paperclipFetch(`/companies/${companyId}`, { method: "DELETE" });
}

// Agents
export async function listAgents(companyId: string) {
  return paperclipFetch(`/companies/${companyId}/agents`);
}

export async function createAgent(
  companyId: string,
  agent: {
    name: string;
    role: string;
    capabilities: string;
    adapterType: string;
    reportsTo?: string;
  }
) {
  return paperclipFetch(`/companies/${companyId}/agents`, {
    method: "POST",
    body: JSON.stringify(agent),
  });
}

export async function updateAgent(
  agentId: string,
  update: { status?: string; metadata?: Record<string, unknown> }
) {
  return paperclipFetch(`/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function createAgentKey(agentId: string, name: string) {
  return paperclipFetch(`/agents/${agentId}/keys`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

// Goals
export async function createGoal(
  companyId: string,
  goal: { title: string; level: string; status: string }
) {
  return paperclipFetch(`/companies/${companyId}/goals`, {
    method: "POST",
    body: JSON.stringify(goal),
  });
}

// Issues
export async function createIssue(
  companyId: string,
  issue: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    assigneeAgentId?: string;
    goalId?: string;
  }
) {
  return paperclipFetch(`/companies/${companyId}/issues`, {
    method: "POST",
    body: JSON.stringify(issue),
  });
}

export async function updateIssue(
  issueId: string,
  update: { status?: string; comment?: string }
) {
  return paperclipFetch(`/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function addIssueComment(issueId: string, body: string) {
  return paperclipFetch(`/issues/${issueId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function listIssues(companyId: string) {
  return paperclipFetch(`/companies/${companyId}/issues`);
}

export async function listIssueComments(issueId: string) {
  return paperclipFetch(`/issues/${issueId}/comments`);
}

// Issue checkout (atomic task claiming)
export async function checkoutIssue(
  issueId: string,
  agentId: string,
  expectedStatuses: string[] = ["todo"]
) {
  return paperclipFetch(`/issues/${issueId}/checkout`, {
    method: "POST",
    body: JSON.stringify({ agentId, expectedStatuses }),
  });
}

export async function releaseIssue(issueId: string) {
  return paperclipFetch(`/issues/${issueId}/release`, {
    method: "POST",
  });
}

// Get issue with full context for agent processing
export async function getIssueContext(issueId: string) {
  return paperclipFetch(`/issues/${issueId}/heartbeat-context`);
}

export async function getIssue(issueId: string) {
  return paperclipFetch(`/issues/${issueId}`);
}

// Org chart
export async function getOrgChart(companyId: string) {
  return paperclipFetch(`/companies/${companyId}/org`);
}

// Agent wakeup
export async function wakeupAgent(
  agentId: string,
  source: string,
  reason: string,
  payload?: Record<string, unknown>
) {
  return paperclipFetch(`/agents/${agentId}/wakeup`, {
    method: "POST",
    body: JSON.stringify({ source, reason, payload }),
  });
}

export async function getAgent(agentId: string) {
  return paperclipFetch(`/agents/${agentId}`);
}

// Activity & Dashboard
export async function getActivity(companyId: string) {
  return paperclipFetch(`/companies/${companyId}/activity`);
}

export async function createActivity(
  companyId: string,
  entry: { type: string; summary: string; agentId?: string; issueId?: string; metadata?: Record<string, unknown> }
) {
  return paperclipFetch(`/companies/${companyId}/activity`, {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

export async function getDashboard(companyId: string) {
  return paperclipFetch(`/companies/${companyId}/dashboard`);
}

export async function getSidebarBadges(companyId: string) {
  return paperclipFetch(`/companies/${companyId}/sidebar-badges`);
}
