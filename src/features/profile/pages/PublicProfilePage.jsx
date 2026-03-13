import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProfileById } from "../api";
import { ProfileCard } from "../components/ProfileCard";
import { ProfilePhotoAlbum } from "../components/ProfilePhotoAlbum";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

export function PublicProfilePage() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const isValidProfileId = isUuid(profileId);

  const profileQuery = useQuery({
    queryKey: ["public-profile", profileId],
    queryFn: () => getProfileById(profileId),
    enabled: isValidProfileId
  });

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Applicant Profile</h2>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
              return;
            }
            navigate("/notifications");
          }}
        >
          Back
        </button>
      </div>
      {!isValidProfileId ? <p className="feedback error">Invalid applicant profile link. Please open it again from Notifications.</p> : null}
      {profileQuery.isLoading ? <p className="muted">Loading profile...</p> : null}
      {profileQuery.isError ? <p className="feedback error">{profileQuery.error.message}</p> : null}
      {!profileQuery.isLoading && !profileQuery.isError && isValidProfileId && !profileQuery.data ? (
        <p className="feedback error">Applicant profile not found.</p>
      ) : null}
      {profileQuery.data ? (
        <ProfileCard
          profile={profileQuery.data}
          sellerReviewsPath={`/profiles/${profileId}/seller-reviews`}
          rentalReviewsPath={`/profiles/${profileId}/rental-reviews`}
          accommodationReviewsPath={`/profiles/${profileId}/accommodation-reviews`}
        />
      ) : null}
      {profileQuery.data ? <ProfilePhotoAlbum userId={profileId} /> : null}
    </section>
  );
}
