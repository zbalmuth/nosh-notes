import { useState, useEffect } from 'react';
import { Search, X, Loader, ArrowLeft, ExternalLink, Star } from 'lucide-react';
import { searchRestaurants } from '../lib/api';
import type { SearchProvider, SearchResult } from '../types';
import { detectLocation } from '../lib/location';

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
  const [preview, setPreview] = useState<SearchResult | null>(null);

  useEffect(() => {
    detectLocation().then((loc) => {
      if (!loc) return;
      setLatitude(loc.lat);
      setLongitude(loc.lng);
      if (loc.city) setLocation(loc.city);
    });
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    setPreview(null);
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

  if (preview) {
    return (
      <div className="dialog-overlay" onClick={() => setPreview(null)}>
        <div className="dialog-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => setPreview(null)}
              style={{ background: 'none', border: 'none', color: 'var(--hot-pink)', padding: 0 }}
            >
              <ArrowLeft size={20} />
            </button>
            <h2 style={{ fontFamily: "'Righteous', cursive", fontSize: 18, color: 'var(--hot-pink)', flex: 1 }}>
              {preview.name}
            </h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={22} />
            </button>
          </div>

          {(preview.image_url || preview.photos?.[0]) && (
            <img
              src={preview.image_url || preview.photos[0]}
              alt={preview.name}
              style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 12, marginBottom: 12, border: '2px solid var(--border)' }}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {preview.rating != null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 14, color: '#f9a825', fontWeight: 600 }}>
                <Star size={14} fill="#f9a825" /> {preview.rating.toFixed(1)}
              </span>
            )}
            {preview.price_level && (
              <span style={{ fontSize: 14, color: 'var(--palm-green)', fontWeight: 600 }}>{preview.price_level}</span>
            )}
            {preview.cuisine_tags?.map((t) => (
              <span key={t} className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>{t}</span>
            ))}
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            {preview.address}
            {preview.city ? `, ${preview.city}` : ''}
            {preview.state ? `, ${preview.state}` : ''}
          </p>

          {/* External links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {preview.menu_url && (
              <a
                href={preview.menu_url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--electric-blue)', textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> View Menu
              </a>
            )}
            {preview.website && (
              <a
                href={preview.website}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--electric-blue)', textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> Website
              </a>
            )}
            {preview.yelp_url && (
              <a
                href={preview.yelp_url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--electric-blue)', textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> View on Yelp
              </a>
            )}
            {preview.google_url && (
              <a
                href={preview.google_url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--electric-blue)', textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> View on Google
              </a>
            )}
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => onSelect(preview)}>
            Add to Nosh Notes
          </button>
        </div>
      </div>
    );
  }

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
              onClick={() => setPreview(result)}
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontFamily: "'Righteous', cursive", fontSize: 14 }}>
                    {result.name}
                  </h4>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {result.address}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    {result.rating != null && (
                      <span style={{ fontSize: 11, color: '#f9a825', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Star size={10} fill="#f9a825" /> {result.rating.toFixed(1)}
                      </span>
                    )}
                    {result.price_level && (
                      <span style={{ fontSize: 11, color: 'var(--palm-green)', fontWeight: 600 }}>{result.price_level}</span>
                    )}
                    {result.cuisine_tags?.slice(0, 2).map((t) => (
                      <span key={t} className="chip" style={{ fontSize: 10, padding: '2px 6px' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', flexShrink: 0 }}>
                  Tap to preview
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
