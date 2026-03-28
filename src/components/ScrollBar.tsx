import { useRef, useEffect } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// Tiny indicator size (like bottom-of-the-barrel)
const SMALL_W = 28;
const SMALL_H = 2;
// Expanded size when interacting
const BIG_W = 40;
const BIG_H = 6;

export function ScrollBar({ children, className, style }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!el || !thumb || !track) return;

    let expanded = false;
    let shrinkTimer: ReturnType<typeof setTimeout> | null = null;

    const setSize = (big: boolean) => {
      if (big === expanded) return;
      expanded = big;
      const w = big ? BIG_W : SMALL_W;
      const h = big ? BIG_H : SMALL_H;
      thumb.style.height = `${h}px`;
      thumb.style.borderRadius = `${h / 2}px`;
      thumb.style.top = `${-h / 2 + 1}px`;
      thumb.style.opacity = big ? '0.7' : '0.4';
      thumb.style.transition = 'height 0.2s, top 0.2s, opacity 0.2s, border-radius 0.2s';
      // Update position with new width
      updatePosition(w);
    };

    const scheduleShrink = () => {
      if (shrinkTimer) clearTimeout(shrinkTimer);
      shrinkTimer = setTimeout(() => setSize(false), 1500);
    };

    const updatePosition = (tw?: number) => {
      const { scrollWidth, clientWidth, scrollLeft } = el;
      if (scrollWidth <= clientWidth + 2) {
        track.style.display = 'none';
        return;
      }
      track.style.display = 'block';

      const w = tw ?? (expanded ? BIG_W : SMALL_W);
      const trackWidth = track.clientWidth;
      const maxScroll = scrollWidth - clientWidth;
      const maxThumbLeft = trackWidth - w;
      const left = maxScroll > 0 ? (scrollLeft / maxScroll) * maxThumbLeft : 0;

      thumb.style.width = `${w}px`;
      thumb.style.transform = `translateX(${left}px)`;
    };

    updatePosition();
    el.addEventListener('scroll', () => updatePosition(), { passive: true });
    const observer = new ResizeObserver(() => updatePosition());
    observer.observe(el);

    // Click/tap on track area to expand and jump
    const jumpToPosition = (clientX: number) => {
      setSize(true);
      scheduleShrink();
      const rect = track.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const trackWidth = track.clientWidth;
      const { scrollWidth, clientWidth: cw } = el;
      const maxScroll = scrollWidth - cw;
      el.scrollTo({ left: (clickX / trackWidth) * maxScroll, behavior: 'smooth' });
    };

    const onTrackClick = (e: MouseEvent) => {
      if (e.target === thumb) return;
      jumpToPosition(e.clientX);
    };
    const onTrackTouch = (e: TouchEvent) => {
      if (e.target === thumb) return;
      e.preventDefault();
      jumpToPosition(e.touches[0].clientX);
    };

    track.addEventListener('click', onTrackClick);
    track.addEventListener('touchstart', onTrackTouch, { passive: false });

    // Thumb drag
    let dragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;

    const onThumbDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      setSize(true);
      if (shrinkTimer) clearTimeout(shrinkTimer);
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      dragStartX = clientX;
      dragStartScroll = el.scrollLeft;
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      document.addEventListener('touchmove', onDragMove, { passive: false });
      document.addEventListener('touchend', onDragEnd);
    };

    const onDragMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const deltaX = clientX - dragStartX;
      const trackWidth = track.clientWidth;
      const maxThumbLeft = trackWidth - BIG_W;
      const { scrollWidth, clientWidth: cw } = el;
      const maxScroll = scrollWidth - cw;
      const scrollDelta = maxThumbLeft > 0 ? (deltaX / maxThumbLeft) * maxScroll : 0;
      el.scrollLeft = dragStartScroll + scrollDelta;
    };

    const onDragEnd = () => {
      dragging = false;
      scheduleShrink();
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
    };

    thumb.addEventListener('mousedown', onThumbDown);
    thumb.addEventListener('touchstart', onThumbDown, { passive: false });

    return () => {
      el.removeEventListener('scroll', () => updatePosition());
      observer.disconnect();
      track.removeEventListener('click', onTrackClick);
      track.removeEventListener('touchstart', onTrackTouch);
      thumb.removeEventListener('mousedown', onThumbDown);
      thumb.removeEventListener('touchstart', onThumbDown);
      if (shrinkTimer) clearTimeout(shrinkTimer);
    };
  }, [children]);

  return (
    <div style={style}>
      <div ref={scrollRef} className={className}>
        {children}
      </div>
      <div
        ref={trackRef}
        style={{
          marginTop: 6,
          marginLeft: '30%',
          marginRight: '30%',
          height: 2,
          borderRadius: 1,
          background: 'transparent',
          position: 'relative',
          cursor: 'pointer',
          touchAction: 'none',
        }}
      >
        <div
          ref={thumbRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: SMALL_H,
            borderRadius: 1,
            background: 'var(--hot-pink)',
            opacity: 0.4,
            width: SMALL_W,
            cursor: 'grab',
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  );
}
