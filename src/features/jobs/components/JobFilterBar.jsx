export function JobFilterBar({ filters, onChange, onSubmit }) {
  return (
    <form className="card filter-bar" onSubmit={onSubmit}>
      <label>
        Location
        <input
          value={filters.location}
          onChange={(event) => onChange({ ...filters, location: event.target.value })}
          placeholder="e.g. Quezon City"
        />
      </label>
      <label>
        Expertise / Skill
        <input
          value={filters.skill}
          onChange={(event) => onChange({ ...filters, skill: event.target.value })}
          placeholder="e.g. Plumbing"
        />
      </label>
      <button className="btn btn-secondary" type="submit">
        Apply Filters
      </button>
    </form>
  );
}
