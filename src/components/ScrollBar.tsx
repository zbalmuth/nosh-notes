import { useRef, useEffect } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ScrollBar({ children, className, style }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!el || !thumb || !track) return;

    const update = () => {
      const { scrollWidth, clientWidth, scrollLeft } = el;
      if (scrollWidth <= clientWidth + 2) {
        track.style.display = 'none';
        return;
      }
      track.style.display = 'block';

      const trackWidth = track.clientWidth;
      const ratio = clientWidth / scrollWidth;
      // Cap thumb between 20px and 40% of track
      const tw = Math.max(20, Math.min(ratio * trackWidth, trackWidth * 0.4));
      const maxScroll = scrollWidth - clientWidth;
      const maxThumbLeft = trackWidth - tw;
      const left = maxScroll > 0 ? (scrollLeft / maxScroll) * maxThumbLeft : 0;

      thumb.style.width = `${tw}px`;
      thumb.style.transform = `translateX(${left}px)`;
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);

    // Click/tap on track to jump
    const jumpToPosition = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const trackWidth = track.clientWidth;
      const { scrollWidth, clientWidth: cw } = el;
      const maxScroll = scrollWidth - cw;
      el.scrollTo({ left: (clickX / trackWidth) * maxScroll, behavior: 'smooth' });
    };

    const onTrackClick = (e: MouseEvent) => {
      // Don't handle if it was a drag
      if (e.target === thumb) return;
      jumpToPosition(e.clientX);
    };

    const onTrackTouch = (e: TouchEvent) => {
      e.preventDefault();
      jumpToPosition(e.touches[0].clientX);
    };

    track.addEventListener('click', onTrackClick);
    track.addEventListener('touchstart', onTrackTouch, { passive: false });

    // Drag the thumb
    let dragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;

    const onThumbDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
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
      const tw = thumb.clientWidth;
      const maxThumbLeft = trackWidth - tw;
      const { scrollWidth, clientWidth: cw } = el;
      const maxScroll = scrollWidth - cw;
      const scrollDelta = maxThumbLeft > 0 ? (deltaX / maxThumbLeft) * maxScroll : 0;
      el.scrollLeft = dragStartScroll + scrollDelta;
    };

    const onDragEnd = () => {
      dragging = false;
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
    };

    thumb.addEventListener('mousedown', onThumbDown);
    thumb.addEventListener('touchstart', onThumbDown, { passive: false });

    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
      track.removeEventListener('click', onTrackClick);
      track.removeEventListener('touchstart', onTrackTouch);
      thumb.removeEventListener('mousedown', onThumbDown);
      thumb.removeEventListener('touchstart', onThumbDown);
      onDragEnd();
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
          marginLeft: 20,
          marginRight: 20,
          height: 6,
          borderRadius: 3,
          background: 'var(--border)',
          opacity: 0.3,
          position: 'relative',
          cursor: 'pointer',
          touchAction: 'none',
        }}
      >
        <div
          ref={thumbRef}
          style={{
            position: 'absolute',
            top: -2,
            left: 0,
            height: 10,
            borderRadius: 5,
            background: 'var(--text-muted)',
            opacity: 0.8,
            width: 20,
            cursor: 'grab',
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  );
}
