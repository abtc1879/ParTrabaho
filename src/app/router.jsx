import { Navigate, Outlet, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { SignupPage } from "../features/auth/pages/SignupPage";
import { ResetPasswordPage } from "../features/auth/pages/ResetPasswordPage";
import { CompleteProfilePage } from "../features/auth/pages/CompleteProfilePage";
import { HomePage } from "../features/jobs/pages/HomePage";
import { MarketplacePage } from "../features/marketplace/pages/MarketplacePage";
import { RentalsPage } from "../features/rentals/pages/RentalsPage";
import { AccommodationPage } from "../features/accommodation/pages/AccommodationPage";
import { PostJobPage } from "../features/jobs/pages/PostJobPage";
import { JobDetailsPage } from "../features/jobs/pages/JobDetailsPage";
import { EditJobPage } from "../features/jobs/pages/EditJobPage";
import { MyJobsPage } from "../features/jobs/pages/MyJobsPage";
import { NotificationsPage } from "../features/notifications/pages/NotificationsPage";
import { ChatListPage } from "../features/chat/pages/ChatListPage";
import { ChatRoomPage } from "../features/chat/pages/ChatRoomPage";
import { ProfilePage } from "../features/profile/pages/ProfilePage";
import { PublicProfilePage } from "../features/profile/pages/PublicProfilePage";
import { FreelancerReviewsPage } from "../features/profile/pages/FreelancerReviewsPage";
import { ClientReviewsPage } from "../features/profile/pages/ClientReviewsPage";
import { SellerReviewsPage } from "../features/profile/pages/SellerReviewsPage";
import { RentalReviewsPage } from "../features/profile/pages/RentalReviewsPage";
import { AccommodationReviewsPage } from "../features/profile/pages/AccommodationReviewsPage";
import { FindPersonPage } from "../features/profile/pages/FindPersonPage";
import { AccountSupportPage } from "../features/profile/pages/AccountSupportPage";
import { AccountSecurityPage } from "../features/profile/pages/AccountSecurityPage";
import { AdminModerationPage } from "../features/admin/pages/AdminModerationPage";

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <section className="page">Loading...</section>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <section className="page">Loading...</section>;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <section className="page">Loading...</section>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter(
  [
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <PublicOnly />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> }
    ]
  },
  {
    element: <RequireAuth />,
    children: [
      { path: "/complete-profile", element: <CompleteProfilePage /> },
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "marketplace", element: <MarketplacePage /> },
          { path: "rentals", element: <RentalsPage /> },
          { path: "accommodation", element: <AccommodationPage /> },
          { path: "jobs/new", element: <PostJobPage /> },
          { path: "jobs/:jobId", element: <JobDetailsPage /> },
          { path: "jobs/:jobId/edit", element: <EditJobPage /> },
          { path: "my-jobs", element: <MyJobsPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "find-person", element: <FindPersonPage /> },
          { path: "chat", element: <ChatListPage /> },
          { path: "chat/:conversationId", element: <ChatRoomPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "account-security", element: <AccountSecurityPage /> },
          { path: "account-support", element: <AccountSupportPage /> },
          { path: "freelancer-reviews", element: <FreelancerReviewsPage /> },
          { path: "client-reviews", element: <ClientReviewsPage /> },
          { path: "seller-reviews", element: <SellerReviewsPage /> },
          { path: "rental-reviews", element: <RentalReviewsPage /> },
          { path: "accommodation-reviews", element: <AccommodationReviewsPage /> },
          { path: "profiles/:profileId/seller-reviews", element: <SellerReviewsPage /> },
          { path: "profiles/:profileId/rental-reviews", element: <RentalReviewsPage /> },
          { path: "profiles/:profileId/accommodation-reviews", element: <AccommodationReviewsPage /> },
          { path: "profiles/:profileId", element: <PublicProfilePage /> },
          {
            element: <RequireAdmin />,
            children: [{ path: "admin", element: <AdminModerationPage /> }]
          }
        ]
      }
    ]
  },
    { path: "*", element: <Navigate to="/" replace /> }
  ],
  { basename: "/ParTrabaho" }
);
