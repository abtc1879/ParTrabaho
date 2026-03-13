import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listClientCompletedJobsWithFreelancerReviews } from "../api";
import { EmptyState } from "../../../components/common/EmptyState";

function formatStars(value) {
  const safe = Math.max(0, Math.min(5, Number(value || 0)));
  return `${"\u2605".repeat(safe)}${"\u2606".repeat(5 - safe)}`;
}

function formatPersonName(person) {
  if (!person) return "Freelancer";
  return [person.firstname, person.middlename, person.surname, person.suffix].filter(Boolean).join(" ");
}

export function ClientReviewsPage() {
  const { user } = useAuth();

  const reviewsQuery = useQuery({
    queryKey: ["client-completed-job-reviews", user?.id],
    queryFn: () => listClientCompletedJobsWithFreelancerReviews(user.id),
    enabled: !!user?.id
  });

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Client Ratings</h2>
        <Link className="btn btn-secondary" to="/profile">
          Back to Profile
        </Link>
      </div>

      {reviewsQuery.isError ? <p className="feedback error">{reviewsQuery.error.message}</p> : null}

      {!reviewsQuery.isLoading && (reviewsQuery.data || []).length === 0 ? (
        <EmptyState title="No completed posted jobs yet" description="Completed posted jobs with freelancer feedback will appear here." />
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
                  Rated by freelancer: <strong>{formatPersonName(item.review.reviewer)}</strong>
                </p>
                <p className="job-review-stars-only">
                  {formatStars(item.review.stars)} <span>{item.review.stars}/5</span>
                </p>
                <p className="job-review-comment">{item.review.comment || "No comment provided."}</p>
              </div>
            ) : (
              <p className="muted">No freelancer rating/comment yet for this completed job.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
