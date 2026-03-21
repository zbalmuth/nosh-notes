import { getRatingLabel, getRatingColor } from '../types';
import type { Dish } from '../types';
import { Sparkles, Trash2 } from 'lucide-react';

interface Props {
  dish: Dish;
  onDelete?: () => void;
  onEdit?: () => void;
}

export function DishCard({ dish, onDelete, onEdit }: Props) {
  const hasRating = dish.rating !== null && !dish.want_to_try;

  return (
    <div
      className="card"
      style={{ marginBottom: 10, padding: 12, cursor: onEdit ? 'pointer' : 'default' }}
      onClick={onEdit}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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

        {dish.photos?.length > 0 && (
          <img
            src={dish.photos[0]}
            alt={dish.name}
            style={{
              width: 56,
              height: 56,
              objectFit: 'cover',
              borderRadius: 8,
              border: '2px solid var(--border)',
              marginLeft: 12,
            }}
          />
        )}
      </div>

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete "${dish.name}"?`)) onDelete();
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            padding: 4,
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
