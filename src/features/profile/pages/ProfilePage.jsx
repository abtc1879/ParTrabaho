import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProfileById } from "../api";
import { useAuth } from "../../auth/AuthContext";
import { ProfileCard } from "../components/ProfileCard";
import { ProfilePhotoAlbum } from "../components/ProfilePhotoAlbum";
import { signOut } from "../../auth/api";

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, isAdmin, isRestricted, restrictionMessage } = useAuth();
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => getProfileById(user.id),
    enabled: !!user?.id
  });

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <section className="page profile-page">
      <div className="profile-page-head">
        <h2>Profile</h2>
        <p className="muted">Keep your details updated to build trust with clients and freelancers.</p>
      </div>

      {isRestricted ? <p className="feedback error">{restrictionMessage}</p> : null}
      {profileQuery.isError ? <p className="feedback error">{profileQuery.error.message}</p> : null}
      {profileQuery.data ? (
        <ProfileCard
          profile={profileQuery.data}
          sellerReviewsPath={`/profiles/${profileQuery.data.id}/seller-reviews`}
          rentalReviewsPath={`/profiles/${profileQuery.data.id}/rental-reviews`}
          accommodationReviewsPath={`/profiles/${profileQuery.data.id}/accommodation-reviews`}
        />
      ) : null}
      {user?.id ? <ProfilePhotoAlbum userId={user.id} isOwner canUpload={!isRestricted} /> : null}

      <div className="card profile-actions-card">
        <p className="profile-actions-title">Account Actions</p>
        <div className="profile-actions-grid">
          <Link className="btn btn-secondary" to="/complete-profile">
            Edit Profile
          </Link>
          <Link className="btn btn-secondary" to="/my-jobs">
            My Jobs
          </Link>
          <Link className="btn btn-secondary" to="/account-support">
            Account Support
          </Link>
          {isAdmin ? (
            <Link className="btn btn-secondary" to="/admin">
              Admin Panel
            </Link>
          ) : null}
          <button className="btn btn-danger" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
    </section>
  );
}
