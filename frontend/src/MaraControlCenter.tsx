import { useEffect, useState } from 'react';
import './styles/MaraControlCenter.css';
import { readCapabilityResults } from './utils/capability-refresh';
import { MaraVoiceControl } from './components/MaraVoiceControl';
import type {
  BrainControlSnapshot,
  BrainStatus,
  ControlLogSnapshot,
  DashboardOverview,
  ExperimentSnapshot,
  ProviderHealth,
  RepositoryStatus,
  RepositorySearchResult,
  RepositoryFilePreview,
  RepositoryGitStatus,
  AgentCatalogEntry,
  ToolCatalogEntry,
  IntegrationStatus,
  ControlAuditAction,
  WorkerStatus,
  CodeAgentPlan,
  TaskSnapshot,
  HelloMaraModuleEntry,
  ModuleHealthState,
  GitHubStatusSnapshot,
  RailwayStatusSnapshot,
} from './types/control';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return 'Not run';
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(value: string | null): string {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString();
}

function healthLabel(status: ModuleHealthState): string {
  if (status === 'healthy') return 'Healthy';
  if (status === 'warning') return 'Warning';
  if (status === 'error') return 'Error';
  return 'Not configured';
}

function healthDotClass(status: ModuleHealthState): string {
  return `mcc-health-dot mcc-health-dot--${status}`;
}

