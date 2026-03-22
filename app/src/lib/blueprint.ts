export type AgentRole =
  | "ceo"
  | "cto"
  | "cmo"
  | "engineer"
  | "designer"
  | "pm"
  | "qa"
  | "researcher"
  | "defi"
  | "general";

export interface BlueprintAgent {
  name: string;
  role: AgentRole;
  capabilities: string;
  adapterType: string;
  reportsTo: string | null;
}

export interface CompanyBlueprint {
  companyName: string;
  companyDescription: string;
  agents: BlueprintAgent[];
}

interface TeamTemplate {
  keywords: string[];
  companyName: string;
  agents: Omit<BlueprintAgent, "reportsTo">[];
}

const SHARED_AGENT_CAPABILITY = "x402-enabled API payments on Celo";

function withSharedCapabilities(capabilities: string) {
  return capabilities.includes(SHARED_AGENT_CAPABILITY)
    ? capabilities
    : `${capabilities}, ${SHARED_AGENT_CAPABILITY}`;
}

const MAIN_OPERATOR: Omit<BlueprintAgent, "reportsTo"> = {
  name: "Main Operator",
  role: "ceo",
  capabilities:
    "Company operations, payment execution, identity management, delegation oversight",
  adapterType: "http",
};

/** DeFi Operator — added to every company by default */
const DEFI_OPERATOR: Omit<BlueprintAgent, "reportsTo"> = {
  name: "DeFi Operator",
  role: "defi",
  capabilities:
    "Token swaps on Uniswap V3, swap quotes, token balance checks, stablecoin management (CELO, cUSD, USDC, USDT)",
  adapterType: "http",
};

const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    keywords: ["social media", "marketing", "content", "brand", "influencer"],
    companyName: "Social Media Agency",
    agents: [
      {
        name: "Social Strategy Agent",
        role: "cmo",
        capabilities: "Platform strategy, audience targeting, campaign planning",
        adapterType: "http",
      },
      {
        name: "Content Creation Agent",
        role: "general",
        capabilities: "Copywriting, post scheduling, content calendar management",
        adapterType: "http",
      },
      {
        name: "Design Agent",
        role: "designer",
        capabilities: "Visual assets, brand guidelines, creative direction",
        adapterType: "http",
      },
      {
        name: "Trend Research Agent",
        role: "researcher",
        capabilities: "Trend analysis, competitor monitoring, audience insights",
        adapterType: "http",
      },
    ],
  },
  {
    keywords: ["software", "dev", "saas", "app", "tech", "engineering", "code"],
    companyName: "Software Development Studio",
    agents: [
      {
        name: "Tech Lead Agent",
        role: "cto",
        capabilities: "Architecture decisions, code review, technical roadmap",
        adapterType: "http",
      },
      {
        name: "Backend Engineer Agent",
        role: "engineer",
        capabilities: "API development, database design, server infrastructure",
        adapterType: "http",
      },
      {
        name: "Frontend Engineer Agent",
        role: "engineer",
        capabilities: "UI development, responsive design, client-side logic",
        adapterType: "http",
      },
      {
        name: "QA Agent",
        role: "qa",
        capabilities: "Testing strategy, bug tracking, quality assurance",
        adapterType: "http",
      },
    ],
  },
  {
    keywords: ["ecommerce", "shop", "store", "retail", "sell", "product"],
    companyName: "E-Commerce Platform",
    agents: [
      {
        name: "Product Manager Agent",
        role: "pm",
        capabilities: "Product catalog, pricing strategy, inventory planning",
        adapterType: "http",
      },
      {
        name: "Marketing Agent",
        role: "cmo",
        capabilities: "SEO, ad campaigns, email marketing, conversion optimization",
        adapterType: "http",
      },
      {
        name: "Fulfillment Agent",
        role: "general",
        capabilities: "Order processing, shipping coordination, customer support",
        adapterType: "http",
      },
      {
        name: "Analytics Agent",
        role: "researcher",
        capabilities: "Sales analytics, customer behavior, revenue reporting",
        adapterType: "http",
      },
    ],
  },
  {
    keywords: ["finance", "trading", "investment", "fund", "defi", "crypto"],
    companyName: "Financial Services Firm",
    agents: [
      {
        name: "Risk Analysis Agent",
        role: "researcher",
        capabilities: "Risk assessment, portfolio analysis, market monitoring",
        adapterType: "http",
      },
      {
        name: "Compliance Agent",
        role: "general",
        capabilities: "Regulatory compliance, audit trail, policy enforcement",
        adapterType: "http",
      },
      {
        name: "Trading Strategy Agent",
        role: "general",
        capabilities: "Trade execution strategy, market signals, asset allocation",
        adapterType: "http",
      },
      {
        name: "Reporting Agent",
        role: "general",
        capabilities: "Financial reports, dashboards, investor communications",
        adapterType: "http",
      },
    ],
  },
  {
    keywords: ["consulting", "advisory", "agency", "service", "freelance"],
    companyName: "Consulting Agency",
    agents: [
      {
        name: "Client Relations Agent",
        role: "pm",
        capabilities: "Client onboarding, project scoping, relationship management",
        adapterType: "http",
      },
      {
        name: "Research Analyst Agent",
        role: "researcher",
        capabilities: "Market research, competitive analysis, industry reports",
        adapterType: "http",
      },
      {
        name: "Strategy Agent",
        role: "general",
        capabilities: "Strategic planning, recommendations, deliverable creation",
        adapterType: "http",
      },
      {
        name: "Operations Agent",
        role: "general",
        capabilities: "Resource allocation, scheduling, internal coordination",
        adapterType: "http",
      },
    ],
  },
];

