export function EmptyState({ title, description }) {
  return (
    <div className="card empty-state">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
    </div>
  );
}
