import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { getProfileById, listRentalReviewsByOwner } from "../api";
import { EmptyState } from "../../../components/common/EmptyState";

function formatStars(value) {
  const safe = Math.max(0, Math.min(5, Number(value || 0)));
  return `${"\u2605".repeat(safe)}${"\u2606".repeat(5 - safe)}`;
}

function formatPersonName(person) {
  if (!person) return "Renter";
  return [person.firstname, person.middlename, person.surname, person.suffix].filter(Boolean).join(" ");
}

export function RentalReviewsPage() {
  const { user } = useAuth();
  const { profileId } = useParams();
  const resolvedOwnerId = profileId || user?.id || "";
  const canLoad = !!resolvedOwnerId;

  const reviewsQuery = useQuery({
    queryKey: ["rental-reviews", resolvedOwnerId],
    queryFn: () => listRentalReviewsByOwner(resolvedOwnerId),
    enabled: canLoad
  });

  const profileQuery = useQuery({
    queryKey: ["rental-review-profile", resolvedOwnerId],
    queryFn: () => getProfileById(resolvedOwnerId),
    enabled: canLoad
  });

  const ownerName = profileQuery.data
    ? [profileQuery.data.firstname, profileQuery.data.middlename, profileQuery.data.surname, profileQuery.data.suffix]
        .filter(Boolean)
        .join(" ")
    : "Owner";

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Rental Ratings</h2>
        <Link className="btn btn-secondary" to={profileId ? `/profiles/${profileId}` : "/profile"}>
          Back to Profile
        </Link>
      </div>

      {reviewsQuery.isError ? <p className="feedback error">{reviewsQuery.error.message}</p> : null}

      {!reviewsQuery.isLoading && reviewsQuery.data?.length ? (
        <p className="muted">Showing renter reviews for {ownerName}.</p>
      ) : null}

      {!reviewsQuery.isLoading && (reviewsQuery.data || []).length === 0 ? (
        <EmptyState title="No rental reviews yet" description="Renter feedback will appear here after completed rentals." />
      ) : null}

      <div className="stack">
        {(reviewsQuery.data || []).map((review) => (
          <article key={review.id} className="card job-review-panel">
            <div className="job-review-head">
              <div>
                <h4>{review.rental?.title || "Rental Listing"}</h4>
                <p className="muted">
                  {review.rental?.category ? `Category: ${review.rental.category}` : "Category not provided"}
                  {review.rental?.location ? ` • ${review.rental.location}` : ""}
                </p>
              </div>
              <p className="muted">{new Date(review.created_at).toLocaleString()}</p>
            </div>

            <div className="job-review-item compact">
              <p className="job-review-meta">
                Rated by renter: <strong>{formatPersonName(review.reviewer)}</strong>
              </p>
              <p className="job-review-stars-only">
                {formatStars(review.stars)} <span>{review.stars}/5</span>
              </p>
              <p className="job-review-comment">{review.comment || "No comment provided."}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
