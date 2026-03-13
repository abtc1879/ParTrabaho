import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../features/auth/AuthContext";
import { getUnreadMessagesCount } from "../../features/chat/api";
import { getProfileById } from "../../features/profile/api";
import { getAdminPendingItemsCount } from "../../features/admin/api";
import { DEFAULT_LOGO_URL, getAppSettings } from "../../lib/appSettings";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 10.6 12 4l8.5 6.6" />
      <path d="M6.5 9.8V20h11V9.8" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.5a4.5 4.5 0 0 0-4.5 4.5v2.1c0 .9-.3 1.8-.8 2.5L5 16.2h14l-1.7-2.6a4.5 4.5 0 0 1-.8-2.5V9A4.5 4.5 0 0 0 12 4.5Z" />
      <path d="M9.5 17.5a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

function FindPersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10" cy="8.5" r="3" />
      <path d="M4.5 17a5.5 5.5 0 0 1 11 0" />
      <circle cx="17.5" cy="16.5" r="2.5" />
      <path d="m19.3 18.3 2.2 2.2" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      <path d="M8 11h8M8 14h6" />
    </svg>
  );
}

function MarketplaceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7.5h15l-1.4 11.2a2 2 0 0 1-2 1.8H7.9a2 2 0 0 1-2-1.8L4.5 7.5Z" />
      <path d="M8.5 7.5V6.1A3.5 3.5 0 0 1 12 2.5a3.5 3.5 0 0 1 3.5 3.6v1.4" />
      <path d="M9.2 11.5a2.8 2.8 0 0 0 5.6 0" />
    </svg>
  );
}

function RentalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="12" r="3" />
      <path d="M11 12h7" />
      <path d="M15 12v3" />
      <path d="M18 12v2" />
    </svg>
  );
}

function AccommodationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h16a2 2 0 0 1 2 2v5H2v-5a2 2 0 0 1 2-2Z" />
      <path d="M4 12V8.5A2.5 2.5 0 0 1 6.5 6h3A2.5 2.5 0 0 1 12 8.5V12" />
      <path d="M2 19v-3.5M22 19v-3.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8V7" />
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M4 12.2h16" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 6 4h12l2 6.5" />
      <path d="M4 10.5h16" />
      <path d="M6.5 10.5V20h11V10.5" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 4.5 6.5V12c0 4.5 3.1 7.9 7.5 9 4.4-1.1 7.5-4.5 7.5-9V6.5L12 3Z" />
      <path d="M9.5 12.3 11.1 14 14.6 10.2" />
    </svg>
  );
}

const tabs = [
  { to: "/notifications", label: "Notifications", Icon: BellIcon },
  { to: "/chat", label: "Chat", Icon: ChatIcon },
  { to: "/", label: "Find Part-time Job", Icon: BriefcaseIcon },
  { to: "/find-person", label: "Find Person", Icon: FindPersonIcon },
  { to: "/marketplace", label: "Marketplace", Icon: MarketplaceIcon },
  { to: "/rentals", label: "Rentals", Icon: RentalIcon },
  { to: "/accommodation", label: "Accommodation", Icon: AccommodationIcon }
];

function formatBadge(value) {
  if (!value) return "";
  if (value > 99) return "99+";
  return String(value);
}

function getFullName(profile) {
  if (!profile) return "My Profile";
  const name = [profile.firstname, profile.middlename, profile.surname, profile.suffix].filter(Boolean).join(" ").trim();
  return name || "My Profile";
}

function getSkillsText(profile) {
  if (!Array.isArray(profile?.expertise) || profile.expertise.length === 0) return "No skills added yet";
  return profile.expertise.slice(0, 3).join(" / ");
}

function getRatingText(profile) {
  const count = Number(profile?.rating_count || 0);
  const avg = Number(profile?.rating_avg || 0);
  if (count <= 0) return "No ratings yet";
  return `\u2605 ${avg.toFixed(1)} (${count})`;
}

