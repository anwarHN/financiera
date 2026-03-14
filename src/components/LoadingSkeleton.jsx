function LoadingSkeleton({ lines = 4, compact = false, className = "" }) {
  return (
    <div className={`loading-skeleton ${compact ? "loading-skeleton-compact" : ""} ${className}`.trim()} aria-hidden="true">
      <div className="loading-skeleton-header" />
      <div className="loading-skeleton-card">
        {Array.from({ length: lines }).map((_, index) => (
          <span key={index} className="loading-skeleton-line" />
        ))}
      </div>
    </div>
  );
}

export default LoadingSkeleton;
