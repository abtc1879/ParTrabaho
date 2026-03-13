import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { getProfileById, listAccommodationReviewsByOwner } from "../api";
import { EmptyState } from "../../../components/common/EmptyState";

function formatStars(value) {
  const safe = Math.max(0, Math.min(5, Number(value || 0)));
  return `${"\u2605".repeat(safe)}${"\u2606".repeat(5 - safe)}`;
}

function formatPersonName(person) {
  if (!person) return "Guest";
  return [person.firstname, person.middlename, person.surname, person.suffix].filter(Boolean).join(" ");
}

function formatAccommodationPrice(accommodation) {
  const minValue = Number(accommodation?.price_min_php ?? accommodation?.price_php ?? 0);
  const maxValue = Number(accommodation?.price_max_php ?? accommodation?.price_php ?? 0);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return "PHP 0";
  if (minValue === maxValue) return `PHP ${minValue.toLocaleString()}`;
  return `PHP ${minValue.toLocaleString()} - ${maxValue.toLocaleString()}`;
}

export function AccommodationReviewsPage() {
  const { user } = useAuth();
  const { profileId } = useParams();
  const resolvedOwnerId = profileId || user?.id || "";
  const canLoad = !!resolvedOwnerId;

  const reviewsQuery = useQuery({
    queryKey: ["accommodation-reviews", resolvedOwnerId],
    queryFn: () => listAccommodationReviewsByOwner(resolvedOwnerId),
    enabled: canLoad
  });

  const profileQuery = useQuery({
    queryKey: ["accommodation-review-profile", resolvedOwnerId],
    queryFn: () => getProfileById(resolvedOwnerId),
    enabled: canLoad
  });

  const ownerName = profileQuery.data
    ? [profileQuery.data.firstname, profileQuery.data.middlename, profileQuery.data.surname, profileQuery.data.suffix]
        .filter(Boolean)
        .join(" ")
    : "Host";

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Accommodation Ratings</h2>
        <Link className="btn btn-secondary" to={profileId ? `/profiles/${profileId}` : "/profile"}>
          Back to Profile
        </Link>
      </div>

      {reviewsQuery.isError ? <p className="feedback error">{reviewsQuery.error.message}</p> : null}

      {!reviewsQuery.isLoading && reviewsQuery.data?.length ? (
        <p className="muted">Showing guest reviews for {ownerName}.</p>
      ) : null}

      {!reviewsQuery.isLoading && (reviewsQuery.data || []).length === 0 ? (
        <EmptyState
          title="No accommodation reviews yet"
          description="Guest feedback will appear here after completed stays."
        />
      ) : null}

      <div className="stack">
        {(reviewsQuery.data || []).map((review) => (
          <article key={review.id} className="card job-review-panel">
            <div className="job-review-head">
              <div>
                <h4>{review.accommodation?.title || "Accommodation Listing"}</h4>
                <p className="muted">
                  {review.accommodation?.category ? `Category: ${review.accommodation.category}` : "Category not provided"}
                  {review.accommodation?.location ? ` • ${review.accommodation.location}` : ""}
                </p>
                {review.accommodation ? (
                  <p className="muted">Price: {formatAccommodationPrice(review.accommodation)}</p>
                ) : null}
              </div>
              <p className="muted">{new Date(review.created_at).toLocaleString()}</p>
            </div>

            <div className="job-review-item compact">
              <p className="job-review-meta">
                Rated by guest: <strong>{formatPersonName(review.reviewer)}</strong>
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
