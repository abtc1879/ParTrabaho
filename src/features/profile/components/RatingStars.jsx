export function RatingStars({ value = 0 }) {
  const rounded = Math.round(value);
  return (
    <div className="rating-stars" aria-label={`Rating ${value}`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={index < rounded ? "filled" : ""}>
          *
        </span>
      ))}
      <small>{Number(value).toFixed(1)}</small>
    </div>
  );
}
