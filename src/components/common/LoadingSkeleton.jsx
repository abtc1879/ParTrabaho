export function LoadingSkeleton({ lines = 3 }) {
  return (
    <div className="card">
      {Array.from({ length: lines }).map((_, index) => (
        <div className="skeleton-line" key={index} />
      ))}
    </div>
  );
}
