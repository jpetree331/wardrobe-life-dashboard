import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithMagicLink, useAuth } from '../hooks/useAuth';

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (loading) return <div className="auth-pending">Opening the wardrobe…</div>;
  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setErrorMsg('');
    try {
      await signInWithMagicLink(email.trim());
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main style={loginStyles.page}>
      <div style={loginStyles.card}>
        <h1 style={loginStyles.title}>Wardrobe</h1>
        <p style={loginStyles.sub}>Step in.</p>
        {status === 'sent' ? (
          <p style={loginStyles.message}>
            Check your email — a sign-in link is on its way to{' '}
            <em>{email}</em>.
          </p>
        ) : (
          <form onSubmit={onSubmit} style={loginStyles.form}>
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={loginStyles.input}
              disabled={status === 'sending'}
              autoFocus
            />
            <button type="submit" style={loginStyles.button} disabled={status === 'sending'}>
              {status === 'sending' ? 'sending…' : 'send magic link →'}
            </button>
            {status === 'error' && <p style={loginStyles.error}>{errorMsg}</p>}
          </form>
        )}
      </div>
    </main>
  );
}

const loginStyles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    color: 'var(--ink)',
  },
  card: {
    width: 'min(420px, 92vw)',
    padding: '48px 56px',
    background: 'var(--page)',
    border: '1px solid #e4d8bf',
    boxShadow:
      '0 1px 0 rgba(0,0,0,0.02), 0 24px 60px -30px rgba(43, 36, 25, 0.25), 0 2px 10px -4px rgba(43, 36, 25, 0.08)',
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 400,
    fontSize: 32,
    letterSpacing: '0.04em',
    margin: '0 0 6px',
  },
  sub: {
    fontFamily: "'EB Garamond', serif",
    fontStyle: 'italic',
    color: 'var(--ink-faint)',
    margin: '0 0 32px',
    letterSpacing: '0.04em',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  input: {
    fontFamily: "'EB Garamond', serif",
    fontSize: 16,
    background: 'transparent',
    border: 0,
    borderBottom: '1px solid var(--line-strong)',
    padding: '8px 0',
    color: 'var(--ink)',
    outline: 'none',
  },
  button: {
    fontFamily: "'EB Garamond', serif",
    fontStyle: 'italic',
    fontSize: 14,
    letterSpacing: '0.06em',
    color: 'var(--ink-soft)',
    background: 'transparent',
    border: 0,
    borderBottom: '1px solid var(--line)',
    padding: '6px 2px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  message: {
    fontFamily: "'EB Garamond', serif",
    fontStyle: 'italic',
    color: 'var(--ink-soft)',
    lineHeight: 1.5,
  },
  error: {
    fontFamily: "'EB Garamond', serif",
    color: 'var(--red)',
    fontSize: 13,
    fontStyle: 'italic',
    margin: 0,
  },
};
