import { useState, useEffect, useMemo } from 'react';
import { X, Star, BookOpen, Globe, MapPin, Clock, Plus, Loader, ChevronDown, Sparkles } from 'lucide-react';
import { getPlaceDetails } from '../lib/api';
import { haversineMiles, formatDistance } from '../lib/location';
import type { SearchResult, SearchProvider, OpeningHours } from '../types';

interface Props {
  result: SearchResult;
  provider: SearchProvider;
  userLat?: number;
  userLng?: number;
  alreadySaved?: boolean;
  onClose: () => void;
  onAdd: (result: SearchResult) => void;
}

export function RestaurantDetailDialog({
  result,
  provider,
  userLat,
  userLng,
  alreadySaved,
  onClose,
  onAdd,
}: Props) {
  // Start with whatever the list search already gave us; enrich on mount.
  const [photos, setPhotos] = useState<string[]>(
    result.photos?.length ? result.photos : result.image_url ? [result.image_url] : []
  );
  const [hours, setHours] = useState<OpeningHours | null>(null);
  const [highlights, setHighlights] = useState('');
  const [menuUrl, setMenuUrl] = useState(result.menu_url);
  const [website, setWebsite] = useState(result.website);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [showHours, setShowHours] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingDetails(true);
    getPlaceDetails(result.id, provider)
      .then((d) => {
        if (!active) return;
        if (d.photos.length) setPhotos((prev) => (prev.length > d.photos.length ? prev : d.photos));
        if (d.hours) setHours(d.hours);
        if (d.highlights) setHighlights(d.highlights);
        if (d.menu_url && !menuUrl) setMenuUrl(d.menu_url);
        if (d.website && !website) setWebsite(d.website);
      })
      .catch(() => {/* keep the basic view */})
      .finally(() => active && setLoadingDetails(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.id, provider]);

  const distance = useMemo(() => {
    if (userLat == null || userLng == null || result.latitude == null || result.longitude == null) {
      return null;
    }
    return haversineMiles(userLat, userLng, result.latitude, result.longitude);
  }, [userLat, userLng, result.latitude, result.longitude]);

  const fullAddress = [result.address, result.city, result.state].filter(Boolean).join(', ');
  const mapsUrl = result.google_url || `https://www.google.com/maps/search/${encodeURIComponent([result.name, result.city].filter(Boolean).join(' '))}`;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: '85vh', overflowY: 'auto',
          WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Righteous', cursive", fontSize: 19, color: 'var(--hot-pink)', flex: 1, lineHeight: 1.2 }}>
            {result.name}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 0, flexShrink: 0 }}>
            <X size={24} />
          </button>
        </div>

        {/* Photo gallery */}
        {photos.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12, paddingBottom: 4, scrollSnapType: 'x mandatory' }}>
            {photos.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`${result.name} ${i + 1}`}
                style={{
                  height: 150, minWidth: photos.length === 1 ? '100%' : 210,
                  width: photos.length === 1 ? '100%' : 'auto',
                  objectFit: 'cover', borderRadius: 12, border: '2px solid var(--border)',
                  flexShrink: 0, scrollSnapAlign: 'start',
                }}
              />
            ))}
          </div>
        ) : loadingDetails ? (
          <div style={{ height: 150, marginBottom: 12, borderRadius: 12, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader size={20} className="spin" color="var(--text-muted)" />
          </div>
        ) : null}

        {/* Quick facts row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {result.rating != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 14, color: '#f9a825', fontWeight: 600 }}>
              <Star size={14} fill="#f9a825" /> {result.rating.toFixed(1)}
            </span>
          )}
          {result.price_level && (
            <span style={{ fontSize: 14, color: 'var(--palm-green)', fontWeight: 600 }}>{result.price_level}</span>
          )}
          {distance != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--electric-blue)', fontWeight: 600 }}>
              <MapPin size={12} /> {formatDistance(distance)}
            </span>
          )}
          {hours?.open_now != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: hours.open_now ? 'var(--palm-green)' : 'var(--coral)' }}>
              {hours.open_now ? 'Open now' : 'Closed'}
            </span>
          )}
        </div>

        {/* Highlights — Google's AI summary of must-order dishes / vibe */}
        {highlights && (
          <div style={{ display: 'flex', gap: 7, marginBottom: 12, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <Sparkles size={15} color="var(--hot-pink)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{highlights}</p>
          </div>
        )}

        {/* Cuisine chips */}
        {result.cuisine_tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {result.cuisine_tags.map((t) => (
              <span key={t} className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>{t}</span>
            ))}
          </div>
        )}

        {/* Address */}
        {fullAddress && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', gap: 6 }}>
            <MapPin size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            {fullAddress}
          </p>
        )}

        {/* Hours (collapsible) */}
        {hours?.weekday_text?.length ? (
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setShowHours((s) => !s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600,
              }}
            >
              <Clock size={14} /> Hours
              <ChevronDown size={14} style={{ marginLeft: 'auto', transform: showHours ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {showHours && (
              <div style={{ marginTop: 8, paddingLeft: 20 }}>
                {hours.weekday_text.map((line) => (
                  <p key={line} style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>{line}</p>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Compact links: Menu · Website · Maps on one line */}
        <div className="links-row" style={{ marginBottom: 16, gap: 8 }}>
          {menuUrl && (
            <a href={menuUrl} target="_blank" rel="noreferrer" className="link-chip" style={{ padding: '6px 12px', fontSize: 12 }}>
              <BookOpen size={13} /> Menu
            </a>
          )}
          {website && (
            <a href={website} target="_blank" rel="noreferrer" className="link-chip" style={{ padding: '6px 12px', fontSize: 12 }}>
              <Globe size={13} /> Website
            </a>
          )}
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="link-chip" style={{ padding: '6px 12px', fontSize: 12 }}>
            <MapPin size={13} /> Maps
          </a>
        </div>

        {/* Add */}
        {alreadySaved ? (
          <div style={{ width: '100%', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            Already in your list
          </div>
        ) : (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => onAdd(result)}>
            <Plus size={18} /> Add to Nosh Notes
          </button>
        )}
      </div>
    </div>
  );
}
