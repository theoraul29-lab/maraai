import { describe, expect, it } from 'vitest';
import { readCapabilityResults } from './capability-refresh';

describe('readCapabilityResults', () => {
  it('keeps successful capability values and reports failed names', () => {
    const result = readCapabilityResults<{ overview: string; logs: number; tasks: string }>(
      ['overview', 'logs', 'tasks'],
      [
        { status: 'fulfilled', value: 'ready' },
        { status: 'rejected', reason: new Error('unavailable') },
        { status: 'fulfilled', value: 'queued' },
      ],
    );

    expect(result.values).toEqual({ overview: 'ready', tasks: 'queued' });
    expect(result.failures).toEqual(['logs']);
  });

  it('handles an all-failed refresh without producing values', () => {
    const result = readCapabilityResults<{ brain: string; logs: string }>(
      ['brain', 'logs'],
      [
        { status: 'rejected', reason: new Error('brain down') },
        { status: 'rejected', reason: new Error('logs down') },
      ],
    );

    expect(result.values).toEqual({});
    expect(result.failures).toEqual(['brain', 'logs']);
  });
});
