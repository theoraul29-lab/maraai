export type ExperimentDecision = 'approved' | 'rejected';

export interface ExperimentDecisionInput {
  params?: { id?: unknown };
  body?: { note?: unknown };
  user?: { email?: unknown };
}

export type ParsedExperimentDecision =
  | { ok: true; id: number; decidedBy: string; note?: string; decision: ExperimentDecision }
  | { ok: false; error: 'Invalid experiment id' };

/** Pure request parsing shared by every experiment decision surface. */
export function parseExperimentDecision(
  request: ExperimentDecisionInput,
  decision: ExperimentDecision,
): ParsedExperimentDecision {
  const id = Number.parseInt(String(request.params?.id ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Invalid experiment id' };

  const note = typeof request.body?.note === 'string' ? request.body.note : undefined;
  const decidedBy = typeof request.user?.email === 'string' && request.user.email.length > 0
    ? request.user.email
    : 'unknown-admin';

  return { ok: true, id, decidedBy, ...(note !== undefined ? { note } : {}), decision };
}
