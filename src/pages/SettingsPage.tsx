import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Palette, MapPin, Plus, X, Merge, LogOut } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { supabase } from '../lib/supabase';

const THEME_KEY = 'nosh-notes-theme';

type ThemeName = 'miami' | 'groovy' | 'diner';

export function getTheme(): ThemeName {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemeName) || 'miami';
  } catch {
    return 'miami';
  }
}

export function setTheme(theme: ThemeName) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  if (theme === 'miami') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { restaurants, cities, updateRestaurant, showToast, refreshRestaurants } = useApp();

  const [currentTheme, setCurrentTheme] = useState<ThemeName>(getTheme());
  const [showCityManager, setShowCityManager] = useState(false);
  const [mergeFrom, setMergeFrom] = useState<string[]>([]);
  const [mergeTo, setMergeTo] = useState('');
  const [newCityName, setNewCityName] = useState('');
  const [showAddCity, setShowAddCity] = useState(false);

  const handleThemeChange = (theme: ThemeName) => {
    setCurrentTheme(theme);
    setTheme(theme);
  };

  const handleMergeCities = async () => {
    if (mergeFrom.length === 0 || !mergeTo.trim()) return;
    const target = mergeTo.trim();

    // Bulk update directly via Supabase for speed
    const ids = restaurants.filter(r => r.city && mergeFrom.includes(r.city)).map(r => r.id);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from('restaurants')
      .update({ city: target, updated_at: new Date().toISOString() })
      .in('id', ids);

    if (error) {
      showToast(`Error: ${error.message}`);
      return;
    }

    await refreshRestaurants();
    showToast(`${ids.length} restaurant${ids.length !== 1 ? 's' : ''} moved to "${target}"`);
    setMergeFrom([]);
    setMergeTo('');
  };

  const handleAddCityToRestaurant = async () => {
    // This would need to pick a restaurant - for now not needed
  };

  const toggleMergeCity = (city: string) => {
    setMergeFrom((prev) => {
      const next = prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city];
      // Auto-fill mergeTo with the city that has the most restaurants
      if (next.length > 0 && !mergeTo) {
        const cityCounts = next.map((c) => ({
          city: c,
          count: restaurants.filter((r) => r.city === c).length,
        }));
        cityCounts.sort((a, b) => b.count - a.count);
        setMergeTo(cityCounts[0].city);
      }
      return next;
    });
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Miami Vice theme */}
            <button
              onClick={() => handleThemeChange('miami')}
              style={{
                flex: '1 1 calc(33% - 8px)', minWidth: 90, padding: 12, borderRadius: 'var(--radius)',
                border: `2px solid ${currentTheme === 'miami' ? '#FF1493' : 'var(--border)'}`,
                background: currentTheme === 'miami' ? 'rgba(255,20,147,0.1)' : 'var(--bg-card)',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{
                width: '100%', height: 32, borderRadius: 6, marginBottom: 6,
                background: 'linear-gradient(135deg, #FF1493, #00D4FF, #0F0F23)',
              }} />
              <span style={{
                fontFamily: "'Righteous', cursive", fontSize: 12,
                color: currentTheme === 'miami' ? '#FF1493' : 'var(--text-secondary)',
              }}>
                Miami Vice
              </span>
            </button>

            {/* Groovy theme */}
            <button
              onClick={() => handleThemeChange('groovy')}
              style={{
                flex: '1 1 calc(33% - 8px)', minWidth: 90, padding: 12, borderRadius: 'var(--radius)',
                border: `2px solid ${currentTheme === 'groovy' ? '#FF6B35' : 'var(--border)'}`,
                background: currentTheme === 'groovy' ? 'rgba(255,107,53,0.1)' : 'var(--bg-card)',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{
                width: '100%', height: 32, borderRadius: 6, marginBottom: 6,
                background: 'linear-gradient(135deg, #FF6B35, #FFD700, #FF1493, #7B2FF7)',
              }} />
              <span style={{
                fontFamily: "'Righteous', cursive", fontSize: 12,
                color: currentTheme === 'groovy' ? '#FF6B35' : 'var(--text-secondary)',
              }}>
                Groovy
              </span>
            </button>

            {/* Diner theme */}
            <button
              onClick={() => handleThemeChange('diner')}
              style={{
                flex: '1 1 calc(33% - 8px)', minWidth: 90, padding: 12, borderRadius: 'var(--radius)',
                border: `2px solid ${currentTheme === 'diner' ? '#E63946' : 'var(--border)'}`,
                background: currentTheme === 'diner' ? 'rgba(230,57,70,0.1)' : 'var(--bg-card)',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{
                width: '100%', height: 32, borderRadius: 6, marginBottom: 6,
                background: 'linear-gradient(135deg, #E63946, #F1FAEE, #48CAE4, #1D3557)',
              }} />
              <span style={{
                fontFamily: "'Righteous', cursive", fontSize: 12,
                color: currentTheme === 'diner' ? '#E63946' : 'var(--text-secondary)',
              }}>
                Diner
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

          {/* Merge controls — always visible when cities selected */}
          {mergeFrom.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '2px solid var(--hot-pink)',
              borderRadius: 'var(--radius)', padding: 16, marginBottom: 12,
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Rename <strong style={{ color: 'var(--hot-pink)' }}>{mergeFrom.join(', ')}</strong> to:
              </p>
              <input
                className="input"
                placeholder="Type target city name (e.g. Los Angeles)..."
                value={mergeTo}
                onChange={(e) => setMergeTo(e.target.value)}
                autoFocus
                style={{ fontSize: 14, padding: '10px 14px', marginBottom: 10, width: '100%' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  style={{
                    flex: 1, padding: '10px 16px', fontSize: 14,
                    opacity: mergeTo.trim() ? 1 : 0.4,
                  }}
                  onClick={handleMergeCities}
                  disabled={!mergeTo.trim()}
                >
                  Merge {mergeFrom.length} {mergeFrom.length === 1 ? 'City' : 'Cities'}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '10px 16px', fontSize: 14 }}
                  onClick={() => { setMergeFrom([]); setMergeTo(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Fix menu links for existing restaurants */}
        <div style={{ marginBottom: 24 }}>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={async () => {
              let fixed = 0;
              for (const r of restaurants) {
                if (r.google_url && !r.menu_url) {
                  await updateRestaurant(r.id, { menu_url: `${r.google_url.replace(/\/$/, '')}/menu` });
                  fixed++;
                }
              }
              await refreshRestaurants();
              showToast(fixed > 0 ? `Fixed menu links for ${fixed} restaurants` : 'All restaurants already have menu links');
            }}
          >
            Fix Menu Links for Existing Restaurants
          </button>
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
