interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ScrollBar({ children, className, style }: Props) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <div className={className} style={{ padding: 0, gap: 8 }}>
        {children}
      </div>
      <div style={{ paddingTop: 6, paddingLeft: 20 }}>
        <div style={{
          width: 24,
          height: 3,
          borderRadius: 2,
          background: 'var(--text-muted)',
          opacity: 0.4,
        }} />
      </div>
    </div>
  );
}
