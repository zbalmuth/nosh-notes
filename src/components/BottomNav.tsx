import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Map, Search, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bottom-nav">
      <button
        className={isActive('/') ? 'active' : ''}
        onClick={() => navigate('/')}
      >
        <Home size={22} />
        <span>Home</span>
      </button>
      <button
        className={isActive('/map') ? 'active' : ''}
        onClick={() => navigate('/map')}
      >
        <Map size={22} />
        <span>Map</span>
      </button>
      <button
        className={isActive('/search') ? 'active' : ''}
        onClick={() => navigate('/?search=true')}
      >
        <Search size={22} />
        <span>Search</span>
      </button>
      <button
        onClick={() => {
          if (confirm('Sign out?')) {
            supabase.auth.signOut();
          }
        }}
      >
        <User size={22} />
        <span>Account</span>
      </button>
    </nav>
  );
}
