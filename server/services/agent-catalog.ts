export type AgentCatalogEntry = {
  id: string;
  label: string;
  role: string;
  capabilities: string[];
  risk: 'READ_ONLY' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'CRITICAL';
  execution: 'brain_cycle' | 'admin_invoked' | 'approval_required' | 'read_only' | 'not_configured';
};

/** Descriptive catalog only; it does not register or execute agents. */
export const AGENT_CATALOG: readonly AgentCatalogEntry[] = [
  {
    id: 'llm-learner',
    label: 'LLM Learner',
    role: 'Extracts knowledge, validates ideas, and supports self-improvement.',
    capabilities: ['learning', 'idea-validation', 'self-improvement'],
    risk: 'LOW_RISK',
    execution: 'brain_cycle',
  },
  {
    id: 'code-explorer',
    label: 'Code Explorer',
    role: 'Indexes and reads bounded repository source context.',
    capabilities: ['repository-index', 'source-preview'],
    risk: 'READ_ONLY',
    execution: 'read_only',
  },
  {
    id: 'code-agent',
    label: 'Code Agent',
    role: 'Prepares repository change proposals for explicit approval.',
    capabilities: ['repository-analysis', 'patch-proposals'],
    risk: 'HIGH_RISK',
    execution: 'approval_required',
  },
  {
    id: 'web-research',
    label: 'Web Research',
    role: 'Produces research context when network policy permits.',
    capabilities: ['research', 'trend-analysis'],
    risk: 'LOW_RISK',
    execution: 'brain_cycle',
  },
  {
    id: 'growth-engineer',
    label: 'Growth Engineer',
    role: 'Analyzes funnels and proposes experiments for approval.',
    capabilities: ['funnel-analysis', 'experiment-proposals'],
    risk: 'HIGH_RISK',
    execution: 'brain_cycle',
  },
  {
    id: 'platform-analyzer',
    label: 'Platform Analyzer',
    role: 'Analyzes module health and generates growth suggestions.',
    capabilities: ['platform-health', 'growth-suggestions'],
    risk: 'LOW_RISK',
    execution: 'brain_cycle',
  },
  {
    id: 'module-analyzers',
    label: 'Module Analyzers',
    role: 'Produces per-module insights for review.',
    capabilities: ['module-analysis', 'platform-insights'],
    risk: 'MODERATE_RISK',
    execution: 'brain_cycle',
  },
  {
    id: 'document-reader',
    label: 'Document Reader',
    role: 'Extracts structured knowledge from approved documents.',
    capabilities: ['document-ingestion', 'knowledge-extraction'],
    risk: 'LOW_RISK',
    execution: 'admin_invoked',
  },
  {
    id: 'research-agent',
    label: 'Research Agent',
    role: 'Dedicated research orchestration beyond the existing Brain research phase.',
    capabilities: ['research-orchestration'],
    risk: 'LOW_RISK',
    execution: 'not_configured',
  },
  {
    id: 'devops-agent',
    label: 'DevOps Agent',
    role: 'Infrastructure and deployment operations behind explicit approval.',
    capabilities: ['deployment', 'infrastructure'],
    risk: 'CRITICAL',
    execution: 'not_configured',
  },
  {
    id: 'security-agent',
    label: 'Security Agent',
    role: 'Security review and controlled remediation.',
    capabilities: ['security-review', 'hardening'],
    risk: 'HIGH_RISK',
    execution: 'not_configured',
  },
  {
    id: 'testing-agent',
    label: 'Testing Agent',
    role: 'Test planning and controlled validation execution.',
    capabilities: ['tests', 'build-validation'],
    risk: 'LOW_RISK',
    execution: 'admin_invoked',
  },
  {
    id: 'project-agent',
    label: 'Project Agent',
    role: 'Project planning and cross-capability coordination.',
    capabilities: ['planning', 'coordination'],
    risk: 'MODERATE_RISK',
    execution: 'not_configured',
  },
];