export default function MaraControlCenter() {
  const [dashboard, setDashboard] = useState<DashboardOverview | null>(null);
  const [brain, setBrain] = useState<BrainStatus | null>(null);
  const [provider, setProvider] = useState<ProviderHealth | null>(null);
  const [logs, setLogs] = useState<ControlLogSnapshot | null>(null);
  const [experiments, setExperiments] = useState<ExperimentSnapshot | null>(null);
  const [tasks, setTasks] = useState<TaskSnapshot | null>(null);
  const [repository, setRepository] = useState<RepositoryStatus | null>(null);
  const [repositoryQuery, setRepositoryQuery] = useState('');
  const [repositoryResults, setRepositoryResults] = useState<RepositorySearchResult[]>([]);
  const [repositoryPreview, setRepositoryPreview] = useState<RepositoryFilePreview | null>(null);
  const [gitStatus, setGitStatus] = useState<RepositoryGitStatus | null>(null);
  const [agents, setAgents] = useState<AgentCatalogEntry[]>([]);
  const [tools, setTools] = useState<ToolCatalogEntry[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [auditActions, setAuditActions] = useState<ControlAuditAction[]>([]);
  const [worker, setWorker] = useState<WorkerStatus | null>(null);
  const [codePlans, setCodePlans] = useState<CodeAgentPlan[]>([]);
  const [modules, setModules] = useState<HelloMaraModuleEntry[]>([]);
  const [githubStatus, setGithubStatus] = useState<GitHubStatusSnapshot | null>(null);
  const [railwayStatus, setRailwayStatus] = useState<RailwayStatusSnapshot | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<HelloMaraModuleEntry['id'] | null>('missions');
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<number | null>(null);
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
  const [codeTaskDescription, setCodeTaskDescription] = useState('');
  const [codeTaskMessage, setCodeTaskMessage] = useState('');
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [anthropicKeyMessage, setAnthropicKeyMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const requests = [
        ['overview', getJson<DashboardOverview>('/api/control/overview')],
        ['brain', getJson<BrainControlSnapshot>('/api/control/brain/status')],
        ['logs', getJson<ControlLogSnapshot>('/api/control/logs?brainLimit=5&alertLimit=5')],
        ['experiments', getJson<ExperimentSnapshot>('/api/admin/mara/experiments?status=proposed&limit=5')],
        ['tasks', getJson<TaskSnapshot>('/api/control/tasks/status')],
        ['repository', getJson<RepositoryStatus>('/api/control/repository')],
        ['git', getJson<RepositoryGitStatus>('/api/control/repository/git')],
        ['agents', getJson<{ agents: AgentCatalogEntry[] }>('/api/control/agents')],
        ['tools', getJson<{ tools: ToolCatalogEntry[] }>('/api/control/tools')],
        ['integrations', getJson<{ integrations: IntegrationStatus[] }>('/api/control/integrations')],
        ['audit', getJson<{ actions: ControlAuditAction[] }>('/api/control/audit/actions')],
        ['worker', getJson<WorkerStatus>('/api/control/worker/status')],
        ['codePlans', getJson<{ plans: CodeAgentPlan[] }>('/api/control/code-agent/plans')],
        ['modules', getJson<{ modules: HelloMaraModuleEntry[] }>('/api/control/modules')],
        ['github', getJson<GitHubStatusSnapshot>('/api/control/github/status')],
        ['railway', getJson<RailwayStatusSnapshot>('/api/control/railway/status')],
      ] as const;
      const results = await Promise.allSettled(requests.map(([, request]) => request));
      if (!active) return;
      const { values, failures } = readCapabilityResults<{
        overview: DashboardOverview;
        brain: BrainControlSnapshot;
        logs: ControlLogSnapshot;
        experiments: ExperimentSnapshot;
        tasks: TaskSnapshot;
        repository: RepositoryStatus;
        git: RepositoryGitStatus;
        agents: { agents: AgentCatalogEntry[] };
        tools: { tools: ToolCatalogEntry[] };
        integrations: { integrations: IntegrationStatus[] };
        audit: { actions: ControlAuditAction[] };
        worker: WorkerStatus;
        codePlans: { plans: CodeAgentPlan[] };
        modules: { modules: HelloMaraModuleEntry[] };
        github: GitHubStatusSnapshot;
        railway: RailwayStatusSnapshot;
      }>(requests.map(([name]) => name), results);
      if (values.overview) setDashboard(values.overview);
      if (values.brain) { setBrain(values.brain.brain); setProvider(values.brain.ai); }
      if (values.logs) setLogs(values.logs);
      if (values.experiments) setExperiments(values.experiments);
      if (values.tasks) setTasks(values.tasks);
      if (values.repository) setRepository(values.repository);
      if (values.git) setGitStatus(values.git);
      if (values.agents) setAgents(values.agents.agents);
      if (values.tools) setTools(values.tools.tools);
      if (values.integrations) setIntegrations(values.integrations.integrations);
      if (values.audit) setAuditActions(values.audit.actions);
      if (values.worker) setWorker(values.worker);
      if (values.codePlans) setCodePlans(values.codePlans.plans);
      if (values.modules) {
        setModules(values.modules.modules);
        setSelectedModuleId((current) => current ?? values.modules!.modules[0]?.id ?? null);
      }
      if (values.github) setGithubStatus(values.github);
      if (values.railway) setRailwayStatus(values.railway);
      setError(failures.length ? `Unavailable: ${failures.join(', ')}` : null);
      setUpdatedAt(new Date());
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function decideExperiment(id: number, decision: 'approve' | 'reject') {
    setApprovalBusy(id);
    try {
      const response = await fetch(`/api/admin/mara/experiments/${id}/${decision}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: `Decision from Mara Control Center: ${decision}` }),
      });
      if (!response.ok) throw new Error(`Approval request returned ${response.status}`);
      setExperiments((current) => current
        ? { ...current, experiments: current.experiments.filter((experiment) => experiment.id !== id), count: Math.max(0, current.count - 1) }
        : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Approval request failed');
    } finally {
      setApprovalBusy(null);
    }
  }

  async function searchRepository() {
    const query = repositoryQuery.trim();
    if (!query) return setRepositoryResults([]);
    try {
      const response = await getJson<{ files: RepositorySearchResult[] }>(`/api/admin/mara/code/search?q=${encodeURIComponent(query)}&limit=20`);
      setRepositoryResults(response.files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Repository search failed');
    }
  }

  async function previewRepositoryFile(path: string) {
    try {
      const preview = await getJson<RepositoryFilePreview>(`/api/admin/mara/code/file?path=${encodeURIComponent(path)}&maxBytes=6000&reason=control-center%20browse`);
      setRepositoryPreview(preview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Repository preview failed');
    }
  }

  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[0] ?? null;

  async function queueReadOnlyTask(taskType: 'brain.snapshot' | 'repository.overview', title: string, module?: HelloMaraModuleEntry | null) {
    setTaskBusy(taskType);
    try {
      const response = await fetch('/api/control/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType, title, risk: 'READ_ONLY', priority: 'low', payload: module ? { moduleId: module.id, moduleName: module.displayName } : {} }),
      });
      if (!response.ok) throw new Error(`Task creation returned ${response.status}`);
      const data = await response.json() as { task?: TaskSnapshot['tasks'][number] };
      if (data.task) {
        setTasks((current) => current
          ? { ...current, tasks: [data.task!, ...current.tasks], counts: { ...current.counts, [data.task!.status]: (current.counts[data.task!.status] ?? 0) + 1 } }
          : current);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task creation failed');
    } finally {
      setTaskBusy(null);
    }
  }

  async function queueAgentTask(agentId: string, toolType: string, module?: HelloMaraModuleEntry | null) {
    setTaskBusy(`${agentId}:${toolType}`);
    try {
      const response = await fetch(`/api/control/agents/${encodeURIComponent(agentId)}/tasks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolType, payload: module ? { moduleId: module.id, moduleName: module.displayName } : {}, moduleId: module?.id, moduleName: module?.displayName }),
      });
      if (!response.ok) throw new Error(`Agent task request returned ${response.status}`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Agent task request failed');
    } finally {
      setTaskBusy(null);
    }
  }

  async function decideControlTask(taskId: string, decision: 'approve' | 'cancel') {
    const numericId = taskId.startsWith('control:') ? taskId.slice('control:'.length) : '';
    if (!numericId) return;
    setTaskBusy(taskId);
    try {
      const response = await fetch(`/api/control/tasks/${numericId}/${decision}`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error(`Task ${decision} returned ${response.status}`);
      const nextStatus = decision === 'approve' ? 'PLANNING' : 'CANCELLED';
      setTasks((current) => current ? {
        ...current,
        tasks: current.tasks.map((task) => task.id === taskId ? { ...task, status: nextStatus } : task),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Task ${decision} failed`);
    } finally {
      setTaskBusy(null);
    }
  }

  async function reviewControlTask(taskId: string, decision: 'approved' | 'rejected') {
    const numericId = taskId.startsWith('control:') ? taskId.slice('control:'.length) : '';
    if (!numericId) return;
    setTaskBusy(taskId);
    try {
      const response = await fetch(`/api/control/tasks/${numericId}/review`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      if (!response.ok) throw new Error(`Task review returned ${response.status}`);
      setTasks((current) => current ? { ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, metadata: { ...task.metadata, reviewDecision: decision } } : task) } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task review failed');
    } finally {
      setTaskBusy(null);
    }
  }

  async function submitCodeAgentRequest(descriptionOverride?: string, moduleOverride?: HelloMaraModuleEntry | null) {
    const module = moduleOverride === undefined ? selectedModule : moduleOverride;
    const description = (descriptionOverride ?? codeTaskDescription).trim();
    if (!description) return;
    setTaskBusy('code-agent.request');
    try {
      const response = await fetch('/api/control/code-agent/requests', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, priority: 'medium', moduleId: module?.id ?? null }),
      });
      const data = await response.json() as { request?: { id: number }; error?: string };
      if (!response.ok) throw new Error(data.error ?? `Code Agent request returned ${response.status}`);
      setCodeTaskDescription('');
      setCodeTaskMessage(`${module ? `${module.displayName}: ` : ''}Request #${data.request?.id ?? 'created'} queued for planning.`);
    } catch (cause) {
      setCodeTaskMessage(cause instanceof Error ? cause.message : 'Code Agent request failed');
    } finally {
      setTaskBusy(null);
    }
  }

  async function saveAnthropicKey() {
    const apiKey = anthropicKeyInput.trim();
    if (!apiKey) return;
    setTaskBusy('anthropic-key');
    setAnthropicKeyMessage(null);
    try {
      const response = await fetch('/api/control/integrations/anthropic', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json() as { integrations?: IntegrationStatus[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? `Save returned ${response.status}`);
      if (data.integrations) setIntegrations(data.integrations);
      setAnthropicKeyInput('');
      setAnthropicKeyMessage('Saved. Anthropic will be used as a fallback when Ollama is unavailable.');
    } catch (cause) {
      setAnthropicKeyMessage(cause instanceof Error ? cause.message : 'Failed to save Anthropic key');
    } finally {
      setTaskBusy(null);
    }
  }

  async function clearAnthropicKey() {
    setTaskBusy('anthropic-key');
    setAnthropicKeyMessage(null);
    try {
      const response = await fetch('/api/control/integrations/anthropic', { method: 'DELETE', credentials: 'include' });
      const data = await response.json() as { integrations?: IntegrationStatus[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? `Clear returned ${response.status}`);
      if (data.integrations) setIntegrations(data.integrations);
      setAnthropicKeyMessage('Cleared. Running on Ollama only until a key is added again.');
    } catch (cause) {
      setAnthropicKeyMessage(cause instanceof Error ? cause.message : 'Failed to clear Anthropic key');
    } finally {
      setTaskBusy(null);
    }
  }

  async function approveCodeAgentPlan(planId: number) {
    setTaskBusy(`plan:${planId}`);
    try {
      const response = await fetch(`/api/control/code-agent/plans/${planId}/approve`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error(`Plan approval returned ${response.status}`);
      setCodePlans((current) => current.map((plan) => plan.id === planId ? { ...plan, status: 'approved_for_review' } : plan));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Plan approval failed');
    } finally {
      setTaskBusy(null);
    }
  }

  async function rejectCodeAgentPlan(planId: number) {
    setTaskBusy(`plan:${planId}`);
    try {
      const response = await fetch(`/api/control/code-agent/plans/${planId}/reject`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error(`Plan rejection returned ${response.status}`);
      setCodePlans((current) => current.map((plan) => plan.id === planId ? { ...plan, status: 'rejected' } : plan));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Plan rejection failed');
    } finally {
      setTaskBusy(null);
    }
  }

  const links = [
    ['/admin', 'Admin Dashboard'],
    ['/admin/brain', 'Brain'],
    ['/admin/growth', 'Growth'],
    ['/admin/experiments', 'Experiments'],
    ['/admin/mara', 'Mara Chat'],
    ['/admin/waitlist', 'Waitlist'],
  ];

  // Each item links to a real panel (in-page anchor) or a real page
  // (external href). Items with no backing panel yet (Changes/Diff, Tests,
  // Ollama, Cloudflare, Settings) were removed rather than left as dead
  // `#anchor` links to nowhere — Repository/Code Explorer/Git all point at
  // the same "Repository visibility" panel below since that panel already
  // is the Code Explorer index + git status view.
  const sidebarGroups = [
    { title: 'Core', items: [
      { label: 'Dashboard', href: '#dashboard' },
      { label: 'Mara Brain', href: '/admin/brain' },
      { label: 'Agents', href: '#agents' },
    ] },
    { title: 'HELLOMARA.NET', items: modules.map((module) => `${module.icon} ${module.displayName}`) },
    { title: 'Development', items: [
      { label: 'Repository', href: '#repository' },
      { label: 'Code Explorer', href: '#repository' },
      { label: 'Git', href: '#repository' },
    ] },
    { title: 'Infrastructure', items: [
      { label: 'GitHub', href: '#github' },
      { label: 'Railway', href: '#railway' },
    ] },
    { title: 'Operations', items: [
      { label: 'Tasks', href: '#tasks' },
      { label: 'Approvals', href: '#approvals' },
      { label: 'Audit & Logs', href: '#audit-logs' },
      { label: 'Integrations', href: '#integrations' },
      { label: 'Tools', href: '#tools' },
    ] },
  ];

  return (
    <main className="mcc-shell mcc-shell--desktop">
      <aside className="mcc-sidebar" aria-label="Mara Control Center navigation">
        <div className="mcc-sidebar-brand">MARA CONTROL CENTER</div>
        {sidebarGroups.map((group) => <div className="mcc-sidebar-group" key={group.title}>
          <div className="mcc-sidebar-title">{group.title}</div>
          {group.title === 'HELLOMARA.NET'
            ? modules.map((module) => <button key={module.id} type="button" className={`mcc-sidebar-item ${selectedModule?.id === module.id ? 'mcc-sidebar-item--active' : ''}`} onClick={() => setSelectedModuleId(module.id)}><span>{module.icon} {module.displayName}</span><i className={healthDotClass(module.healthStatus.overall)} /></button>)
            : (group.items as { label: string; href: string }[]).map((item) => <a key={item.label} className="mcc-sidebar-item" href={item.href}>{item.label}</a>)}
        </div>)}
      </aside>
      <div className="mcc-main-workspace">
      <header className="mcc-header">
        <div>
          <p className="mcc-kicker">MARA CONTROL SYSTEM</p>
          <h1>Control Center</h1>
          <p className="mcc-subtitle">One operational view over the existing MaraAI services and state.</p>
        </div>
        <div className="mcc-status">
          <span className={`mcc-dot ${brain?.running ? 'mcc-dot--active' : ''}`} />
          <strong>{brain?.running ? 'Brain running' : 'System online'}</strong>
          <small>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Connecting...'}</small>
        </div>
      </header>

      {error && <div className="mcc-alert">Unable to refresh live state: {error}</div>}

      <section className="mcc-panel mcc-panel--wide" id="dashboard">
        <div className="mcc-panel-heading"><h2>HELLOMARA modules</h2><span>Real registry</span></div>
        <div className="mcc-module-overview-grid">
          {modules.map((module) => <button type="button" className={`mcc-module-card ${selectedModule?.id === module.id ? 'mcc-module-card--active' : ''}`} key={module.id} onClick={() => setSelectedModuleId(module.id)}>
            <span>{module.icon} {module.displayName}</span>
            <strong><i className={healthDotClass(module.healthStatus.overall)} /> {healthLabel(module.healthStatus.overall)}</strong>
          </button>)}
        </div>
      </section>

      {selectedModule && <section className="mcc-panel mcc-panel--wide mcc-module-workspace" id={`module-${selectedModule.id}`}>
        <div className="mcc-panel-heading"><h2>{selectedModule.icon} {selectedModule.displayName}</h2><span>Module workspace</span></div>
        <div className="mcc-module-health-grid">
          {Object.entries(selectedModule.healthStatus).filter(([key]) => key !== 'overall').map(([key, value]) => <div key={key}><span>{key}</span><strong><i className={healthDotClass(value)} /> {healthLabel(value)}</strong></div>)}
        </div>
        <div className="mcc-lower-grid mcc-module-columns">
          <article>
            <h3>Status</h3>
            <div className="mcc-signal"><span>Routes</span><strong>{selectedModule.routes.join(', ')}</strong></div>
            <div className="mcc-signal"><span>API endpoints</span><strong>{selectedModule.apiEndpoints.length}</strong></div>
            <div className="mcc-signal"><span>Database dependencies</span><strong>{selectedModule.databaseDependencies.length}</strong></div>
            <div className="mcc-signal"><span>Recent changes</span><strong>{selectedModule.recentChanges.length}</strong></div>
            {selectedModule.warnings.slice(0, 5).map((warning) => <p className="mcc-plan-risk" key={warning}>WARNING: {warning}</p>)}
            {selectedModule.errors.slice(0, 5).map((errorText) => <p className="mcc-error" key={errorText}>{errorText}</p>)}
          </article>
          <article>
            <h3>Code Agent</h3>
            <div className="mcc-task-actions">
              <button type="button" disabled={taskBusy !== null} onClick={() => void submitCodeAgentRequest(`Analyze ${selectedModule.displayName}. Explain architecture, risks, errors, and improvement opportunities.`, selectedModule)}>Analyze {selectedModule.displayName}</button>
              <button type="button" disabled={taskBusy !== null} onClick={() => void submitCodeAgentRequest(`Find problems and likely bugs in ${selectedModule.displayName}. Warn about shared dependencies before proposing changes.`, selectedModule)}>Find Problems</button>
              <button type="button" disabled={taskBusy !== null} onClick={() => void submitCodeAgentRequest(`Explain the architecture of ${selectedModule.displayName} using the module registry files, APIs, database dependencies, and shared services.`, selectedModule)}>Explain Architecture</button>
              <button type="button" disabled={taskBusy !== null} onClick={() => void submitCodeAgentRequest(`Create an implementation plan for ${selectedModule.displayName}. Do not modify files.`, selectedModule)}>Create Plan</button>
              <button type="button" disabled={taskBusy !== null} onClick={() => void submitCodeAgentRequest(`Propose safe changes for ${selectedModule.displayName}. Include validation and approval requirements.`, selectedModule)}>Propose Changes</button>
              <button type="button" disabled={taskBusy !== null} onClick={() => void queueAgentTask('testing-agent', 'project.typecheck', selectedModule)}>Validate</button>
            </div>
          </article>
        </div>
        <div className="mcc-module-file-grid">
          <article><h3>Frontend</h3>{selectedModule.frontendFiles.map((file) => <button type="button" key={file} onClick={() => void previewRepositoryFile(file)}>{file}</button>)}</article>
          <article><h3>Backend</h3>{selectedModule.backendFiles.map((file) => <button type="button" key={file} onClick={() => void previewRepositoryFile(file)}>{file}</button>)}</article>
          <article><h3>Database</h3>{selectedModule.databaseDependencies.map((table) => <span key={table}>{table}</span>)}</article>
          <article><h3>Shared dependencies</h3>{selectedModule.sharedDependencies.map((file) => <button type="button" key={file} onClick={() => void previewRepositoryFile(file)}>{file}</button>)}</article>
        </div>
        {selectedModule.sharedWarnings.length > 0 && <div className="mcc-shared-warning">
          <strong>Shared dependency warning</strong>
          {selectedModule.sharedWarnings.slice(0, 8).map((warning) => <p key={`${warning.file}-${warning.sharedBy.join('-')}`}>{warning.file} is shared by: {warning.sharedBy.join(', ')}</p>)}
        </div>}
        <div className="mcc-task-list">
          <h3>Module tasks</h3>
          {selectedModule.activeTasks.slice(0, 8).map((task) => <div key={task.id}><span>{task.title}</span><strong>{task.risk} · {task.status}</strong></div>)}
          {!selectedModule.activeTasks.length && <p className="mcc-muted">No active tasks for this module.</p>}
        </div>
        {selectedModule.recentChanges.length > 0 && <div className="mcc-task-list"><h3>Recent changes</h3>{selectedModule.recentChanges.map((file) => <div key={file}><span>{file}</span><strong>diff</strong></div>)}</div>}
      </section>}

      <section className="mcc-grid" aria-label="System overview">
        <article className="mcc-panel mcc-panel--hero">
          <div className="mcc-panel-label">MaraBrain</div>
          <div className="mcc-big-value">{brain?.enabled ? 'ENABLED' : 'DISABLED'}</div>
          <div className="mcc-meta">
            {brain?.passive ? 'Passive: another instance owns the lock' : brain?.running ? 'Executing autonomous work' : 'Waiting for next cycle'}
          </div>
          <dl className="mcc-details">
            <div><dt>Last cycle</dt><dd>{formatTime(brain?.lastRunAt ?? null)}</dd></div>
            <div><dt>Duration</dt><dd>{formatDuration(brain?.lastDurationMs ?? null)}</dd></div>
            <div><dt>Next cycle</dt><dd>{formatTime(brain?.nextRunAt ?? null)}</dd></div>
          </dl>
        </article>

        <article className="mcc-panel">
          <div className="mcc-panel-label">Local AI</div>
          <div className="mcc-big-value">{provider?.provider?.toUpperCase() ?? '...'}</div>
          <div className="mcc-meta">{provider?.model ?? 'Checking model'}</div>
          <div className={`mcc-health ${provider?.ok ? 'mcc-health--good' : 'mcc-health--bad'}`}>
            <span /> {provider?.ok ? 'Provider reachable' : 'Provider unavailable'}
          </div>
          {provider?.fallback && <small className="mcc-muted">Fallback: {provider.fallback.provider}</small>}
        </article>

        <article className="mcc-panel">
          <div className="mcc-panel-label">Platform</div>
          <div className="mcc-metric-row"><strong>{dashboard?.users.total ?? '—'}</strong><span>users</span></div>
          <div className="mcc-metric-row"><strong>{dashboard?.users.active7d ?? '—'}</strong><span>active in 7d</span></div>
          <div className="mcc-metric-row"><strong>{dashboard?.brain.logsToday ?? '—'}</strong><span>brain logs today</span></div>
        </article>

        <article className="mcc-panel">
          <div className="mcc-panel-label">Runtime</div>
          <div className="mcc-metric-row"><strong>{dashboard?.system.uptimeSeconds ? `${Math.floor(dashboard.system.uptimeSeconds / 3600)}h` : '—'}</strong><span>uptime</span></div>
          <div className="mcc-metric-row"><strong>{dashboard?.system.memoryMB ?? '—'} MB</strong><span>heap used</span></div>
          <div className="mcc-metric-row"><strong>{dashboard?.system.nodeVersion ?? '—'}</strong><span>Node.js</span></div>
          <div className="mcc-metric-row"><strong>{dashboard?.eventBus.backend ?? '—'}</strong><span>event bus</span></div>
        </article>
      </section>

      <section className="mcc-lower-grid">
        <article className="mcc-panel">
          <div className="mcc-panel-heading"><h2>Shared control surfaces</h2><span>Existing APIs</span></div>
          <div className="mcc-links">
            {links.map(([href, label]) => <a key={href} href={href}>{label}<span>Open</span></a>)}
          </div>
        </article>
        <article className="mcc-panel">
          <div className="mcc-panel-heading"><h2>Current signals</h2><span>Live database view</span></div>
          <div className="mcc-signal"><span>Pending orders</span><strong>{dashboard?.revenue.pendingOrders ?? '—'}</strong></div>
          <div className="mcc-signal"><span>Mission completions</span><strong>{dashboard?.missions.completed ?? '—'}</strong></div>
          <div className="mcc-signal"><span>Revenue this month</span><strong>${dashboard?.revenue.thisMonth ?? '—'}</strong></div>
          {brain?.lastError && <div className="mcc-error">Last Brain error: {brain.lastError}</div>}
        </article>
      </section>

      <section className="mcc-lower-grid">
        <article className="mcc-panel">
          <div className="mcc-panel-heading"><h2>Recent Brain logs</h2><span>{logs?.brainLogs.length ?? 0} loaded</span></div>
          {(logs?.brainLogs ?? []).map((log) => <div className="mcc-signal" key={log.id}><span>{log.research?.split('\n')[0] || 'Brain cycle'}</span><strong>#{log.id}</strong></div>)}
          {!logs?.brainLogs.length && <p className="mcc-muted">No Brain logs available.</p>}
        </article>
        <article className="mcc-panel">
          <div className="mcc-panel-heading"><h2>Alerts</h2><span>{logs?.unreadAlerts ?? 0} unread</span></div>
          {(logs?.alerts ?? []).map((alert) => <div className="mcc-signal" key={alert.id}><span>{alert.title}</span><strong>{alert.severity}</strong></div>)}
          {!logs?.alerts.length && <p className="mcc-muted">No alerts available.</p>}
        </article>
      </section>

      <section className="mcc-panel mcc-panel--wide">
        <div className="mcc-panel-heading"><h2>AI route health</h2><span>Last 24 hours</span></div>
        <div className="mcc-route-grid">
          {(dashboard?.aiRoutes ?? []).map((route) => (
            <div key={route.route}>
              <strong>{route.route}</strong>
              <span>{route.cnt} requests · {Math.round(route.avg_latency)}ms avg · {route.successes} successful</span>
            </div>
          ))}
          {!dashboard?.aiRoutes.length && <p className="mcc-muted">No AI route activity recorded.</p>}
        </div>
      </section>
      <section className="mcc-panel mcc-panel--wide">
        <div className="mcc-panel-heading"><h2>Code Agent plans</h2><span>Persistent proposals</span></div>
        {codePlans.slice(0, 5).map((plan) => <div className="mcc-code-plan" key={plan.id}>
          <div className="mcc-signal"><span>Plan #{plan.id} · {plan.changes.length} proposed file changes</span><span className="mcc-agent-actions"><strong>{plan.status}</strong>{plan.status === 'waiting_approval' && <><button type="button" disabled={taskBusy !== null} onClick={() => void approveCodeAgentPlan(plan.id)}>Approve plan</button><button type="button" disabled={taskBusy !== null} onClick={() => void rejectCodeAgentPlan(plan.id)}>Reject plan</button></>}</span></div>
          {plan.analysis.summary && <p className="mcc-muted">{plan.analysis.summary}</p>}
          <div className="mcc-code-plan-files">{plan.changes.slice(0, 20).map((change, index) => <span key={`${plan.id}-${index}`}>{change.type ?? 'change'}: {change.path ?? 'unknown path'}</span>)}</div>
          {plan.analysis.risks?.length ? <p className="mcc-plan-risk">Risks: {plan.analysis.risks.join('; ')}</p> : null}
        </div>)}
        {!codePlans.length && <p className="mcc-muted">No Code Agent plans yet.</p>}
      </section>

      <section className="mcc-panel mcc-panel--wide">
        <div className="mcc-panel-heading"><h2>Task worker</h2><span>Execution status</span></div>
        <div className="mcc-signal"><span>Enabled</span><strong>{worker?.enabled ? 'YES' : 'NO'}</strong></div>
        <div className="mcc-signal"><span>Running</span><strong>{worker?.running ? 'YES' : 'NO'}</strong></div>
      </section>

      <section className="mcc-panel mcc-panel--wide" id="audit-logs">
        <div className="mcc-panel-heading"><h2>Control audit</h2><span>Persistent admin actions</span></div>
        {auditActions.slice(0, 8).map((action) => <div className="mcc-signal" key={action.id}><span>{action.action_type} · {action.target_type}:{action.target_id}</span><strong>{action.actor ?? 'system'}</strong></div>)}
        {!auditActions.length && <p className="mcc-muted">No control actions recorded.</p>}
      </section>

      <section className="mcc-panel mcc-panel--wide" id="integrations">
        <div className="mcc-panel-heading"><h2>Integrations</h2><span>Configuration status only</span></div>
        {integrations.map((integration) => <div className="mcc-signal" key={integration.id} title={integration.reason}><span>{integration.id}</span><strong>{integration.state}</strong></div>)}
        <div className="mcc-anthropic-key-form">
          <p className="mcc-muted">Ollama is the primary provider. Anthropic is optional — add a key here anytime to enable it as a fallback, no Railway redeploy needed.</p>
          <div className="mcc-task-actions">
            <input
              type="password"
              placeholder="sk-ant-..."
              value={anthropicKeyInput}
              onChange={(event) => setAnthropicKeyInput(event.target.value)}
              disabled={taskBusy === 'anthropic-key'}
              autoComplete="off"
            />
            <button type="button" disabled={taskBusy === 'anthropic-key' || !anthropicKeyInput.trim()} onClick={() => void saveAnthropicKey()}>Save key</button>
            {integrations.find((i) => i.id === 'anthropic')?.configured && (
              <button type="button" disabled={taskBusy === 'anthropic-key'} onClick={() => void clearAnthropicKey()}>Clear key</button>
            )}
          </div>
          {anthropicKeyMessage && <p className="mcc-muted">{anthropicKeyMessage}</p>}
        </div>
      </section>

      <section className="mcc-panel mcc-panel--wide" id="github">
        <div className="mcc-panel-heading"><h2>GitHub</h2><span>GitHub App</span></div>
        <div className={`mcc-health ${githubStatus?.connected ? 'mcc-health--good' : 'mcc-health--bad'}`}><span /> {githubStatus?.connected ? 'Connected' : 'Not connected'}</div>
        <div className="mcc-signal"><span>Repository</span><strong>{githubStatus?.repository ?? 'theoraul29-lab/maraai'}</strong></div>
        <div className="mcc-signal"><span>Branch</span><strong>{githubStatus?.defaultBranch ?? 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Latest commit</span><strong>{githubStatus?.latestCommit?.sha.slice(0, 12) ?? 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Actions</span><strong>{githubStatus ? `${githubStatus.workflowRuns.length} runs` : 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Pull requests</span><strong>{githubStatus ? githubStatus.pullRequests.length : 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Issues</span><strong>{githubStatus ? githubStatus.issues.length : 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Authentication</span><strong>{githubStatus?.connected ? 'CONNECTED' : 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Write permissions</span><strong>{githubStatus?.writeCapability ?? 'NOT_AVAILABLE'}</strong></div>
        <div className="mcc-signal"><span>Last API check</span><strong>{githubStatus ? formatTime(githubStatus.lastCheckedAt) : 'Not checked'}</strong></div>
        {githubStatus?.error && <p className="mcc-plan-risk">{githubStatus.error.code}: {githubStatus.error.message}</p>}
      </section>

      <section className="mcc-panel mcc-panel--wide" id="railway">
        <div className="mcc-panel-heading"><h2>Railway</h2><span>Project status</span></div>
        <div className={`mcc-health ${railwayStatus?.connected ? 'mcc-health--good' : 'mcc-health--bad'}`}><span /> {railwayStatus?.connected ? 'Connected' : 'Not connected'}</div>
        <div className="mcc-signal"><span>Authentication</span><strong>{railwayStatus?.authentication ?? 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Project</span><strong>{railwayStatus?.project ?? 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Service</span><strong>{railwayStatus?.service ?? 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Environment</span><strong>{railwayStatus?.environment ?? 'NOT_CONFIGURED'}</strong></div>
        <div className="mcc-signal"><span>Status</span><strong>{railwayStatus?.serviceStatus ?? 'unknown'}</strong></div>
        <div className="mcc-signal"><span>Latest deployment</span><strong>{railwayStatus?.latestDeploymentId?.slice(0, 8) ?? 'unknown'}</strong></div>
        <div className="mcc-signal"><span>Region</span><strong>{railwayStatus?.region ?? 'unknown'}</strong></div>
        <div className="mcc-signal"><span>URL</span><strong>{railwayStatus?.url ?? 'unknown'}</strong></div>
        <div className="mcc-signal"><span>Recent deployments</span><strong>{railwayStatus?.deployments.length ?? 0}</strong></div>
        <div className="mcc-signal"><span>Deployment logs</span><strong>{railwayStatus?.logs.length ?? 0} safe lines</strong></div>
        <div className="mcc-signal"><span>Write operations</span><strong>{railwayStatus?.writeCapability ?? 'NOT_AVAILABLE'}</strong></div>
        <div className="mcc-signal"><span>Last API check</span><strong>{railwayStatus ? formatTime(railwayStatus.lastCheckedAt) : 'Not checked'}</strong></div>
        {railwayStatus?.error && <p className="mcc-plan-risk">{railwayStatus.error.code}: {railwayStatus.error.message}</p>}
        {(railwayStatus?.logs ?? []).slice(0, 5).map((line, index) => <p className="mcc-muted" key={`${index}-${line.slice(0, 20)}`}>{line}</p>)}
      </section>

      <section className="mcc-panel mcc-panel--wide" id="tools">
        <div className="mcc-panel-heading"><h2>Tools</h2><span>Permission-aware catalog</span></div>
        {tools.map((tool) => <div className="mcc-signal" key={tool.id}><span>{tool.label} · {tool.description}</span><strong>{tool.available ? tool.risk : 'NOT CONFIGURED'}</strong></div>)}
      </section>

      <section className="mcc-panel mcc-panel--wide" id="repository">
        <div className="mcc-panel-heading"><h2>Repository visibility</h2><span>Code Explorer index</span></div>
        <div className="mcc-signal"><span>{repository?.root ?? 'Repository unavailable'}</span><strong>{repository?.indexedFiles ?? 0} files</strong></div>
        <div className="mcc-signal"><span>Git branch</span><strong>{gitStatus?.branch ?? '—'}{gitStatus?.dirty ? ' · dirty' : ' · clean'}</strong></div>
        {(gitStatus?.recentCommits ?? []).slice(0, 5).map((commit) => (
          <div className="mcc-signal" key={commit.hash}><span>{commit.subject}</span><strong>{commit.hash.slice(0, 7)}</strong></div>
        ))}
        {(gitStatus?.diff.files ?? []).slice(0, 8).map((file) => (
          <div className="mcc-signal" key={file}><span>Changed: {file}</span><strong>diff</strong></div>
        ))}
        <div className="mcc-signal"><span>Total indexed size</span><strong>{repository ? `${Math.round(repository.overview.totalBytes / 1024)} KB` : '—'}</strong></div>
        {(repository?.overview.recentlyChanged ?? []).slice(0, 5).map((file) => (
          <div className="mcc-signal" key={file.path}><span>{file.path}</span><strong>{Math.round(file.size / 1024)} KB</strong></div>
        ))}
        <form className="mcc-repository-search" onSubmit={(event) => { event.preventDefault(); void searchRepository(); }}>
          <input value={repositoryQuery} onChange={(event) => setRepositoryQuery(event.target.value)} placeholder="Search indexed files" aria-label="Search indexed files" />
          <button type="submit">Search</button>
        </form>
        {repositoryResults.map((file) => <div className="mcc-signal" key={file.path}><span>{file.path}</span><span className="mcc-file-actions"><strong>{file.extension || 'file'}</strong><button type="button" onClick={() => void previewRepositoryFile(file.path)}>Preview</button></span></div>)}
        {repositoryPreview && <pre className="mcc-code-preview">{repositoryPreview.content}</pre>}
      </section>

      <section className="mcc-panel mcc-panel--wide">
        <div className="mcc-panel-heading"><h2>Activity</h2><span>Shared activity log</span></div>
        {(logs?.activity ?? []).slice(0, 8).map((entry) => (
          <div className="mcc-signal" key={entry.id}>
            <span>{entry.kind}</span>
            <strong>{new Date(entry.createdAt).toLocaleTimeString()}</strong>
          </div>
        ))}
        {!logs?.activity.length && <p className="mcc-muted">No activity for this admin yet.</p>}
      </section>

      <section className="mcc-panel mcc-panel--wide" id="approvals">
        <div className="mcc-panel-heading"><h2>Approvals waiting</h2><span>{experiments?.count ?? 0} proposed</span></div>
        {(experiments?.experiments ?? []).map((experiment) => (
          <div className="mcc-signal" key={experiment.id}>
            <span>{experiment.hypothesis}</span>
            <span className="mcc-approval-actions">
              <strong>{experiment.iceScore ? `ICE ${experiment.iceScore.toFixed(1)}` : experiment.status}</strong>
              <button type="button" disabled={approvalBusy === experiment.id} onClick={() => void decideExperiment(experiment.id, 'approve')}>Approve</button>
              <button type="button" disabled={approvalBusy === experiment.id} onClick={() => void decideExperiment(experiment.id, 'reject')}>Reject</button>
            </span>
          </div>
        ))}
        {!experiments?.experiments.length && <p className="mcc-muted">No experiment approvals waiting.</p>}
      </section>

      <section className="mcc-panel mcc-panel--wide" id="tasks">
        <div className="mcc-panel-heading"><h2>Unified task state</h2><span>Read-only adapter</span></div>
        <div className="mcc-task-grid">
          {Object.entries(tasks?.counts ?? {}).map(([status, count]) => <div key={status}><strong>{count}</strong><span>{status}</span></div>)}
        </div>
        <div className="mcc-task-list">
          {(tasks?.tasks ?? []).filter((task) => ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(task.status) || (task.status === 'COMPLETED' && task.metadata.taskType && !task.metadata.reviewDecision)).slice(0, 8).map((task) => (
            <div key={task.id} title={task.permission.reason}>
              <span>{task.title}</span>
              <span className="mcc-task-row-actions">
                <strong>{task.permission.approvalRequired ? 'APPROVAL · ' : ''}{task.risk} · {task.status}</strong>
                {task.id.startsWith('control:') && task.status === 'WAITING_APPROVAL' && <>
                  <button type="button" disabled={taskBusy !== null} onClick={() => void decideControlTask(task.id, 'approve')}>Approve</button>
                  <button type="button" disabled={taskBusy !== null} onClick={() => void decideControlTask(task.id, 'cancel')}>Cancel</button>
                </>}
                {task.id.startsWith('control:') && task.status === 'COMPLETED' && task.metadata.taskType && !task.metadata.reviewDecision && <>
                  <button type="button" disabled={taskBusy !== null} onClick={() => void reviewControlTask(task.id, 'approved')}>Review approve</button>
                  <button type="button" disabled={taskBusy !== null} onClick={() => void reviewControlTask(task.id, 'rejected')}>Review reject</button>
                </>}
              </span>
            </div>
          ))}
          {!tasks?.tasks.some((task) => ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(task.status)) && <p className="mcc-muted">No active or waiting tasks.</p>}
        </div>
        <div className="mcc-task-actions">
          <button type="button" disabled={taskBusy !== null} onClick={() => void queueReadOnlyTask('brain.snapshot', 'Read current Brain and AI provider status')}>Queue Brain snapshot</button>
          <button type="button" disabled={taskBusy !== null} onClick={() => void queueReadOnlyTask('repository.overview', 'Read repository index overview')}>Queue repository overview</button>
          {selectedModule && <button type="button" disabled={taskBusy !== null} onClick={() => void queueReadOnlyTask('repository.overview', `Read ${selectedModule.displayName} repository context`, selectedModule)}>Queue {selectedModule.displayName} context</button>}
        </div>
      </section>

      <section className="mcc-panel mcc-panel--wide" id="agents">
        <div className="mcc-panel-heading"><h2>Agents</h2><span>Descriptive catalog</span></div>
        {agents.map((agent) => <div className="mcc-signal" key={agent.id}>
          <span>{agent.label} · {agent.role}</span>
          <span className="mcc-agent-actions">
            <strong>{agent.risk}</strong>
            {agent.id === 'code-explorer' && <button type="button" disabled={taskBusy !== null} onClick={() => void queueAgentTask(agent.id, 'repository.overview', selectedModule)}>Queue overview</button>}
            {agent.id === 'testing-agent' && <>
              <button type="button" disabled={taskBusy !== null} onClick={() => void queueAgentTask(agent.id, 'project.typecheck', selectedModule)}>Typecheck</button>
              <button type="button" disabled={taskBusy !== null} onClick={() => void queueAgentTask(agent.id, 'frontend.build', selectedModule)}>Frontend build</button>
            </>}
          </span>
        </div>)}
        {!agents.length && <p className="mcc-muted">Agent catalog unavailable.</p>}
      </section>
      <section className="mcc-panel mcc-panel--wide">
        <div className="mcc-panel-heading"><h2>Code Agent</h2><span>Persistent planning workflow</span></div>
        <form className="mcc-code-request" onSubmit={(event) => { event.preventDefault(); void submitCodeAgentRequest(); }}>
          <textarea value={codeTaskDescription} onChange={(event) => setCodeTaskDescription(event.target.value)} placeholder={selectedModule ? `Give Mara a coding task for ${selectedModule.displayName}...` : 'Give Mara a coding task for this repository...'} maxLength={20000} />
          <button type="submit" disabled={!codeTaskDescription.trim() || taskBusy !== null}>Give Mara a coding task{selectedModule ? ` for ${selectedModule.displayName}` : ''}</button>
        </form>
        {codeTaskMessage && <p className="mcc-muted">{codeTaskMessage}</p>}
      </section>
      <MaraVoiceControl />
      </div>
    </main>
  );
}
