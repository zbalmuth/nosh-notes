import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Palette, MapPin, Plus, X, Merge, LogOut } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { supabase } from '../lib/supabase';

const THEME_KEY = 'nosh-notes-theme';

export function getTheme(): 'miami' | 'groovy' {
  try {
    return (localStorage.getItem(THEME_KEY) as 'miami' | 'groovy') || 'miami';
  } catch {
    return 'miami';
  }
}

export function setTheme(theme: 'miami' | 'groovy') {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: 'miami' | 'groovy') {
  const root = document.documentElement;
  if (theme === 'groovy') {
    root.setAttribute('data-theme', 'groovy');
  } else {
    root.removeAttribute('data-theme');
  }
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { restaurants, cities, updateRestaurant, showToast, refreshRestaurants } = useApp();

  const [currentTheme, setCurrentTheme] = useState<'miami' | 'groovy'>(getTheme());
  const [showCityManager, setShowCityManager] = useState(false);
  const [mergeFrom, setMergeFrom] = useState<string[]>([]);
  const [mergeTo, setMergeTo] = useState('');
  const [newCityName, setNewCityName] = useState('');
  const [showAddCity, setShowAddCity] = useState(false);

  const handleThemeChange = (theme: 'miami' | 'groovy') => {
    setCurrentTheme(theme);
    setTheme(theme);
  };

  const handleMergeCities = async () => {
    if (mergeFrom.length === 0 || !mergeTo.trim()) return;
    const target = mergeTo.trim();

    let count = 0;
    for (const r of restaurants) {
      if (r.city && mergeFrom.includes(r.city)) {
        await updateRestaurant(r.id, { city: target });
        count++;
      }
    }

    await refreshRestaurants();
    showToast(`${count} restaurant${count !== 1 ? 's' : ''} moved to "${target}"`);
    setMergeFrom([]);
    setMergeTo('');
  };

  const handleAddCityToRestaurant = async () => {
    // This would need to pick a restaurant - for now not needed
  };

  const toggleMergeCity = (city: string) => {
    setMergeFrom((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
    );
  };

  return (
    <div>
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1 }}>Settings</h1>
      </div>

      <div style={{ padding: '16px 20px 100px' }}>
        {/* Theme */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Palette size={18} style={{ color: 'var(--hot-pink)' }} />
            <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, color: 'var(--hot-pink)' }}>
              Theme
            </h3>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {/* Miami Vice theme */}
            <button
              onClick={() => handleThemeChange('miami')}
              style={{
                flex: 1, padding: 16, borderRadius: 'var(--radius)',
                border: `2px solid ${currentTheme === 'miami' ? 'var(--hot-pink)' : 'var(--border)'}`,
                background: currentTheme === 'miami' ? 'rgba(255,20,147,0.1)' : 'var(--bg-card)',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{
                width: '100%', height: 40, borderRadius: 8, marginBottom: 8,
                background: 'linear-gradient(135deg, #FF1493, #00D4FF, #0F0F23)',
              }} />
              <span style={{
                fontFamily: "'Righteous', cursive", fontSize: 13,
                color: currentTheme === 'miami' ? 'var(--hot-pink)' : 'var(--text-secondary)',
              }}>
                Miami Vice
              </span>
            </button>

            {/* Groovy theme */}
            <button
              onClick={() => handleThemeChange('groovy')}
              style={{
                flex: 1, padding: 16, borderRadius: 'var(--radius)',
                border: `2px solid ${currentTheme === 'groovy' ? '#FF6B35' : 'var(--border)'}`,
                background: currentTheme === 'groovy' ? 'rgba(255,107,53,0.1)' : 'var(--bg-card)',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{
                width: '100%', height: 40, borderRadius: 8, marginBottom: 8,
                background: 'linear-gradient(135deg, #FF6B35, #FFD700, #FF1493, #7B2FF7)',
              }} />
              <span style={{
                fontFamily: "'Righteous', cursive", fontSize: 13,
                color: currentTheme === 'groovy' ? '#FF6B35' : 'var(--text-secondary)',
              }}>
                Groovy
              </span>
            </button>
          </div>
        </div>

        {/* City Management */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <MapPin size={18} style={{ color: 'var(--hot-pink)' }} />
            <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, color: 'var(--hot-pink)' }}>
              Manage Cities
            </h3>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Combine multiple cities into one, or rename cities across all restaurants.
          </p>

          {/* City list with checkboxes */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 12,
          }}>
            {cities.map((city) => {
              const count = restaurants.filter((r) => r.city === city).length;
              return (
                <div
                  key={city}
                  onClick={() => toggleMergeCity(city)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: mergeFrom.includes(city) ? 'rgba(255,20,147,0.1)' : 'transparent',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    border: `2px solid ${mergeFrom.includes(city) ? 'var(--hot-pink)' : 'var(--border)'}`,
                    background: mergeFrom.includes(city) ? 'var(--hot-pink)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {mergeFrom.includes(city) && <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)' }}>{city}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* Merge controls */}
          {mergeFrom.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 16, marginBottom: 12,
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Rename <strong style={{ color: 'var(--hot-pink)' }}>{mergeFrom.join(', ')}</strong> to:
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="Target city name..."
                  value={mergeTo}
                  onChange={(e) => setMergeTo(e.target.value)}
                  style={{ fontSize: 13, padding: '8px 12px' }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}
                  onClick={handleMergeCities}
                  disabled={!mergeTo.trim()}
                >
                  <Merge size={14} style={{ marginRight: 4 }} />
                  Merge
                </button>
              </div>
              <button
                onClick={() => { setMergeFrom([]); setMergeTo(''); }}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: 12, marginTop: 8, cursor: 'pointer',
                }}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          className="btn btn-secondary"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => {
            if (confirm('Sign out?')) {
              supabase.auth.signOut();
            }
          }}
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
