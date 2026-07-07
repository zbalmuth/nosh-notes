import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { signIn, signUp } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAppLock } from '../hooks/useAppLock';
import { BiometryType } from '@aparajita/capacitor-biometric-auth';

interface AuthPageProps {
  session?: Session | null;
}

export function AuthPage({ session }: AuthPageProps) {
  const { needsUnlock, biometryType, unlock, markUnlocked } = useAppLock();
  const [unlocking, setUnlocking] = useState(false);
  const [unlockFailed, setUnlockFailed] = useState(false);

  // A restored session still needs Face ID confirmation before it's usable —
  // everything else (signed out, or already unlocked) falls through to the
  // normal sign-in form below.
  const showLockPanel = !!session && needsUnlock;

  const attemptUnlock = async () => {
    setUnlocking(true);
    setUnlockFailed(false);
    const ok = await unlock();
    setUnlocking(false);
    if (ok) markUnlocked();
    else setUnlockFailed(true);
  };

  useEffect(() => {
    if (showLockPanel) attemptUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLockPanel]);

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
          // Move session from localStorage to sessionStorage so it is cleared when the tab closes.
          // The hybridStorage adapter in supabase.ts will then find it in sessionStorage and keep
          // it there for the lifetime of the tab without persisting it across browser restarts.
          const key = 'nosh-notes-auth';
          const stored = window.localStorage.getItem(key);
          if (stored) {
            window.sessionStorage.setItem(key, stored);
            window.localStorage.removeItem(key);
          }
        }
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (showLockPanel) {
    return (
      <div className="app-container">
        <div className="auth-page">
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 60 }}>🍽️</span>
          </div>
          <h1>Nosh Notes</h1>
          {unlockFailed && (
            <p style={{ color: 'var(--coral)', fontSize: 13, marginTop: 8 }}>
              Authentication failed. Try again.
            </p>
          )}
          <button
            className="btn btn-primary"
            type="button"
            disabled={unlocking}
            onClick={attemptUnlock}
            style={{ width: '100%', marginTop: 24 }}
          >
            {unlocking
              ? 'Unlocking...'
              : biometryType === BiometryType.faceId
                ? 'Continue with Face ID'
                : 'Continue'}
          </button>
          <button
            type="button"
            className="toggle-link"
            onClick={() => supabase.auth.signOut()}
          >
            Sign in with a different account
          </button>
        </div>
      </div>
    );
  }

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
