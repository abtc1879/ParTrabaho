import { Suspense, lazy } from "react";
import { Navigate, Outlet, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { useAuth } from "../features/auth/AuthContext";

const LoginPage = lazy(() => import("../features/auth/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import("../features/auth/pages/SignupPage").then((m) => ({ default: m.SignupPage })));
const ResetPasswordPage = lazy(() => import("../features/auth/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const CompleteProfilePage = lazy(() => import("../features/auth/pages/CompleteProfilePage").then((m) => ({ default: m.CompleteProfilePage })));

const HomePage = lazy(() => import("../features/jobs/pages/HomePage").then((m) => ({ default: m.HomePage })));
const MarketplacePage = lazy(() => import("../features/marketplace/pages/MarketplacePage").then((m) => ({ default: m.MarketplacePage })));
const RentalsPage = lazy(() => import("../features/rentals/pages/RentalsPage").then((m) => ({ default: m.RentalsPage })));
const AccommodationPage = lazy(() => import("../features/accommodation/pages/AccommodationPage").then((m) => ({ default: m.AccommodationPage })));
const PostJobPage = lazy(() => import("../features/jobs/pages/PostJobPage").then((m) => ({ default: m.PostJobPage })));
const JobDetailsPage = lazy(() => import("../features/jobs/pages/JobDetailsPage").then((m) => ({ default: m.JobDetailsPage })));
const EditJobPage = lazy(() => import("../features/jobs/pages/EditJobPage").then((m) => ({ default: m.EditJobPage })));
const MyJobsPage = lazy(() => import("../features/jobs/pages/MyJobsPage").then((m) => ({ default: m.MyJobsPage })));
const NotificationsPage = lazy(() => import("../features/notifications/pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const ChatListPage = lazy(() => import("../features/chat/pages/ChatListPage").then((m) => ({ default: m.ChatListPage })));
const ChatRoomPage = lazy(() => import("../features/chat/pages/ChatRoomPage").then((m) => ({ default: m.ChatRoomPage })));
const ProfilePage = lazy(() => import("../features/profile/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const PublicProfilePage = lazy(() => import("../features/profile/pages/PublicProfilePage").then((m) => ({ default: m.PublicProfilePage })));
const FreelancerReviewsPage = lazy(() => import("../features/profile/pages/FreelancerReviewsPage").then((m) => ({ default: m.FreelancerReviewsPage })));
const ClientReviewsPage = lazy(() => import("../features/profile/pages/ClientReviewsPage").then((m) => ({ default: m.ClientReviewsPage })));
const SellerReviewsPage = lazy(() => import("../features/profile/pages/SellerReviewsPage").then((m) => ({ default: m.SellerReviewsPage })));
const RentalReviewsPage = lazy(() => import("../features/profile/pages/RentalReviewsPage").then((m) => ({ default: m.RentalReviewsPage })));
const AccommodationReviewsPage = lazy(() => import("../features/profile/pages/AccommodationReviewsPage").then((m) => ({ default: m.AccommodationReviewsPage })));
const FindPersonPage = lazy(() => import("../features/profile/pages/FindPersonPage").then((m) => ({ default: m.FindPersonPage })));
const AccountSupportPage = lazy(() => import("../features/profile/pages/AccountSupportPage").then((m) => ({ default: m.AccountSupportPage })));
const AccountSecurityPage = lazy(() => import("../features/profile/pages/AccountSecurityPage").then((m) => ({ default: m.AccountSecurityPage })));
const AdminModerationPage = lazy(() => import("../features/admin/pages/AdminModerationPage").then((m) => ({ default: m.AdminModerationPage })));

function LazyRoute({ children }) {
  return <Suspense fallback={<section className="page">Loading...</section>}>{children}</Suspense>;
}

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
  { path: "/reset-password", element: <LazyRoute><ResetPasswordPage /></LazyRoute> },
  {
    element: <PublicOnly />,
    children: [
      { path: "/login", element: <LazyRoute><LoginPage /></LazyRoute> },
      { path: "/signup", element: <LazyRoute><SignupPage /></LazyRoute> }
    ]
  },
  {
    element: <RequireAuth />,
    children: [
      { path: "/complete-profile", element: <LazyRoute><CompleteProfilePage /></LazyRoute> },
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <LazyRoute><HomePage /></LazyRoute> },
          { path: "marketplace", element: <LazyRoute><MarketplacePage /></LazyRoute> },
          { path: "rentals", element: <LazyRoute><RentalsPage /></LazyRoute> },
          { path: "accommodation", element: <LazyRoute><AccommodationPage /></LazyRoute> },
          { path: "jobs/new", element: <LazyRoute><PostJobPage /></LazyRoute> },
          { path: "jobs/:jobId", element: <LazyRoute><JobDetailsPage /></LazyRoute> },
          { path: "jobs/:jobId/edit", element: <LazyRoute><EditJobPage /></LazyRoute> },
          { path: "my-jobs", element: <LazyRoute><MyJobsPage /></LazyRoute> },
          { path: "notifications", element: <LazyRoute><NotificationsPage /></LazyRoute> },
          { path: "find-person", element: <LazyRoute><FindPersonPage /></LazyRoute> },
          { path: "chat", element: <LazyRoute><ChatListPage /></LazyRoute> },
          { path: "chat/:conversationId", element: <LazyRoute><ChatRoomPage /></LazyRoute> },
          { path: "profile", element: <LazyRoute><ProfilePage /></LazyRoute> },
          { path: "account-security", element: <LazyRoute><AccountSecurityPage /></LazyRoute> },
          { path: "account-support", element: <LazyRoute><AccountSupportPage /></LazyRoute> },
          { path: "freelancer-reviews", element: <LazyRoute><FreelancerReviewsPage /></LazyRoute> },
          { path: "client-reviews", element: <LazyRoute><ClientReviewsPage /></LazyRoute> },
          { path: "seller-reviews", element: <LazyRoute><SellerReviewsPage /></LazyRoute> },
          { path: "rental-reviews", element: <LazyRoute><RentalReviewsPage /></LazyRoute> },
          { path: "accommodation-reviews", element: <LazyRoute><AccommodationReviewsPage /></LazyRoute> },
          { path: "profiles/:profileId/seller-reviews", element: <LazyRoute><SellerReviewsPage /></LazyRoute> },
          { path: "profiles/:profileId/rental-reviews", element: <LazyRoute><RentalReviewsPage /></LazyRoute> },
          { path: "profiles/:profileId/accommodation-reviews", element: <LazyRoute><AccommodationReviewsPage /></LazyRoute> },
          { path: "profiles/:profileId", element: <LazyRoute><PublicProfilePage /></LazyRoute> },
          {
            element: <RequireAdmin />,
            children: [{ path: "admin", element: <LazyRoute><AdminModerationPage /></LazyRoute> }]
          }
        ]
      }
    ]
  },
    { path: "*", element: <Navigate to="/" replace /> }
  ],
  { basename: "/ParTrabaho" }
);
