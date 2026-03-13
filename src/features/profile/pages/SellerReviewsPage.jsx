import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { getProfileById, listSellerMarketplaceReviews } from "../api";
import { EmptyState } from "../../../components/common/EmptyState";

function formatStars(value) {
  const safe = Math.max(0, Math.min(5, Number(value || 0)));
  return `${"\u2605".repeat(safe)}${"\u2606".repeat(5 - safe)}`;
}

function formatPersonName(person) {
  if (!person) return "Buyer";
  return [person.firstname, person.middlename, person.surname, person.suffix].filter(Boolean).join(" ");
}

export function SellerReviewsPage() {
  const { user } = useAuth();
  const { profileId } = useParams();
  const resolvedSellerId = profileId || user?.id || "";
  const canLoad = !!resolvedSellerId;

  const reviewsQuery = useQuery({
    queryKey: ["seller-marketplace-reviews", resolvedSellerId],
    queryFn: () => listSellerMarketplaceReviews(resolvedSellerId),
    enabled: canLoad
  });

  const profileQuery = useQuery({
    queryKey: ["seller-profile", resolvedSellerId],
    queryFn: () => getProfileById(resolvedSellerId),
    enabled: canLoad
  });

  const sellerName = profileQuery.data
    ? [profileQuery.data.firstname, profileQuery.data.middlename, profileQuery.data.surname, profileQuery.data.suffix]
        .filter(Boolean)
        .join(" ")
    : "Seller";

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Seller Ratings</h2>
        <Link className="btn btn-secondary" to={profileId ? `/profiles/${profileId}` : "/profile"}>
          Back to Profile
        </Link>
      </div>

      {reviewsQuery.isError ? <p className="feedback error">{reviewsQuery.error.message}</p> : null}

      {!reviewsQuery.isLoading && reviewsQuery.data?.length ? (
        <p className="muted">Showing buyer reviews for {sellerName}.</p>
      ) : null}

      {!reviewsQuery.isLoading && (reviewsQuery.data || []).length === 0 ? (
        <EmptyState title="No marketplace reviews yet" description="Buyer feedback will appear here after completed sales." />
      ) : null}

      <div className="stack">
        {(reviewsQuery.data || []).map((review) => (
          <article key={review.id} className="card job-review-panel">
            <div className="job-review-head">
              <div>
                <h4>{review.product?.name || "Marketplace Item"}</h4>
                <p className="muted">
                  {review.product?.category ? `Category: ${review.product.category}` : "Category not provided"}
                </p>
              </div>
              <p className="muted">{new Date(review.created_at).toLocaleString()}</p>
            </div>

            <div className="job-review-item compact">
              <p className="job-review-meta">
                Rated by buyer: <strong>{formatPersonName(review.buyer)}</strong>
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