const DEFAULT_TEMPLATE: TeamTemplate = {
  keywords: [],
  companyName: "AI Company",
  agents: [
    {
      name: "Operations Agent",
      role: "pm",
      capabilities: "Project management, workflow coordination, task tracking",
      adapterType: "http",
    },
    {
      name: "Research Agent",
      role: "researcher",
      capabilities: "Data gathering, analysis, insight generation",
      adapterType: "http",
    },
    {
      name: "Specialist Agent",
      role: "general",
      capabilities: "Domain-specific execution, deliverable creation",
      adapterType: "http",
    },
    {
      name: "Quality Agent",
      role: "qa",
      capabilities: "Output review, quality assurance, feedback loops",
      adapterType: "http",
    },
  ],
};

function matchTemplate(prompt: string): TeamTemplate {
  const lower = prompt.toLowerCase();
  for (const template of TEAM_TEMPLATES) {
    if (template.keywords.some((kw) => lower.includes(kw))) {
      return template;
    }
  }
  return DEFAULT_TEMPLATE;
}

export function generateBlueprint(prompt: string): CompanyBlueprint {
  const template = matchTemplate(prompt);

  const mainOperator: BlueprintAgent = {
    ...MAIN_OPERATOR,
    capabilities: withSharedCapabilities(MAIN_OPERATOR.capabilities),
    reportsTo: null,
  };
  const defiOperator: BlueprintAgent = {
    ...DEFI_OPERATOR,
    capabilities: withSharedCapabilities(DEFI_OPERATOR.capabilities),
    reportsTo: "main-operator",
  };
  const teamAgents: BlueprintAgent[] = template.agents.map((a) => ({
    ...a,
    capabilities: withSharedCapabilities(a.capabilities),
    reportsTo: "main-operator",
  }));

  // Derive company name from prompt or use template default
  const companyName = template.companyName;
  const companyDescription = `AI-powered ${companyName.toLowerCase()} generated from prompt: "${prompt}"`;

  return {
    companyName,
    companyDescription,
    agents: [mainOperator, defiOperator, ...teamAgents],
  };
}
