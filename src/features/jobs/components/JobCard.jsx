import { Link } from "react-router-dom";

function getClientName(profile) {
  if (!profile) return "Client";
  const name = [profile.firstname, profile.surname].filter(Boolean).join(" ").trim();
  return name || "Client";
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "CL";
}

function readCompletion(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function JobCard({ job, showDeleteCompleted = false, onDeleteCompleted, deleting = false, onPrefetch }) {
  const clientProfile = job.client_profile;
  const clientName = getClientName(clientProfile);
  const clientProfileLink = clientProfile?.id ? `/profiles/${clientProfile.id}` : "";
  const completion = readCompletion(job.completion);
  const finishedAt = completion?.completed_at ? new Date(completion.completed_at).toLocaleString() : "";

  return (
    <article className="card job-card">
      <div className="job-card-head">
        <span className="job-skill">{job.required_skill}</span>
        <span className={`pill ${job.status}`}>{job.status}</span>
      </div>

      <div className="job-poster">
        {clientProfileLink ? (
          <Link
            className="job-poster-avatar-link"
            to={clientProfileLink}
            aria-label={`View ${clientName} profile`}
            onMouseEnter={onPrefetch}
            onFocus={onPrefetch}
          >
            {clientProfile?.avatar_url ? (
              <img className="job-poster-avatar" src={clientProfile.avatar_url} alt={clientName} />
            ) : (
              <span className="job-poster-avatar-fallback">{getInitials(clientName)}</span>
            )}
          </Link>
        ) : clientProfile?.avatar_url ? (
          <img className="job-poster-avatar" src={clientProfile.avatar_url} alt={clientName} />
        ) : (
          <span className="job-poster-avatar-fallback">{getInitials(clientName)}</span>
        )}

        <div className="job-poster-text">
          <p className="job-poster-label">Posted by</p>
          {clientProfileLink ? (
            <Link className="job-poster-name" to={clientProfileLink} onMouseEnter={onPrefetch} onFocus={onPrefetch}>
              {clientName}
            </Link>
          ) : (
            <p className="job-poster-name">{clientName}</p>
          )}
        </div>
      </div>

      <h3>{job.title}</h3>
      <p className="muted job-description">{job.description}</p>
      {job.status === "completed" ? <p className="job-finished-at">Finished: {finishedAt || "Date/time not available"}</p> : null}

      <div className="job-detail-grid">
        <div className="job-detail-item">
          <span className="job-detail-label">Category</span>
          <span className="job-detail-value">{job.category || "General"}</span>
        </div>
        <div className="job-detail-item">
          <span className="job-detail-label">Skill</span>
          <span className="job-detail-value">{job.required_skill}</span>
        </div>
        <div className="job-detail-item">
          <span className="job-detail-label">Location</span>
          <span className="job-detail-value">{job.location}</span>
        </div>
        <div className="job-detail-item salary">
          <span className="job-detail-label">Salary</span>
          <span className="job-detail-value">PHP {Number(job.salary_php || 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="job-footer">
        <Link className="btn btn-primary" to={`/jobs/${job.id}`} onMouseEnter={onPrefetch} onFocus={onPrefetch}>
          View Details
        </Link>
        {showDeleteCompleted ? (
          <button className="btn btn-danger" type="button" onClick={onDeleteCompleted} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete Completed Job"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
