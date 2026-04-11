import { useState, useEffect } from 'react';
import { Search, X, Loader } from 'lucide-react';
import { searchRestaurants } from '../lib/api';
import type { SearchProvider, SearchResult } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}

export function SearchRestaurantDialog({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [provider, setProvider] = useState<SearchProvider>('google');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  // Auto-detect location once on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || '';
          if (city) setLocation(city);
        } catch { /* ignore */ }
      },
      () => { /* ignore */ }
    );
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const data = await searchRestaurants(query, provider, location || undefined, latitude, longitude);
      setResults(data);
      if (data.length === 0) setError('No results found. Try a different search.');
    } catch (err) {
      setError('Search failed. Make sure the search edge function is deployed.');
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Righteous', cursive", fontSize: 20, color: 'var(--hot-pink)' }}>
            Find Restaurant
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
            <X size={24} />
          </button>
        </div>

        <div className="provider-toggle" style={{ marginBottom: 16 }}>
          <button
            className={provider === 'google' ? 'active' : ''}
            onClick={() => setProvider('google')}
          >
            Google
          </button>
          <button
            className={provider === 'yelp' ? 'active' : ''}
            onClick={() => setProvider('yelp')}
          >
            Yelp
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <input
            className="input"
            placeholder="Restaurant name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <input
            className="input"
            placeholder="City or location (auto-detected)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
            {searching ? <Loader size={18} className="spin" /> : <Search size={18} />}
            Search
          </button>
        </div>

        {error && (
          <p style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
            {error}
          </p>
        )}

        <div style={{ maxHeight: 350, overflowY: 'auto' }}>
          {results.map((result) => (
            <div
              key={result.id}
              className="card"
              style={{ marginBottom: 8, cursor: 'pointer' }}
              onClick={() => onSelect(result)}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                {result.image_url && (
                  <img
                    src={result.image_url}
                    alt={result.name}
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '2px solid var(--border)',
                    }}
                  />
                )}
                <div>
                  <h4 style={{ fontFamily: "'Righteous', cursive", fontSize: 14 }}>
                    {result.name}
                  </h4>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {result.address}
                  </p>
                  {result.cuisine_tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {result.cuisine_tags.slice(0, 3).map((t) => (
                        <span key={t} className="chip" style={{ fontSize: 10, padding: '2px 8px' }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