export function BottomNav({ collapsed = false }) {
  const { user, isAdmin } = useAuth();
  const prevAdminPendingRef = useRef(null);
  const [adminNotice, setAdminNotice] = useState("");

  const profileSummaryQuery = useQuery({
    queryKey: ["profile-summary", user?.id],
    enabled: !!user?.id,
    queryFn: () => getProfileById(user.id)
  });

  const unreadNotificationsQuery = useQuery({
    queryKey: ["unread-notification-count", user?.id],
    enabled: !!user?.id,
    refetchInterval: 10000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
      return Number(count || 0);
    }
  });

  const unreadChatQuery = useQuery({
    queryKey: ["unread-chat-count", user?.id],
    enabled: !!user?.id,
    refetchInterval: 10000,
    queryFn: () => getUnreadMessagesCount()
  });

  const jobsCountQuery = useQuery({
    queryKey: ["my-jobs-count", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("client_id", user.id);
      if (error) throw error;
      return Number(count || 0);
    }
  });

  const productsCountQuery = useQuery({
    queryKey: ["my-products-count", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("marketplace_products")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id);
      if (error) throw error;
      return Number(count || 0);
    }
  });

  const rentalsCountQuery = useQuery({
    queryKey: ["my-rentals-count", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("rental_listings")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      if (error) throw error;
      return Number(count || 0);
    }
  });

  const accommodationsCountQuery = useQuery({
    queryKey: ["my-accommodations-count", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("accommodation_listings")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      if (error) throw error;
      return Number(count || 0);
    }
  });

  const adminPendingQuery = useQuery({
    queryKey: ["admin-pending-items-count", user?.id],
    enabled: !!user?.id && !!isAdmin,
    refetchInterval: 10000,
    queryFn: () => getAdminPendingItemsCount()
  });

  useEffect(() => {
    if (!isAdmin) return;
    const nextTotal = Number(adminPendingQuery.data?.total || 0);
    if (prevAdminPendingRef.current === null) {
      prevAdminPendingRef.current = nextTotal;
      return;
    }
    if (nextTotal > prevAdminPendingRef.current) {
      const delta = nextTotal - prevAdminPendingRef.current;
      setAdminNotice(`${delta} new moderation request${delta > 1 ? "s" : ""} received.`);
    }
    prevAdminPendingRef.current = nextTotal;
  }, [isAdmin, adminPendingQuery.data?.total]);

  useEffect(() => {
    if (!adminNotice) return;
    const timer = window.setTimeout(() => setAdminNotice(""), 8000);
    return () => window.clearTimeout(timer);
  }, [adminNotice]);

  const badgeCountByPath = {
    "/notifications": unreadNotificationsQuery.data || 0,
    "/chat": unreadChatQuery.data || 0,
    "/admin": isAdmin ? Number(adminPendingQuery.data?.total || 0) : 0
  };

  const navTabs = isAdmin ? [...tabs, { to: "/admin", label: "Admin", Icon: AdminIcon }] : tabs;

  const profile = profileSummaryQuery.data;
  const profileName = getFullName(profile);
  const profileSkills = getSkillsText(profile);
  const profileRating = getRatingText(profile);
  const appSettingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    staleTime: 5 * 60 * 1000
  });
  const appLogoUrl = appSettingsQuery.data?.logo_url || DEFAULT_LOGO_URL;
  const profilePhoto = profile?.avatar_url || appLogoUrl;
  const hasJobs = (jobsCountQuery.data ?? 0) > 0;
  const hasProducts = (productsCountQuery.data ?? 0) > 0;
  const hasRentals = (rentalsCountQuery.data ?? 0) > 0;
  const hasAccommodations = (accommodationsCountQuery.data ?? 0) > 0;

  return (
    <aside className={`side-nav ${collapsed ? "collapsed" : ""}`}>
      <Link className="side-nav-brand" to="/profile" title="Open profile">
        <img className="side-brand-mark" src={profilePhoto} alt={profileName} />
        <div>
          <strong>{profileName}</strong>
          <small className="side-nav-skills">{profileSkills}</small>
          <small className="side-nav-rating">{profileRating}</small>
        </div>
      </Link>

      <p className="side-nav-caption">Main Menu</p>
      <nav className="side-nav-menu">
        {navTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            title={tab.label}
            className={({ isActive }) => `side-nav-item ${isActive ? "active" : ""}`}
          >
            <span className="side-nav-icon-wrap">
              <span className="side-nav-icon">
                <tab.Icon />
              </span>
              {badgeCountByPath[tab.to] > 0 ? (
                <span className="side-nav-badge" aria-label={`${badgeCountByPath[tab.to]} unread`}>
                  {formatBadge(badgeCountByPath[tab.to])}
                </span>
              ) : null}
            </span>
            <span className="side-nav-label">{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {isAdmin && adminNotice ? (
        <Link className="side-admin-alert" to="/admin">
          {adminNotice}
        </Link>
      ) : null}

      <div className="side-nav-divider" />

      <p className="side-nav-caption">Quick Access</p>
      <div className="side-nav-quick">
        <Link className="quick-action" to="/jobs/new">
          <span className="quick-action-icon">
            <PlusIcon />
          </span>
          <span className="quick-action-label">Post New Job</span>
        </Link>
        {hasJobs ? (
          <Link className="quick-action" to="/my-jobs">
            <span className="quick-action-icon">
              <BriefcaseIcon />
            </span>
            <span className="quick-action-label">Manage My Jobs</span>
          </Link>
        ) : null}
        {hasProducts ? (
          <Link className="quick-action" to="/marketplace?view=mine">
            <span className="quick-action-icon">
              <StoreIcon />
            </span>
            <span className="quick-action-label">Manage My Products</span>
          </Link>
        ) : null}
        {hasRentals ? (
          <Link className="quick-action" to="/rentals?view=mine">
            <span className="quick-action-icon">
              <StoreIcon />
            </span>
            <span className="quick-action-label">Manage My Rentals</span>
          </Link>
        ) : null}
        {hasAccommodations ? (
          <Link className="quick-action" to="/accommodation?view=mine">
            <span className="quick-action-icon">
              <StoreIcon />
            </span>
            <span className="quick-action-label">Manage My Accommodation</span>
          </Link>
        ) : null}
      </div>
    </aside>
  );
}


