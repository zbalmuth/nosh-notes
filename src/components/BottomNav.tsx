import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Map, Search, Settings } from 'lucide-react';

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
        onClick={() => navigate('/?search=true')}
      >
        <Search size={22} />
        <span>Search</span>
      </button>
      <button
        className={isActive('/settings') ? 'active' : ''}
        onClick={() => navigate('/settings')}
      >
        <Settings size={22} />
        <span>Settings</span>
      </button>
    </nav>
  );
}
