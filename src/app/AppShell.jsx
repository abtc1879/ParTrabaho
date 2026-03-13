import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { APP_NAME } from "../lib/constants";
import { DEFAULT_LOGO_URL, getAppSettings } from "../lib/appSettings";
import { BottomNav } from "../components/layout/BottomNav";

const SIDEBAR_PREF_KEY = "partrabaho.sidebar.collapsed";

function MenuToggleIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {collapsed ? (
        <>
          <path d="M5 6h14M5 12h10M5 18h14" />
          <path d="m15 9 3 3-3 3" />
        </>
      ) : (
        <>
          <path d="M5 6h14M5 12h10M5 18h14" />
          <path d="m19 9-3 3 3 3" />
        </>
      )}
    </svg>
  );
}

function getHeaderTitle(pathname) {
  if (pathname === "/") return "Find Part-time Job";
  if (pathname === "/marketplace") return "Marketplace";
  if (pathname === "/rentals") return "Rentals";
  if (pathname === "/accommodation") return "Accommodation";
  if (pathname === "/notifications") return "Notifications Center";
  if (pathname === "/find-person") return "Find Person";
  if (pathname === "/chat") return "Chats";
  if (pathname === "/profile") return "Profile";
  if (pathname === "/account-support") return "Account Support";
  if (pathname === "/admin") return "Admin Moderation";
  if (pathname === "/freelancer-reviews") return "Freelancer Ratings";
  if (pathname === "/client-reviews") return "Client Ratings";
  if (pathname === "/seller-reviews") return "Seller Ratings";
  if (pathname.endsWith("/seller-reviews")) return "Seller Ratings";
  if (pathname.startsWith("/profiles/")) return "Applicant Profile";
  if (pathname === "/my-jobs") return "My Jobs";
  if (pathname === "/jobs/new") return "Post Job";
  if (pathname.startsWith("/jobs/") && pathname.endsWith("/edit")) return "Edit Job";
  if (pathname.startsWith("/jobs/")) return "Job Details";
  if (pathname.startsWith("/chat/")) return "Conversation";
  return "Dashboard";
}

export function AppShell() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const [routeDirection, setRouteDirection] = useState("forward");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const headerTitle = getHeaderTitle(location.pathname);
  const appSettingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    staleTime: 5 * 60 * 1000
  });
  const logoUrl = appSettingsQuery.data?.logo_url || DEFAULT_LOGO_URL;

  useEffect(() => {
    if (navigationType === "POP") {
      setRouteDirection("back");
      return;
    }
    if (navigationType === "REPLACE") {
      setRouteDirection("fade");
      return;
    }
    setRouteDirection("forward");
  }, [location.pathname, navigationType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(SIDEBAR_PREF_KEY);
    if (saved === "1") {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_PREF_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 1080px)");
    const handle = (event) => {
      if (event.matches) {
        setSidebarCollapsed(false);
      }
    };
    handle(media);
    if (media.addEventListener) {
      media.addEventListener("change", handle);
      return () => media.removeEventListener("change", handle);
    }
    media.addListener(handle);
    return () => media.removeListener(handle);
  }, []);

  return (
    <div className="app-shell">
      <div className="ambient-layer" aria-hidden="true">
        <span className="orb orb-one" />
        <span className="orb orb-two" />
      </div>
      <div className={`dashboard-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <BottomNav collapsed={sidebarCollapsed} />
        <div className="dashboard-main">
          <header className="app-header">
            <div className="brand-wrap">
              <img className="brand-logo" src={logoUrl} alt={`${APP_NAME} official logo`} />
              <span className="brand-wordmark">ParTrabaho</span>
            </div>
            <div className="header-right">
              <button
                className="sidebar-toggle"
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={sidebarCollapsed}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <MenuToggleIcon collapsed={sidebarCollapsed} />
                <span>{sidebarCollapsed ? "Expand Menu" : "Collapse Menu"}</span>
              </button>
              <div className="header-context">
                <small>Workspace</small>
                <h2>{headerTitle}</h2>
              </div>
            </div>
          </header>
          <main className="app-content">
            <div className={`route-stage ${routeDirection}`} key={`${location.pathname}-${routeDirection}`}>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
