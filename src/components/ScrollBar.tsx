import { useRef, useState, useEffect, useCallback } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ScrollBar({ children, className, style }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbLeft, setThumbLeft] = useState(0);
  const [thumbWidth, setThumbWidth] = useState(24);
  const [canScroll, setCanScroll] = useState(false);

  const updateThumb = useCallback(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth) {
      setCanScroll(false);
      return;
    }
    setCanScroll(true);

    const trackWidth = track.clientWidth;
    const ratio = clientWidth / scrollWidth;
    const tw = Math.max(20, ratio * trackWidth);
    const maxScroll = scrollWidth - clientWidth;
    const maxThumbLeft = trackWidth - tw;
    const left = (scrollLeft / maxScroll) * maxThumbLeft;

    setThumbWidth(tw);
    setThumbLeft(left);
  }, []);

  useEffect(() => {
    updateThumb();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateThumb);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateThumb]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackWidth = track.clientWidth;
    const { scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    const ratio = clickX / trackWidth;
    el.scrollTo({ left: ratio * maxScroll, behavior: 'smooth' });
  };

  return (
    <div style={{ position: 'relative', ...style }}>
      <div
        ref={scrollRef}
        className={className}
        style={{ padding: 0, gap: 8 }}
        onScroll={updateThumb}
      >
        {children}
      </div>
      {canScroll && (
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          style={{
            marginTop: 6,
            marginLeft: 20,
            marginRight: 20,
            height: 4,
            borderRadius: 2,
            background: 'var(--border)',
            opacity: 0.3,
            position: 'relative',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: thumbLeft,
              width: thumbWidth,
              height: 4,
              borderRadius: 2,
              background: 'var(--text-muted)',
              opacity: 0.8,
            }}
          />
        </div>
      )}
    </div>
  );
}
