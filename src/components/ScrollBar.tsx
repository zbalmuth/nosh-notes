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
      const tw = Math.max(30, Math.min(ratio * trackWidth, trackWidth * 0.35));
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

    const jumpToPosition = (clientX: number) => {
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
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      dragStartX = clientX;
      dragStartScroll = el.scrollLeft;
      thumb.style.cursor = 'grabbing';
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
      thumb.style.cursor = 'grab';
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
          marginTop: 8,
          marginLeft: 20,
          marginRight: 20,
          height: 3,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.08)',
          position: 'relative',
          cursor: 'pointer',
          touchAction: 'none',
        }}
      >
        <div
          ref={thumbRef}
          style={{
            position: 'absolute',
            top: -3,
            left: 0,
            height: 9,
            borderRadius: 5,
            background: 'var(--hot-pink)',
            opacity: 0.6,
            width: 30,
            cursor: 'grab',
            touchAction: 'none',
          }}
        />
      </div>
    </div>
  );
}
