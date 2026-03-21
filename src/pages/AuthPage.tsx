import { useState } from 'react';
import { signIn, signUp } from '../lib/api';
import { supabase } from '../lib/supabase';

export function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      if (isSignUp) {
        const { error: authError } = await signUp(email, password);
        if (authError) {
          setError(authError.message);
        } else {
          setSuccessMsg('Check your email to confirm your account!');
          setIsSignUp(false);
          setPassword('');
        }
      } else {
        const { error: authError } = await signIn(email, password);
        if (authError) {
          setError(authError.message);
        } else if (!rememberMe) {
          window.addEventListener('beforeunload', () => {
            supabase.auth.signOut();
          }, { once: true });
        }
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="auth-page">
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 60 }}>🍽️</span>
        </div>
        <h1>Nosh Notes</h1>
        <p style={{ fontFamily: "'Righteous', cursive", color: 'var(--text-secondary)', fontSize: 15 }}>
          Your restaurant journal
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {!isSignUp && (
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              padding: '4px 0',
            }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--hot-pink)' }}
              />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Remember me for 90 days
              </span>
            </label>
          )}
          {successMsg && (
            <p style={{ color: 'var(--palm-green)', fontSize: 13, background: '#56820312', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--palm-green)' }}>
              {successMsg}
            </p>
          )}
          {error && (
            <p style={{ color: 'var(--coral)', fontSize: 13 }}>{error}</p>
          )}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button
            type="button"
            className="toggle-link"
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </form>

        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: "'Righteous', cursive",
        }}>
          Nosh Notes 2026
        </div>
      </div>
    </div>
  );
}
