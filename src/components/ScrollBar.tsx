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

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      const { scrollWidth, clientWidth, scrollLeft } = el;
      if (scrollWidth <= clientWidth + 2) {
        track.style.opacity = '0';
        return;
      }

      // Show on scroll, fade out after idle
      track.style.opacity = '1';
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => { track.style.opacity = '0.3'; }, 1200);

      const trackWidth = track.clientWidth;
      const tw = 28;
      const maxScroll = scrollWidth - clientWidth;
      const maxThumbLeft = trackWidth - tw;
      const left = maxScroll > 0 ? (scrollLeft / maxScroll) * maxThumbLeft : 0;

      thumb.style.width = `${tw}px`;
      thumb.style.transform = `translateX(${left}px)`;
    };

    update();
    // Start faded
    track.style.opacity = '0.3';

    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
      if (fadeTimer) clearTimeout(fadeTimer);
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
          margin: '4px 20px 0',
          height: 2,
          borderRadius: 1,
          position: 'relative',
          opacity: 0.3,
          transition: 'opacity 0.4s',
          pointerEvents: 'none',
        }}
      >
        <div
          ref={thumbRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: 2,
            borderRadius: 1,
            background: 'var(--hot-pink)',
            width: 24,
          }}
        />
      </div>
    </div>
  );
}
