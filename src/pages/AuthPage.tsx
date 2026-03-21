import { useState } from 'react';
import { signIn, signUp } from '../lib/api';

export function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: authError } = isSignUp
        ? await signUp(email, password)
        : await signIn(email, password);
      if (authError) setError(authError.message);
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
          Your groovy restaurant journal
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
          {error && (
            <p style={{ color: 'var(--rust)', fontSize: 13 }}>{error}</p>
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
          ✌️ Far Out Dining Since 2026 ✌️
        </div>
      </div>
    </div>
  );
}
