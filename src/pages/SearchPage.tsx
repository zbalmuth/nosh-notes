import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, X, Loader, Plus, UtensilsCrossed } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { searchRestaurants, searchDishes } from '../lib/api';
import type { SearchResult, SearchProvider, Dish } from '../types';
import { getRatingColor } from '../types';

export function SearchPage() {
  const navigate = useNavigate();
  const { restaurants } = useApp();

  const [query, setQuery] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [customLocation, setCustomLocation] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();

  // Dish search
  const [dishResults, setDishResults] = useState<Dish[]>([]);
  const [searchingDishes, setSearchingDishes] = useState(false);

  // External discover
  const [discoverResults, setDiscoverResults] = useState<SearchResult[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [provider, setProvider] = useState<SearchProvider>('google');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-detect location once
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
        );
        const data = await res.json();
        const city = data.address?.city || data.address?.town || data.address?.village || '';
        if (city) setLocationLabel(city);
      } catch { /* ignore */ }
    }, () => { /* ignore */ });
  }, []);

  // Real-time collection filter
  const collectionResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return restaurants.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.city?.toLowerCase().includes(q) ||
      r.cuisine_tags?.some(t => t.toLowerCase().includes(q))
    );
  }, [query, restaurants]);

  // Debounced dish + external search (700 ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setDishResults([]);
      setDiscoverResults([]);
      setDiscoverError('');
      return;
    }
    debounceRef.current = setTimeout(async () => {
      // Dish search
      setSearchingDishes(true);
      searchDishes(query)
        .then(setDishResults)
        .catch(() => setDishResults([]))
        .finally(() => setSearchingDishes(false));

      // External discover
      setDiscovering(true);
      setDiscoverError('');
      const loc = customLocation || locationLabel || undefined;
      searchRestaurants(query, provider, loc, latitude, longitude)
        .then(setDiscoverResults)
        .catch(() => {
          setDiscoverError('Nearby search unavailable right now');
          setDiscoverResults([]);
        })
        .finally(() => setDiscovering(false));
    }, 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, provider, locationLabel, customLocation, latitude, longitude]);

  const clearQuery = () => {
    setQuery('');
    setDishResults([]);
    setDiscoverResults([]);
    setDiscoverError('');
    inputRef.current?.focus();
  };

  const effectiveLocation = customLocation || locationLabel;
  const hasQuery = query.trim().length > 0;
  const hasQuery2 = query.trim().length >= 2;

  return (
    <div>
      {/* Sticky header */}
      <div style={{
        padding: '16px 20px 12px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div className="search-bar" style={{ margin: 0 }}>
          <Search size={18} color="var(--text-muted)" />
          <input
            ref={inputRef}
            placeholder="Restaurants, dishes, cities, notes..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={clearQuery}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 2 }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Location pill */}
        {editingLocation ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Enter city or address..."
              value={customLocation}
              onChange={e => setCustomLocation(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingLocation(false); }}
              autoFocus
              style={{ fontSize: 13, padding: '6px 12px', flex: 1 }}
            />
            <button
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: 12 }}
              onClick={() => setEditingLocation(false)}
            >
              Done
            </button>
          </div>
        ) : effectiveLocation ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <button
              onClick={() => setEditingLocation(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
                color: 'var(--electric-blue)', fontSize: 12, fontWeight: 500,
              }}
            >
              <MapPin size={11} />
              {effectiveLocation}
            </button>
            {customLocation && (
              <button
                onClick={() => setCustomLocation('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', lineHeight: 1, padding: 0 }}
                title="Reset to my location"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div style={{ paddingBottom: 100 }}>
        {!hasQuery ? (
          <div className="empty-state" style={{ paddingTop: 60 }}>
            <Search size={40} color="var(--border)" />
            <h3 style={{ marginTop: 14, color: 'var(--hot-pink)' }}>Find a restaurant or dish</h3>
            <p style={{ marginTop: 6, fontSize: 13, maxWidth: 260 }}>
              Search your saved places, dishes, and notes — or discover new spots nearby
            </p>
          </div>
        ) : (
          <>
            {/* ── Your Restaurants ── */}
            <SectionHeader label="Your Restaurants" count={collectionResults.length} />
            <div style={{ padding: '0 20px' }}>
              {collectionResults.length > 0 ? collectionResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/restaurant/${r.id}`)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8,
                    cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center',
                  }}
                >
                  {r.image_url && (
                    <img src={r.image_url} alt={r.name}
                      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'Righteous', cursive", fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>{r.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[r.city, r.state].filter(Boolean).join(', ')}</p>
                    {r.cuisine_tags?.length > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--electric-blue)', marginTop: 2 }}>{r.cuisine_tags.slice(0, 3).join(' · ')}</p>
                    )}
                  </div>
                  {r.is_favorite && <span style={{ color: 'var(--hot-pink)', fontSize: 16, flexShrink: 0 }}>♥</span>}
                </button>
              )) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>No restaurants match</p>
              )}
            </div>

            {/* ── Your Dishes ── */}
            <SectionHeader
              label="Your Dishes"
              count={dishResults.length}
              loading={searchingDishes}
            />
            <div style={{ padding: '0 20px' }}>
              {!hasQuery2 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Keep typing…</p>
              ) : dishResults.length > 0 ? dishResults.map(dish => {
                const restaurant = restaurants.find(r => r.id === dish.restaurant_id);
                return (
                  <button
                    key={dish.id}
                    onClick={() => restaurant && navigate(`/restaurant/${restaurant.id}`)}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8,
                      cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <UtensilsCrossed size={16} color="var(--hot-pink)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <p style={{ fontFamily: "'Righteous', cursive", fontSize: 14, color: 'var(--text-primary)' }}>
                          {dish.name}
                        </p>
                        {dish.want_to_try && (
                          <span style={{ fontSize: 10, color: 'var(--cyan)', fontWeight: 600, border: '1px solid var(--cyan)', borderRadius: 10, padding: '1px 6px' }}>Want to Try</span>
                        )}
                        {dish.rating != null && !dish.want_to_try && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: getRatingColor(dish.rating) }}>
                            {dish.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {restaurant && (
                        <p style={{ fontSize: 12, color: 'var(--electric-blue)', marginBottom: dish.notes ? 3 : 0 }}>
                          {restaurant.name}{restaurant.city ? ` · ${restaurant.city}` : ''}
                        </p>
                      )}
                      {dish.notes && (
                        <p style={{
                          fontSize: 12, color: 'var(--text-muted)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          "{dish.notes}"
                        </p>
                      )}
                    </div>
                  </button>
                );
              }) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>No dishes or notes match</p>
              )}
            </div>

            {/* ── Discover Nearby ── */}
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 1,
                  fontFamily: "'Righteous', cursive",
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  Discover Nearby
                  {discovering && <Loader size={11} className="spin" />}
                </p>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['google', 'yelp'] as SearchProvider[]).map(p => (
                    <button key={p} onClick={() => setProvider(p)} style={{
                      fontSize: 10, padding: '3px 9px', borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: provider === p ? 'var(--hot-pink)' : 'var(--bg-card)',
                      color: provider === p ? 'white' : 'var(--text-muted)',
                      fontWeight: 600, cursor: 'pointer',
                    }}>
                      {p === 'google' ? 'Google' : 'Yelp'}
                    </button>
                  ))}
                </div>
              </div>

              {discoverError && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>{discoverError}</p>
              )}

              {!hasQuery2 ? null : discoverResults.map(result => {
                const alreadySaved = restaurants.some(
                  r => r.name.toLowerCase() === result.name.toLowerCase() &&
                       r.city?.toLowerCase() === result.city?.toLowerCase()
                );
                return (
                  <div key={result.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8,
                    display: 'flex', gap: 12, alignItems: 'center',
                  }}>
                    {result.image_url && (
                      <img src={result.image_url} alt={result.name}
                        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "'Righteous', cursive", fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>{result.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.address}</p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
                        {result.price_level && <span style={{ fontSize: 11, color: 'var(--palm-green)', fontWeight: 600 }}>{result.price_level}</span>}
                        {result.rating && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>★ {result.rating}</span>}
                      </div>
                    </div>
                    {alreadySaved ? (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Saved
                      </span>
                    ) : (
                      <button
                        onClick={() => navigate('/add-restaurant', { state: { prefill: result } })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                          background: 'linear-gradient(135deg, var(--hot-pink), var(--purple))',
                          border: 'none', borderRadius: 20, padding: '5px 10px',
                          color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        <Plus size={12} />
                        Add
                      </button>
                    )}
                  </div>
                );
              })}

              {hasQuery2 && !discovering && discoverResults.length === 0 && !discoverError && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No nearby results found</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, count, loading }: { label: string; count: number; loading?: boolean }) {
  return (
    <div style={{ padding: '16px 20px 8px' }}>
      <p style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 1,
        fontFamily: "'Righteous', cursive",
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {label}
        {count > 0 && <span style={{ color: 'var(--hot-pink)' }}>· {count}</span>}
        {loading && <Loader size={10} className="spin" />}
      </p>
    </div>
  );
}
