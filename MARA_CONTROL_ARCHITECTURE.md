# Mara Control Architecture

## One control system

Mara Control Center and Web Admin are authenticated interfaces over the same backend state. They do not maintain separate task, approval, Brain, or logging stores.

```text
Control Center / Web Admin
          |
          v
  authenticated API routes
          |
          v
 shared capability services
          |
          v
 existing MaraBrain, storage, SQLite/Drizzle state
```

## Shared capabilities

| Capability | Service | Read endpoint(s) | Persistent state |
| --- | --- | --- | --- |
| Brain and AI state | `server/mara-brain/control-service.ts` | `/api/control/brain/status`, `/api/admin/brain/status` | Brain manager memory and AI provider health |
| Platform overview | `server/services/control-overview.ts` | `/api/control/overview`, `/api/admin/dashboard` | Existing platform tables |
| Logs and alerts | `server/services/log-reader.ts` | `/api/control/logs`, existing admin log/alert routes | `brain_logs`, `mara_alerts`, `activity_log` |
| Task state | `server/services/task-engine.ts` + `server/services/task-policy.ts` | `/api/control/tasks/status`, `/api/admin/tasks/status` | Existing learning, growth, and P2P task tables |
| Experiment decisions | `server/mara-brain/experiment-decisions.ts` | Existing approve/reject routes | `mara_growth_experiments` |
| Repository visibility | `server/services/repository-status.ts` + existing Code Explorer routes | `/api/control/repository`, existing `/api/admin/mara/code/search` | Existing `mara_code_index` and source-read audit |
| Agent catalog | `server/services/agent-catalog.ts` | `/api/control/agents` | None; descriptive metadata only |
| Tool catalog | `server/services/tool-catalog.ts` | `/api/control/tools` | None; explicit handlers only |
| Integration status | `server/services/integration-status.ts` | `/api/control/integrations` | Configuration-only, no external calls |

## Important boundaries

- Task status is currently a read-only adapter. It does not create a second worker or scheduler.
- Task risk classification is pure policy only: `READ_ONLY`, `LOW_RISK`, `MODERATE_RISK`, `HIGH_RISK`, and `CRITICAL`. It does not authorize or execute actions.
- A future executor must check risk and approval state before any mutation; the current adapter deliberately has no write path.
- Persistent control tasks now have their own meta-layer tables, append-only task events, and admin action audit. The worker is opt-in via `CONTROL_TASK_WORKER_ENABLED=true` and currently accepts only whitelisted read-only handlers (`brain.snapshot`, `tasks.status`, `repository.overview`, `repository.git_status`, `repository.search`, `repository.preview`).
- Control-task event history is available through `/api/control/tasks/:id/events`; unknown task types fail instead of falling back to shell or arbitrary agent execution.
- Control tasks track attempts, max attempts, delayed retry timestamps, and stale-worker recovery. Unknown handlers fail closed without retry; stale running tasks are marked failed for manual review.
- Task creation, approval, cancellation, and review write their state change and audit/event records in one SQLite transaction. A successful repository apply automatically creates a linked validation task; commit requires that linked validation to be completed and reviewed approved.
- Repository visibility is read-only. Control Center reuses the existing authenticated Code Explorer search route rather than creating a second search implementation.
- Repository visibility includes the existing code index, bounded source previews, branch/dirty status, recent commit history, and bounded working-tree diff summary. Git access uses fixed `execFile` arguments with no shell, commit, push, branch creation, checkout, or arbitrary command execution.
- Experiment approve/reject operations delegate to the existing Growth Engineer service.
- Admin authorization remains enforced by the existing `requireAdmin` middleware.
- Control Center polling is currently the synchronization mechanism. The existing internal event bus remains available, but no separate UI event transport has been introduced.
- Control Center refresh uses settled capability requests: an unavailable capability does not erase healthy data, and the UI reports the failed capability names.
- The pure refresh mapping is covered by `frontend/src/utils/capability-refresh.test.ts`; its runtime test result depends on the local Vitest executor output.
- No desktop database exists. The PWA manifest provides installable Control Center shortcuts for Windows.

## Current limitations

