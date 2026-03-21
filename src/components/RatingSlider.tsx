import { RATING_LABELS, getRatingLabel, getRatingColor } from '../types';

interface RatingSliderProps {
  value: number;
  onChange: (val: number) => void;
}

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  const label = getRatingLabel(value);
  const color = getRatingColor(value);

  return (
    <div className="rating-slider">
      <div
        className="rating-badge"
        style={{
          background: `${color}18`,
          border: `2px solid ${color}`,
          margin: '0 auto 12px',
          width: 'fit-content',
        }}
      >
        <span className="rating-label" style={{ color }}>{label}</span>
        <span className="rating-number" style={{ color }}>{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="rating-marks">
        {Object.entries(RATING_LABELS).map(([num, lbl]) => (
          <span key={num} className="rating-mark">{lbl}</span>
        ))}
      </div>
    </div>
  );
}
