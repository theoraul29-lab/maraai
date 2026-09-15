import { decideExperiment } from './agents/growth-engineer.js';
export { parseExperimentDecision } from './experiment-decision-parser.js';
export type {
  ExperimentDecision,
  ExperimentDecisionInput,
  ParsedExperimentDecision,
} from './experiment-decision-parser.js';

export function approveExperiment(id: number, decidedBy: string, note?: string) {
  return decideExperiment(id, 'approved', decidedBy, note);
}

export function rejectExperiment(id: number, decidedBy: string, note?: string) {
  return decideExperiment(id, 'rejected', decidedBy, note);
}
