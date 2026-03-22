import { useRef, useState } from 'react';
import { getRatingLabel, getRatingColor } from '../types';
import type { Dish } from '../types';
import { Sparkles, Trash2 } from 'lucide-react';

interface Props {
  dish: Dish;
  onDelete?: () => void;
  onEdit?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function DishCard({ dish, onDelete, onEdit, selectionMode, selected, onToggleSelect }: Props) {
  const hasRating = dish.rating !== null && !dish.want_to_try;
  const cardRef = useRef<HTMLDivElement>(null);
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

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
      return;
    }

    if (!isHorizontalSwipe.current) return;

    // Only allow swiping left
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
      // Swiped far enough — show delete
      setSwipeX(-80);
    } else {
      setSwipeX(0);
    }
  };

  const handleSwipeDelete = () => {
    if (onDelete && confirm(`Delete "${dish.name}"?`)) {
      onDelete();
    } else {
      setSwipeX(0);
    }
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius)', marginBottom: 10, border: selected ? '2px solid var(--hot-pink)' : undefined }}>
      {/* Delete behind the card */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
        ref={cardRef}
        className="card"
        style={{
          padding: 12,
          cursor: onEdit ? 'pointer' : 'default',
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 0.2s ease-out',
          position: 'relative',
          zIndex: 1,
        }}
        onClick={() => {
          if (selectionMode && onToggleSelect) {
            onToggleSelect();
          } else if (swipeX === 0 && onEdit) {
            onEdit();
          }
        }}
        onTouchStart={!selectionMode && onDelete ? handleTouchStart : undefined}
        onTouchMove={!selectionMode && onDelete ? handleTouchMove : undefined}
        onTouchEnd={!selectionMode && onDelete ? handleTouchEnd : undefined}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {selectionMode && (
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              border: `2px solid ${selected ? 'var(--hot-pink)' : 'var(--border)'}`,
              background: selected ? 'var(--hot-pink)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginRight: 10, marginTop: 2,
            }}>
              {selected && <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>✓</span>}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4
                style={{
                  fontFamily: "'Righteous', cursive",
                  fontSize: 15,
                  color: 'var(--text-primary)',
                }}
              >
                {dish.name}
              </h4>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textTransform: 'capitalize',
                  background: 'var(--bg-secondary)',
                  padding: '2px 8px',
                  borderRadius: 10,
                }}
              >
                {dish.dish_type}
              </span>
            </div>

            {dish.want_to_try && (
              <div className="want-to-try-badge" style={{ marginTop: 6 }}>
                <Sparkles size={12} />
                Want to Try
              </div>
            )}

            {hasRating && (
              <div style={{ marginTop: 6 }}>
                <div
                  className="rating-badge"
                  style={{
                    background: `${getRatingColor(dish.rating!)}18`,
                    border: `2px solid ${getRatingColor(dish.rating!)}`,
                    display: 'inline-flex',
                    flexDirection: 'row',
                    gap: 8,
                    padding: '4px 12px',
                  }}
                >
                  <span
                    className="rating-label"
                    style={{ color: getRatingColor(dish.rating!), fontSize: 13 }}
                  >
                    {getRatingLabel(dish.rating!)}
                  </span>
                  <span
                    className="rating-number"
                    style={{ color: getRatingColor(dish.rating!), fontSize: 16 }}
                  >
                    {dish.rating!.toFixed(1)}
                  </span>
                </div>
              </div>
            )}

            {dish.notes && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                {dish.notes}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginLeft: 8 }}>
            {dish.photos?.length > 0 && (
              <img
                src={dish.photos[0]}
                alt={dish.name}
                style={{
                  width: 56, height: 56, objectFit: 'cover',
                  borderRadius: 8, border: '2px solid var(--border)',
                }}
              />
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${dish.name}"?`)) onDelete();
                }}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-muted)', padding: 4,
                  flexShrink: 0,
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