- There is no general task executor with a unified lifecycle yet.
- There is no dedicated desktop native shell; the existing frontend/PWA is the desktop-compatible control surface.
- GitHub, Railway, voice control, and controlled code-agent execution are not yet wired into these capabilities.
- Controlled local Code Agent write/commit boundaries are now wired as approval-gated tools; the worker remains opt-in and no GitHub/Railway/voice integration is fabricated without credentials/provider configuration.
- Repository search and preview do not authorize source modification; a future Code Agent must use the permission and approval policies before any write operation.
- The agent catalog describes existing agents and capabilities. It is consumed by both Web Admin and Control Center through `/api/control/agents`. It is not an executable registry and does not create a second agent system.
- The catalog also lists Research, DevOps, Security, Testing, and Project agents as `not_configured`; they are visible as planned boundaries only and have no executable handlers.
- Optional external contracts are documented as `GITHUB_TOKEN`, `RAILWAY_TOKEN`, and `VOICE_PROVIDER`; empty values intentionally keep those integrations disabled.
- External integration status is explicit: `NOT_CONFIGURED`, `CONFIGURED`, or `ERROR`. Configured GitHub/Railway tokens still do not enable API calls until a real provider implementation and approval boundary exist; token values are never returned.
- The tool catalog describes safe local handlers and unavailable integrations. It is not arbitrary command execution; worker handlers remain explicitly whitelisted. Ollama health uses the existing provider router rather than a second client.
- `server/services/tool-runtime.ts` is the single execution boundary for the opt-in worker. It validates registered tool type, payload shape, and risk before dispatch; unknown tools and approval-bound risks fail closed.
- Fixed validation tools (`project.typecheck`, `server.build`, `frontend.typecheck`, `frontend.build`) use `execFile` with fixed argv, repository-scoped cwd, `shell:false`, 120-second timeout, and bounded stdout/stderr. They do not accept command or argument input.
- Git write tools are separate HIGH_RISK handlers: `git.create_branch` validates branch names, and `git.commit_staged` commits only pre-staged changes with a bounded message and `--no-verify`; neither pushes or deploys.
- A commit requires both `proposalTaskId` and `validationTaskId`; the validation task must be a successful fixed typecheck/build task explicitly linked to that proposal.
- Controlled process execution returns a deterministic contract with start state, PID, exit code/signal, separate stdout/stderr, duration, timeout/kill flags, error classification, and an artifact path under ignored `data/control-task-artifacts/`. Task-bound executions emit `PROCESS_STARTING`, `PROCESS_STARTED`, `PROCESS_COMPLETED`, `PROCESS_FAILED`, or `PROCESS_TIMEOUT` events.
- Executor-level contract tests live in `scripts/test-controlled-execution.mts` and cover success, non-zero exit, stderr, failed start, timeout, output limits, and artifact references without touching Mara source or production state.
- The first safe end-to-end task runner is `scripts/run-control-task-e2e.mts`. It creates one `repository.overview` task, claims it by ID through the worker path, executes the Tool Runtime, verifies completion/events, and writes `data/control-task-e2e-report.json`. It refuses dry-run mode and refuses to run while the persistent worker is enabled.
- The E2E runner also writes `data/control-task-e2e-start.txt`, `data/control-task-e2e-end.txt`, and `data/control-task-e2e-exit-code.txt`, so launcher execution can be verified independently of terminal stdout.
- `server/services/agent-runtime.ts` maps agents to allowed tools and creates persistent tasks; it does not execute tools directly. The initial mapping grants Code Explorer only bounded repository read tools.
- Testing Agent is configured as `admin_invoked` for fixed typecheck/build tools only; it has no arbitrary command capability and does not run autonomously.
- Code Agent requests persist the natural-language description and create a `code-agent.plan` task. The planner uses the existing `llmGenerate`/provider router plus repository index, then stores a structured plan as `waiting_approval`; no file write happens during planning.
- Agent tool permissions are inspectable through `/api/control/agents/:agentId/tools` before task creation.
- Agent Runtime derives task risk from the canonical Tool Runtime map; agents cannot downgrade a LOW/HIGH-risk tool by submitting `READ_ONLY` metadata.
- Controlled self-development has a proposal boundary at `POST /api/control/repository/proposals`: it stores bounded file changes as `HIGH_RISK`/`WAITING_APPROVAL`. After explicit approval, the whitelist handler `repository.apply_changes` validates paths and expected SHA-256, backs up originals, applies changes, and rolls back the operation on write failure. It still does not commit, push, or deploy.
- Voice currently uses browser-native Speech Recognition/Speech Synthesis in Control Center and the existing authenticated Mara chat route. Server-side STT/TTS providers remain unconfigured; browser voice availability is detected at runtime and is not represented as a fake backend integration.
