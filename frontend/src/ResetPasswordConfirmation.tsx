import React, { useState, useEffect } from 'react';

const ResetPasswordConfirmation: React.FC = () => {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setStatus('error');
      setMessage('Passwords do not match.');
      return;
    }
    if (!token) {
      setStatus('error');
      setMessage('Reset token is missing. Please use the link from your email.');
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch('/api/auth/confirm-reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || 'Reset failed');
      }
      setStatus('done');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div style={{ color: '#fff', padding: '60px 20px', maxWidth: 420, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>Set a new password</h2>

      {status === 'done' ? (
        <div>
          <p style={{ color: '#a3e635', marginBottom: 16 }}>
            Your password has been updated. You can now sign in.
          </p>
          <a href="/" style={{ color: '#a78bfa' }}>← Go to home</a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!token && (
            <div>
              <label htmlFor="reset-token" style={{ fontSize: 14, color: '#ccc' }}>
                Reset token
              </label>
              <input
                id="reset-token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your reset token"
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #444',
                  background: '#1a1a2e',
                  color: '#fff',
                  fontSize: 15,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          <div>
            <label htmlFor="new-password" style={{ fontSize: 14, color: '#ccc' }}>
              New password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              style={{
                marginTop: 6,
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #444',
                background: '#1a1a2e',
                color: '#fff',
                fontSize: 15,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" style={{ fontSize: 14, color: '#ccc' }}>
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              style={{
                marginTop: 6,
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #444',
                background: '#1a1a2e',
                color: '#fff',
                fontSize: 15,
                boxSizing: 'border-box',
              }}
            />
          </div>
          {status === 'error' && (
            <p style={{ color: '#f87171', fontSize: 13 }}>{message}</p>
          )}
          <button
            type="submit"
            disabled={status === 'loading'}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff',
              border: 'none',
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              fontSize: 15,
            }}
          >
            {status === 'loading' ? 'Saving…' : 'Set new password'}
          </button>
          <a href="/reset-password" style={{ color: '#a78bfa', fontSize: 13 }}>
            ← Request a new link
          </a>
        </form>
      )}
    </div>
  );
};

export default ResetPasswordConfirmation;

