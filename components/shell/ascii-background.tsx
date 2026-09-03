export function AsciiBackground({ className = "" }: { className?: string }) {
  return (
    <div className={className ? `app-ascii-bg ${className}` : "app-ascii-bg"} aria-hidden>
      <span />
      <span />
    </div>
  );
}
