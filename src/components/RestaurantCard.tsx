import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Tag } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import type { Restaurant } from '../types';

interface Props {
  restaurant: Restaurant;
}

export function RestaurantCard({ restaurant }: Props) {
  const navigate = useNavigate();
  const { toggleFavorite } = useApp();

  return (
    <div
      className="card"
      style={{ marginBottom: 12, cursor: 'pointer', position: 'relative' }}
      onClick={() => navigate(`/restaurant/${restaurant.id}`)}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        {restaurant.image_url && (
          <img
            src={restaurant.image_url}
            alt={restaurant.name}
            style={{
              width: 72,
              height: 72,
              objectFit: 'cover',
              borderRadius: 8,
              border: '2px solid var(--border)',
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3
              style={{
                fontFamily: "'Righteous', cursive",
                fontSize: 16,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {restaurant.name}
            </h3>
            <button
              className={`favorite-btn ${restaurant.is_favorite ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(restaurant.id, !restaurant.is_favorite);
              }}
            >
              <Star size={18} fill={restaurant.is_favorite ? 'var(--mustard)' : 'none'} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            <MapPin size={12} />
            <span>{restaurant.city}{restaurant.state ? `, ${restaurant.state}` : ''}</span>
            {restaurant.price_level && (
              <span style={{ marginLeft: 8, color: 'var(--avocado)', fontWeight: 600 }}>
                {restaurant.price_level}
              </span>
            )}
          </div>
          {restaurant.cuisine_tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {restaurant.cuisine_tags.slice(0, 3).map((tag) => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <Tag size={10} color="var(--burnt-orange)" />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{tag}</span>
                </span>
              ))}
              {restaurant.cuisine_tags.length > 3 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  +{restaurant.cuisine_tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
