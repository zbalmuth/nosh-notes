import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Tag, Trash2 } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import type { Restaurant } from '../types';

interface Props {
  restaurant: Restaurant;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function RestaurantCard({ restaurant, selectionMode, selected, onToggleSelect }: Props) {
  const navigate = useNavigate();
  const { toggleFavorite, deleteRestaurant } = useApp();
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
      return;
    }

    if (!isHorizontalSwipe.current) return;

    if (deltaX < 0) {
      setSwipeX(Math.max(deltaX, -100));
    } else {
      setSwipeX(0);
    }
  };

  const handleTouchEnd = () => {
    setSwiping(false);
    isHorizontalSwipe.current = null;
    if (swipeX < -60) {
      setSwipeX(-80);
    } else {
      setSwipeX(0);
    }
  };

  const handleSwipeDelete = async () => {
    if (confirm(`Delete "${restaurant.name}" and all its dishes?`)) {
      await deleteRestaurant(restaurant.id);
    } else {
      setSwipeX(0);
    }
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius)', marginBottom: 12 }}>
      {/* Delete behind the card */}
      <div
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          width: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#FF1744',
          borderRadius: 'var(--radius)',
          cursor: 'pointer',
        }}
        onClick={handleSwipeDelete}
      >
        <Trash2 size={20} color="white" />
      </div>

      {/* Card content */}
      <div
        className="card"
        style={{
          cursor: 'pointer', position: 'relative', zIndex: 1,
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 0.2s ease-out',
          border: selected ? '2px solid var(--hot-pink)' : undefined,
          marginBottom: 0,
        }}
        onClick={() => {
          if (selectionMode && onToggleSelect) {
            onToggleSelect();
          } else if (swipeX === 0) {
            navigate(`/restaurant/${restaurant.id}`);
          }
        }}
        onTouchStart={!selectionMode ? handleTouchStart : undefined}
        onTouchMove={!selectionMode ? handleTouchMove : undefined}
        onTouchEnd={!selectionMode ? handleTouchEnd : undefined}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          {selectionMode && (
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              border: `2px solid ${selected ? 'var(--hot-pink)' : 'var(--border)'}`,
              background: selected ? 'var(--hot-pink)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, alignSelf: 'center',
            }}>
              {selected && <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>✓</span>}
            </div>
          )}
          {restaurant.image_url && (
            <img
              src={restaurant.image_url}
              alt={restaurant.name}
              style={{
                width: 72, height: 72, objectFit: 'cover',
                borderRadius: 8, border: '2px solid var(--border)', flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3
                style={{
                  fontFamily: "'Righteous', cursive", fontSize: 16,
                  color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
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
                <Star size={18} fill={restaurant.is_favorite ? 'var(--neon-pink)' : 'none'} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              <MapPin size={12} />
              <span>{restaurant.city}{restaurant.state ? `, ${restaurant.state}` : ''}</span>
              {restaurant.price_level && (
                <span style={{ marginLeft: 8, color: 'var(--palm-green)', fontWeight: 600 }}>
                  {restaurant.price_level}
                </span>
              )}
            </div>
            {restaurant.cuisine_tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {restaurant.cuisine_tags.slice(0, 3).map((tag) => (
                  <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    <Tag size={10} color="var(--hot-pink)" />
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
    </div>
  );
}
