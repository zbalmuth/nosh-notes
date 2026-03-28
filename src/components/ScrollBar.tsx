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
      if (scrollWidth <= clientWidth) {
        track.style.display = 'none';
        return;
      }
      track.style.display = 'block';

      const trackWidth = track.clientWidth;
      const ratio = clientWidth / scrollWidth;
      const tw = Math.max(20, ratio * trackWidth);
      const maxScroll = scrollWidth - clientWidth;
      const maxThumbLeft = trackWidth - tw;
      const left = maxScroll > 0 ? (scrollLeft / maxScroll) * maxThumbLeft : 0;

      thumb.style.width = `${tw}px`;
      thumb.style.transform = `translateX(${left}px)`;
    };

    update();
    el.addEventListener('scroll', update);
    const observer = new ResizeObserver(update);
    observer.observe(el);

    // Track click to jump
    const onTrackClick = (e: MouseEvent) => {
      const rect = track.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const trackWidth = track.clientWidth;
      const { scrollWidth, clientWidth } = el;
      const maxScroll = scrollWidth - clientWidth;
      el.scrollTo({ left: (clickX / trackWidth) * maxScroll, behavior: 'smooth' });
    };
    track.addEventListener('click', onTrackClick);

    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
      track.removeEventListener('click', onTrackClick);
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
          height: 4,
          borderRadius: 2,
          background: 'var(--border)',
          opacity: 0.3,
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <div
          ref={thumbRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: 4,
            borderRadius: 2,
            background: 'var(--text-muted)',
            opacity: 0.8,
            width: 20,
          }}
        />
      </div>
    </div>
  );
}
