import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listFreelancerCompletedJobsWithClientReviews } from "../api";
import { EmptyState } from "../../../components/common/EmptyState";

function formatStars(value) {
  const safe = Math.max(0, Math.min(5, Number(value || 0)));
  return `${"\u2605".repeat(safe)}${"\u2606".repeat(5 - safe)}`;
}

function formatPersonName(person) {
  if (!person) return "Client";
  return [person.firstname, person.middlename, person.surname, person.suffix].filter(Boolean).join(" ");
}

export function FreelancerReviewsPage() {
  const { user } = useAuth();

  const reviewsQuery = useQuery({
    queryKey: ["freelancer-completed-job-reviews", user?.id],
    queryFn: () => listFreelancerCompletedJobsWithClientReviews(user.id),
    enabled: !!user?.id
  });

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Freelancer Ratings</h2>
        <Link className="btn btn-secondary" to="/profile">
          Back to Profile
        </Link>
      </div>

      {reviewsQuery.isError ? <p className="feedback error">{reviewsQuery.error.message}</p> : null}

      {!reviewsQuery.isLoading && (reviewsQuery.data || []).length === 0 ? (
        <EmptyState title="No completed jobs yet" description="Completed jobs with client feedback will appear here." />
      ) : null}

      <div className="stack">
        {(reviewsQuery.data || []).map((item) => (
          <article key={item.job.id} className="card job-review-panel">
            <div className="job-review-head">
              <h4>{item.job.title || "Job Post"}</h4>
            </div>

            {item.review ? (
              <div className="job-review-item compact">
                <p className="job-review-meta">
                  Rated by client: <strong>{formatPersonName(item.review.reviewer)}</strong>
                </p>
                <p className="job-review-stars-only">
                  {formatStars(item.review.stars)} <span>{item.review.stars}/5</span>
                </p>
                <p className="job-review-comment">{item.review.comment || "No comment provided."}</p>
              </div>
            ) : (
              <p className="muted">No client rating/comment yet for this completed job.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
