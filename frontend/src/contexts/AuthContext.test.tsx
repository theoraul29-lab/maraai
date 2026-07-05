import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Small consumer that surfaces the pieces of the auth context we care about
// so the test can assert on rendered text instead of poking internals.
function TierProbe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="tier">{auth.userTier}</span>
      {/* Faza 5 removed the trial affordance entirely; assert it's gone. */}
      <span data-testid="has-trial">{'isTrialActive' in auth ? 'yes' : 'no'}</span>
    </div>
  );
}

function mockMe(user: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/me')) {
        return new Response(JSON.stringify({ user }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

describe('AuthProvider tier normalization', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a vip tier from the server', async () => {
    mockMe({ id: 'u1', email: 'a@b.co', name: 'A', tier: 'vip', createdAt: Date.now() });
    render(
      <AuthProvider>
        <TierProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('vip'));
  });

  it('collapses the removed trial tier to free', async () => {
    mockMe({ id: 'u2', email: 'c@d.co', name: 'C', tier: 'trial', createdAt: Date.now() });
    render(
      <AuthProvider>
        <TierProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));
  });

  it('no longer exposes trial state on the context', () => {
    mockMe(null);
    render(
      <AuthProvider>
        <TierProbe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('has-trial').textContent).toBe('no');
  });
});
