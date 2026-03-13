import { Link } from "react-router-dom";
import { RatingStars } from "./RatingStars";
import { formatAddress } from "../utils";

function formatRegistrationDuration(createdAt) {
  if (!createdAt) return "Recently joined";

  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return "Joined today";
  if (diffDays === 1) return "Member for 1 day";
  if (diffDays < 30) return `Member for ${diffDays} days`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "Member for 1 month";
  if (diffMonths < 12) return `Member for ${diffMonths} months`;

  const diffYears = Math.floor(diffMonths / 12);
  if (diffYears === 1) return "Member for 1 year";
  return `Member for ${diffYears} years`;
}

export function ProfileCard({
  profile,
  sellerReviewsPath = "",
  rentalReviewsPath = "",
  accommodationReviewsPath = ""
}) {
  const fullName = [profile.firstname, profile.middlename, profile.surname, profile.suffix]
    .filter(Boolean)
    .join(" ");
  const expertise = Array.isArray(profile.expertise) ? profile.expertise.filter(Boolean) : [];
  const freelancerReviews = Number(profile.freelancer_rating_count || 0);
  const clientReviews = Number(profile.client_rating_count || 0);
  const sellerReviews = Number(profile.seller_rating_count || 0);
  const rentalReviews = Number(profile.rental_rating_count || 0);
  const accommodationReviews = Number(profile.accommodation_rating_count || 0);

  return (
    <article className="card profile-card">
      <div className="profile-summary">
        <div className="profile-avatar-wrap">
          <img
            className="avatar profile-avatar"
            src={profile.avatar_url || "https://placehold.co/96x96"}
            alt={fullName || "Profile"}
          />
        </div>

        <div className="profile-main">
          <p className="profile-kicker">Professional Profile</p>
          <h2>{fullName || "Unnamed User"}</h2>
          <p className="muted" style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            {formatRegistrationDuration(profile.created_at)}
          </p>
          <p className="address-text">
            <strong>Address:</strong> {formatAddress(profile, "No address provided")}
          </p>

          <div className="profile-expertise">
            <p className="profile-section-label">Expertise</p>
            {expertise.length > 0 ? (
              <div className="profile-chip-list">
                {expertise.map((skill) => (
                  <span className="profile-chip" key={skill}>
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">No expertise listed yet.</p>
            )}
          </div>

          <div className="profile-overall-rating">
            <p className="profile-section-label">Overall Rating</p>
            <RatingStars value={profile.rating_avg || 0} />
          </div>
        </div>
      </div>

      <div className="profile-role-ratings">
        {freelancerReviews > 0 ? (
          <Link className="profile-rating-link" to="/freelancer-reviews" aria-label="View completed jobs with client ratings and comments">
            <strong>Freelancer Rating</strong>
            <RatingStars value={profile.freelancer_rating_avg || 0} />
            <small>{profile.freelancer_rating_count || 0} review(s)</small>
          </Link>
        ) : null}
        {clientReviews > 0 ? (
          <Link className="profile-rating-link" to="/client-reviews" aria-label="View completed posted jobs with freelancer ratings and comments">
            <strong>Client Rating</strong>
            <RatingStars value={profile.client_rating_avg || 0} />
            <small>{profile.client_rating_count || 0} review(s)</small>
          </Link>
        ) : null}
        {sellerReviews > 0 ? (
          sellerReviewsPath ? (
            <Link
              className="profile-rating-link"
              to={sellerReviewsPath}
              aria-label="View marketplace reviews from buyers"
            >
              <strong>Seller Rating</strong>
              <RatingStars value={profile.seller_rating_avg || 0} />
              <small>{profile.seller_rating_count || 0} review(s)</small>
            </Link>
          ) : (
            <div className="profile-rating-link" role="group" aria-label="Seller rating from marketplace">
              <strong>Seller Rating</strong>
              <RatingStars value={profile.seller_rating_avg || 0} />
              <small>{profile.seller_rating_count || 0} review(s)</small>
            </div>
          )
        ) : null}
        {rentalReviews > 0 ? (
          rentalReviewsPath ? (
            <Link className="profile-rating-link" to={rentalReviewsPath} aria-label="View rental reviews from renters">
              <strong>Rental Rating</strong>
              <RatingStars value={profile.rental_rating_avg || 0} />
              <small>{profile.rental_rating_count || 0} review(s)</small>
            </Link>
          ) : (
            <div className="profile-rating-link" role="group" aria-label="Rental rating from renters">
              <strong>Rental Rating</strong>
              <RatingStars value={profile.rental_rating_avg || 0} />
              <small>{profile.rental_rating_count || 0} review(s)</small>
            </div>
          )
        ) : null}
        {accommodationReviews > 0 ? (
          accommodationReviewsPath ? (
            <Link
              className="profile-rating-link"
              to={accommodationReviewsPath}
              aria-label="View accommodation reviews from guests"
            >
              <strong>Accommodation Rating</strong>
              <RatingStars value={profile.accommodation_rating_avg || 0} />
              <small>{profile.accommodation_rating_count || 0} review(s)</small>
            </Link>
          ) : (
            <div className="profile-rating-link" role="group" aria-label="Accommodation rating from guests">
              <strong>Accommodation Rating</strong>
              <RatingStars value={profile.accommodation_rating_avg || 0} />
              <small>{profile.accommodation_rating_count || 0} review(s)</small>
            </div>
          )
        ) : null}
      </div>
      <div className="profile-stats">
        <div className="profile-stat-card">
          <strong>{profile.jobs_completed_count || 0}</strong>
          <small>Jobs Completed (Freelancer)</small>
        </div>
        <div className="profile-stat-card">
          <strong>{profile.jobs_posted_count || 0}</strong>
          <small>Jobs Posted</small>
        </div>
      </div>
    </article>
  );
}
