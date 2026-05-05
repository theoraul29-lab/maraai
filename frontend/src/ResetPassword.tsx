import React, { useState } from 'react';

const ResetPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || 'Request failed');
      }
      setStatus('done');
      setMessage('If an account exists for that email, a reset link has been sent.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div style={{ color: '#fff', padding: '60px 20px', maxWidth: 420, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>Reset your password</h2>

      {status === 'done' ? (
        <p style={{ color: '#a3e635' }}>{message}</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label htmlFor="reset-email" style={{ fontSize: 14, color: '#ccc' }}>
            Email address
          </label>
          <input
            id="reset-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #444',
              background: '#1a1a2e',
              color: '#fff',
              fontSize: 15,
            }}
          />
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
            {status === 'loading' ? 'Sending…' : 'Send reset link'}
          </button>
          <a href="/" style={{ color: '#a78bfa', fontSize: 13 }}>← Back to home</a>
        </form>
      )}
    </div>
  );
};

export default ResetPassword;

