import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminReviewLoginRecoveryRequest,
  adminLiftUserRestriction,
  adminReviewSupportRequest,
  adminSetUserAdmin,
  adminDeleteUser,
  adminUpdateReport,
  listAllReportsForAdmin,
  listLoginAttemptLogsForAdmin,
  listLoginAttemptSummaryForAdmin,
  listLoginRecoveryRequestsForAdmin,
  listRestrictedUsers,
  listSupportRequestsForAdmin,
  listUsersForAdmin
} from "../api";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../../components/common/EmptyState";
import { DEFAULT_LOGO_URL, getAppSettings, updateAppLogo, uploadAppLogo } from "../../../lib/appSettings";

const ADMIN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "requests", label: "Requests" },
  { id: "reports", label: "Reports" },
  { id: "accounts", label: "Accounts" }
];

function readSingle(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function formatName(profile, fallback = "User") {
  if (!profile) return fallback;
  const name = [profile.firstname, profile.middlename, profile.surname, profile.suffix].filter(Boolean).join(" ").trim();
  return name || fallback;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function formatReportSanction(action, days, until) {
  const normalized = String(action || "none").toLowerCase();
  if (normalized === "block") return "Blocked account";
  if (normalized === "suspend") {
    const dayCount = Number(days || 0);
    const untilLabel = formatDate(until);
    if (dayCount > 0) {
      return `Suspended for ${dayCount} day${dayCount === 1 ? "" : "s"}${untilLabel ? ` (until ${untilLabel})` : ""}`;
    }
    return untilLabel ? `Suspended until ${untilLabel}` : "Suspended";
  }
  return "No suspension";
}

function reasonLabel(value) {
  switch (value) {
    case "poor_work":
      return "Poor work quality";
    case "salary_issue":
      return "Salary issue";
    case "no_show":
      return "No show";
    case "fraud":
      return "Fraud";
    case "abuse":
      return "Abuse";
    default:
      return "Other";
  }
}

function getRestrictionText(profile) {
  if (!profile) return "No restrictions";
  if (profile.blocked_listed) return "Blocked listed";
  if (profile.suspended_until) {
    const suspendedUntil = new Date(profile.suspended_until);
    if (!Number.isNaN(suspendedUntil.getTime()) && suspendedUntil.getTime() > Date.now()) {
      return `Suspended until ${suspendedUntil.toLocaleString()}`;
    }
  }
  return "No restrictions";
}

export function AdminModerationPage() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [reportNoteById, setReportNoteById] = useState({});
  const [reportSanctionById, setReportSanctionById] = useState({});
  const [reportSuspendDaysById, setReportSuspendDaysById] = useState({});
  const [supportResponseById, setSupportResponseById] = useState({});
  const [loginRecoveryResponseById, setLoginRecoveryResponseById] = useState({});
  const [liftReasonByUserId, setLiftReasonByUserId] = useState({});
  const [selectedAttemptEmail, setSelectedAttemptEmail] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoMessage, setLogoMessage] = useState("");

  const canLoadAdmin = !!user?.id && isAdmin;
  const needReportsData = canLoadAdmin && (activeTab === "overview" || activeTab === "reports");
  const needRequestsData = canLoadAdmin && (activeTab === "overview" || activeTab === "requests");
  const needAccountsData = canLoadAdmin && (activeTab === "overview" || activeTab === "accounts");
  const needLoginAttemptSummary = canLoadAdmin && (activeTab === "requests" || activeTab === "accounts");

  useEffect(() => {
    return () => {
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  const reportsQuery = useQuery({
    queryKey: ["admin-reports", user?.id],
    enabled: needReportsData,
    queryFn: () => listAllReportsForAdmin()
  });

  const supportRequestsQuery = useQuery({
    queryKey: ["admin-support-requests", user?.id],
    enabled: needRequestsData,
    queryFn: () => listSupportRequestsForAdmin()
  });

  const restrictedUsersQuery = useQuery({
    queryKey: ["admin-restricted-users", user?.id],
    enabled: needAccountsData,
    queryFn: () => listRestrictedUsers()
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users", user?.id],
    enabled: needAccountsData,
    queryFn: () => listUsersForAdmin()
  });

  const loginRecoveryRequestsQuery = useQuery({
    queryKey: ["admin-login-recovery-requests", user?.id],
    enabled: needRequestsData,
    queryFn: () => listLoginRecoveryRequestsForAdmin()
  });

  const loginAttemptSummaryQuery = useQuery({
    queryKey: ["admin-login-attempt-summary", user?.id],
    enabled: needLoginAttemptSummary,
    queryFn: () => listLoginAttemptSummaryForAdmin()
  });

  const loginAttemptLogsQuery = useQuery({
    queryKey: ["admin-login-attempt-logs", user?.id, selectedAttemptEmail],
    enabled: needLoginAttemptSummary && !!selectedAttemptEmail,
    queryFn: () => listLoginAttemptLogsForAdmin({ attemptedEmail: selectedAttemptEmail, limit: 60 })
  });

  const appSettingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    staleTime: 5 * 60 * 1000
  });
  const currentLogoUrl = appSettingsQuery.data?.logo_url || DEFAULT_LOGO_URL;

  const updateLogoMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Missing admin session.");
      if (!logoFile) throw new Error("Select a logo image first.");
      const uploadedUrl = await uploadAppLogo({ userId: user.id, file: logoFile });
      return updateAppLogo({ userId: user.id, logoUrl: uploadedUrl });
    },
    onSuccess: async () => {
      setLogoMessage("Logo updated successfully.");
      setLogoError("");
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
      setLogoFile(null);
      setLogoPreview("");
      await queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (error) => {
      setLogoError(error?.message || "Unable to update the logo right now.");
      setLogoMessage("");
    }
  });

  const updateReportMutation = useMutation({
    mutationFn: ({ reportId, status, reviewNote, sanctionAction, suspendDays }) =>
      adminUpdateReport({ reportId, status, reviewNote, sanctionAction, suspendDays }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-reports", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-support-requests", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-restricted-users", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users", user?.id] })
      ]);
    }
  });

  function clearLogoSelection() {
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
    }
    setLogoFile(null);
    setLogoPreview("");
  }

  function handleLogoFileChange(event) {
    const file = event.target.files?.[0];
    setLogoMessage("");
    setLogoError("");
    if (!file) {
      clearLogoSelection();
      return;
    }
    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file.");
      clearLogoSelection();
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo image must be 2MB or less.");
      clearLogoSelection();
      return;
    }
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  const reviewSupportMutation = useMutation({
    mutationFn: ({ requestId, decision, adminResponse, liftRestriction }) =>
      adminReviewSupportRequest({
        requestId,
        decision,
        adminResponse,
        liftRestriction
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-support-requests", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-reports", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-restricted-users", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users", user?.id] })
      ]);
    }
  });

  const liftRestrictionMutation = useMutation({
    mutationFn: ({ userId, reason }) => adminLiftUserRestriction({ userId, reason }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-restricted-users", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users", user?.id] })
      ]);
    }
  });

  const setAdminMutation = useMutation({
    mutationFn: ({ userId, makeAdmin }) => adminSetUserAdmin({ userId, makeAdmin }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users", user?.id] });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: ({ userId, reason }) => adminDeleteUser({ userId, reason }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-restricted-users", user?.id] })
      ]);
    }
  });

  const reviewLoginRecoveryMutation = useMutation({
    mutationFn: ({ requestId, decision, adminResponse, requesterEmail }) =>
      adminReviewLoginRecoveryRequest({
        requestId,
        decision,
        adminResponse,
        requesterEmail
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-login-recovery-requests", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-login-attempt-summary", user?.id] })
      ]);
    }
  });

  const attemptSummaryByEmail = (loginAttemptSummaryQuery.data || []).reduce((acc, item) => {
    const email = String(item.attempted_email || "").toLowerCase();
    if (email) acc[email] = item;
    return acc;
  }, {});

  const reports = reportsQuery.data || [];
  const pendingReports = reports.filter((item) => item.status === "submitted");
  const supportRequests = supportRequestsQuery.data || [];
  const loginRecoveryRequests = loginRecoveryRequestsQuery.data || [];
  const restrictedUsers = restrictedUsersQuery.data || [];
  const users = usersQuery.data || [];
  const pendingSupportRequests = supportRequests.filter((item) => item.status === "pending");
  const pendingLoginRecoveryRequests = loginRecoveryRequests.filter((item) => item.status === "pending");

  const pendingReportsCount = reports.filter((item) => item.status === "submitted").length;
  const pendingSupportCount = pendingSupportRequests.length;
  const pendingLoginRecoveryCount = pendingLoginRecoveryRequests.length;
  const adminInboxTotal = pendingReportsCount + pendingSupportCount + pendingLoginRecoveryCount;

  if (!isAdmin) {
    return (
      <section className="page">
        <article className="card">
          <h2>Admin Access Required</h2>
          <p className="muted">Only administrator accounts can open this page.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="page admin-page">
      <div className="page-title-row">
        <h2>Admin Moderation</h2>
      </div>

      <article className="card admin-section admin-overview-header">
        <h3>Moderation Workspace</h3>
        <div className="admin-kpi-grid">
          <article className="admin-kpi-card">
            <p className="eyebrow">Inbox</p>
            <h4>{adminInboxTotal}</h4>
            <p className="muted">Pending items</p>
          </article>
          <article className="admin-kpi-card">
            <p className="eyebrow">Login Recovery</p>
            <h4>{pendingLoginRecoveryCount}</h4>
            <p className="muted">Waiting for decision</p>
          </article>
          <article className="admin-kpi-card">
            <p className="eyebrow">Appeals / Support</p>
            <h4>{pendingSupportCount}</h4>
            <p className="muted">Pending requests</p>
          </article>
          <article className="admin-kpi-card">
            <p className="eyebrow">Active Reports</p>
            <h4>{pendingReportsCount}</h4>
            <p className="muted">Submitted status</p>
          </article>
        </div>
        <nav className="admin-tab-nav" aria-label="Admin sections">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`admin-tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </article>

      {activeTab === "overview" ? (
        <>
          <article className="card admin-section">
            <h3>Quick Queue</h3>
            <div className="admin-overview-grid">
              <section className="admin-overview-col">
                <p className="eyebrow">Pending Login Recovery</p>
                {pendingLoginRecoveryRequests.slice(0, 3).map((request) => (
                  <p key={`ov-recovery-${request.id}`} className="admin-overview-item">
                    <strong>{request.requester_name}</strong> ({request.requester_email})
                  </p>
                ))}
                {pendingLoginRecoveryCount === 0 ? <p className="muted">No pending login recovery requests.</p> : null}
                <button className="btn btn-secondary" type="button" onClick={() => setActiveTab("requests")}>
                  Open Requests
                </button>
              </section>
              <section className="admin-overview-col">
                <p className="eyebrow">Submitted Reports</p>
                {reports
                  .filter((x) => x.status === "submitted")
                  .slice(0, 3)
                  .map((report) => {
                    const reported = readSingle(report.reported);
                    return (
                      <p key={`ov-report-${report.id}`} className="admin-overview-item">
                        <strong>{reasonLabel(report.reason_type)}</strong> - {formatName(reported)}
                      </p>
                    );
                  })}
                {pendingReportsCount === 0 ? <p className="muted">No submitted reports.</p> : null}
                <button className="btn btn-secondary" type="button" onClick={() => setActiveTab("reports")}>
                  Open Reports
                </button>
              </section>
              <section className="admin-overview-col">
                <p className="eyebrow">Restricted Accounts</p>
                {restrictedUsers.slice(0, 3).map((profile) => (
                  <p key={`ov-restricted-${profile.id}`} className="admin-overview-item">
                    <strong>{formatName(profile)}</strong> - {getRestrictionText(profile)}
                  </p>
                ))}
                {restrictedUsers.length === 0 ? <p className="muted">No restricted users.</p> : null}
                <button className="btn btn-secondary" type="button" onClick={() => setActiveTab("accounts")}>
                  Open Accounts
                </button>
              </section>
            </div>
          </article>
          <article className="card admin-section">
            <h3>Branding</h3>
            <div className="admin-branding-grid">
              <div className="admin-logo-preview">
                <img
                  className="admin-logo-image"
                  src={logoPreview || currentLogoUrl}
                  alt="Current app logo"
                  loading="lazy"
                />
                <p className="muted">Current logo shown across the app.</p>
              </div>
              <div className="admin-logo-form">
                <label className="admin-logo-upload">
                  <span>Upload new logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    disabled={updateLogoMutation.isPending}
                  />
                </label>
                {logoFile ? <p className="muted">{logoFile.name}</p> : <p className="muted">PNG or JPG, max 2MB.</p>}
                <div className="admin-actions-row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => updateLogoMutation.mutate()}
                    disabled={!logoFile || updateLogoMutation.isPending}
                  >
                    {updateLogoMutation.isPending ? "Updating..." : "Save Logo"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      setLogoError("");
                      setLogoMessage("");
                      clearLogoSelection();
                    }}
                    disabled={updateLogoMutation.isPending}
                  >
                    Clear Selection
                  </button>
                </div>
                {appSettingsQuery.isError ? <p className="feedback error">{appSettingsQuery.error.message}</p> : null}
                {logoError ? <p className="feedback error">{logoError}</p> : null}
                {logoMessage ? <p className="feedback success">{logoMessage}</p> : null}
              </div>
            </div>
          </article>
        </>
      ) : null}

      {activeTab === "reports" ? (
      <article className="card admin-section">
        <h3>Incoming Reports</h3>
        {pendingReports.length === 0 && !reportsQuery.isLoading ? (
          <EmptyState title="No pending reports" description="Submitted reports will appear here for moderation." />
        ) : null}
        {reportsQuery.isError ? <p className="feedback error">{reportsQuery.error.message}</p> : null}
        <div className="stack">
          {pendingReports.map((report) => {
            const reporter = readSingle(report.reporter);
            const reported = readSingle(report.reported);
            const job = readSingle(report.job);
            const noteValue = reportNoteById[report.id] || "";
            const sanctionActionValue =
              reportSanctionById[report.id] ?? (report.status === "submitted" ? "none" : report.sanction_action || "none");
            const suspendDaysValue = reportSuspendDaysById[report.id] ?? String(report.sanction_days || 7);
            const parsedSuspendDays = Number(suspendDaysValue);
            const hasValidSuspendDays =
              sanctionActionValue !== "suspend" ||
              (Number.isInteger(parsedSuspendDays) && parsedSuspendDays >= 1 && parsedSuspendDays <= 3650);
            return (
              <article key={report.id} className="admin-item-card">
                <p>
                  <strong>Job:</strong> {job?.title || "Job Post"}
                </p>
                <p>
                  <strong>Reporter:</strong> {formatName(reporter)}
                </p>
                <p>
                  <strong>Reported user:</strong> {formatName(reported)}
                </p>
                <p>
                  <strong>Reason:</strong> {reasonLabel(report.reason_type)}
                </p>
                <p>
                  <strong>Details:</strong> {report.reason_details}
                </p>
                <p className="muted">
                  <strong>Status:</strong> {report.status} | <strong>Created:</strong> {formatDate(report.created_at)}
                </p>
                {report.status !== "submitted" ? (
                  <p className="muted">
                    <strong>Sanction:</strong>{" "}
                    {formatReportSanction(report.sanction_action, report.sanction_days, report.sanctioned_until)}
                  </p>
                ) : null}
                {report.review_note ? (
                  <p className="muted">
                    <strong>Admin note:</strong> {report.review_note}
                  </p>
                ) : null}
                <label>
                  Admin Note (optional)
                  <textarea
                    rows={2}
                    value={noteValue}
                    onChange={(event) =>
                      setReportNoteById((prev) => ({
                        ...prev,
                        [report.id]: event.target.value
                      }))
                    }
                    placeholder="Optional moderation note"
                  />
                </label>
                {report.status === "submitted" ? (
                  <>
                    <label>
                      Sanction if Marked Valid
                      <select
                        value={sanctionActionValue}
                        onChange={(event) =>
                          setReportSanctionById((prev) => ({
                            ...prev,
                            [report.id]: event.target.value
                          }))
                        }
                      >
                        <option value="none">No suspension</option>
                        <option value="suspend">Suspend account</option>
                        <option value="block">Block account</option>
                      </select>
                    </label>
                    {sanctionActionValue === "suspend" ? (
                      <label>
                        Suspension Length (days)
                        <input
                          type="number"
                          min={1}
                          max={3650}
                          step={1}
                          value={suspendDaysValue}
                          onChange={(event) =>
                            setReportSuspendDaysById((prev) => ({
                              ...prev,
                              [report.id]: event.target.value
                            }))
                          }
                          placeholder="e.g. 7"
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
                {report.status === "submitted" && sanctionActionValue === "suspend" && !hasValidSuspendDays ? (
                  <p className="feedback error">Enter a valid suspension duration between 1 and 3650 days.</p>
                ) : null}
                <div className="admin-actions-row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={updateReportMutation.isPending || !hasValidSuspendDays}
                    onClick={() =>
                      updateReportMutation.mutate({
                        reportId: report.id,
                        status: "resolved",
                        reviewNote: noteValue,
                        sanctionAction: sanctionActionValue,
                        suspendDays: sanctionActionValue === "suspend" ? parsedSuspendDays : null
                      })
                    }
                  >
                    Mark Valid
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={updateReportMutation.isPending}
                    onClick={() =>
                      updateReportMutation.mutate({
                        reportId: report.id,
                        status: "dismissed",
                        reviewNote: noteValue || "Dismissed by administrator",
                        sanctionAction: "none",
                        suspendDays: null
                      })
                    }
                  >
                    Dismiss as False
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {updateReportMutation.isError ? <p className="feedback error">{updateReportMutation.error.message}</p> : null}
      </article>
      ) : null}

      {activeTab === "requests" ? (
      <article className="card admin-section">
        <h3>Recovery and Appeal Requests</h3>
        {pendingSupportRequests.length === 0 &&
        pendingLoginRecoveryRequests.length === 0 &&
        !supportRequestsQuery.isLoading &&
        !loginRecoveryRequestsQuery.isLoading ? (
          <EmptyState title="No support requests" description="Recovery and appeal requests will appear here." />
        ) : null}
        {supportRequestsQuery.isError ? <p className="feedback error">{supportRequestsQuery.error.message}</p> : null}
        {loginRecoveryRequestsQuery.isError ? <p className="feedback error">{loginRecoveryRequestsQuery.error.message}</p> : null}
        <div className="stack">
          {pendingLoginRecoveryRequests.map((request) => {
            const linkedProfile = readSingle(request.linked_profile);
            return (
              <article key={`quick-recovery-${request.id}`} className="admin-item-card">
                <p>
                  <strong>Type:</strong> Login recovery
                </p>
                <p>
                  <strong>Name:</strong> {request.requester_name}
                </p>
                <p>
                  <strong>Email:</strong> {request.requester_email}
                </p>
                <p>
                  <strong>Phone:</strong> {request.requester_phone}
                </p>
                <p>
                  <strong>Status:</strong> {request.status}
                </p>
                <p>
                  <strong>Reason:</strong> {request.reason_details}
                </p>
                {linkedProfile ? (
                  <p className="muted">
                    <strong>Matched account:</strong> {formatName(linkedProfile)} | {getRestrictionText(linkedProfile)}
                  </p>
                ) : (
                  <p className="muted">No linked profile matched this email.</p>
                )}
                <p className="muted">
                  <strong>Created:</strong> {formatDate(request.created_at)}
                </p>
              </article>
            );
          })}
          {pendingSupportRequests.map((request) => {
            const profile = readSingle(request.user);
            const report = readSingle(request.report);
            const responseValue = supportResponseById[request.id] || "";
            return (
              <article key={request.id} className="admin-item-card">
                <p>
                  <strong>User:</strong> {formatName(profile)}
                </p>
                <p>
                  <strong>Type:</strong> {request.request_type}
                </p>
                <p>
                  <strong>Status:</strong> {request.status}
                </p>
                <p>
                  <strong>User reason:</strong> {request.reason_details}
                </p>
                <p className="muted">
                  <strong>Created:</strong> {formatDate(request.created_at)}
                </p>
                {report ? (
                  <p className="muted">
                    <strong>Appealed report:</strong> {reasonLabel(report.reason_type)} ({report.status})
                  </p>
                ) : null}
                {request.admin_response ? (
                  <p className="muted">
                    <strong>Admin response:</strong> {request.admin_response}
                  </p>
                ) : null}
                <label>
                  Admin Response (optional)
                  <textarea
                    rows={2}
                    value={responseValue}
                    onChange={(event) =>
                      setSupportResponseById((prev) => ({
                        ...prev,
                        [request.id]: event.target.value
                      }))
                    }
                    placeholder="Optional response for this request"
                  />
                </label>
                {request.status === "pending" ? (
                  <div className="admin-actions-row">
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={reviewSupportMutation.isPending}
                      onClick={() =>
                        reviewSupportMutation.mutate({
                          requestId: request.id,
                          decision: "approved",
                          adminResponse: responseValue,
                          liftRestriction: true
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={reviewSupportMutation.isPending}
                      onClick={() =>
                        reviewSupportMutation.mutate({
                          requestId: request.id,
                          decision: "rejected",
                          adminResponse: responseValue,
                          liftRestriction: false
                        })
                      }
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        {reviewSupportMutation.isError ? <p className="feedback error">{reviewSupportMutation.error.message}</p> : null}
      </article>
      ) : null}

      {activeTab === "requests" ? (
      <article className="card admin-section">
        <h3>Login Credential Recovery Request Review</h3>
        {pendingLoginRecoveryRequests.length === 0 && !loginRecoveryRequestsQuery.isLoading ? (
          <EmptyState title="No login recovery requests" description="Public login credential recovery requests will appear here." />
        ) : null}
        {loginRecoveryRequestsQuery.isError ? <p className="feedback error">{loginRecoveryRequestsQuery.error.message}</p> : null}
        {loginAttemptSummaryQuery.isError ? <p className="feedback error">{loginAttemptSummaryQuery.error.message}</p> : null}
        <div className="stack">
          {pendingLoginRecoveryRequests.map((request) => {
            const linkedProfile = readSingle(request.linked_profile);
            const responseValue = loginRecoveryResponseById[request.id] || "";
            const emailKey = String(request.requester_email || "").trim().toLowerCase();
            const summary = attemptSummaryByEmail[emailKey];
            const isSelectedEmail = !!selectedAttemptEmail && selectedAttemptEmail === emailKey;
            return (
              <article key={request.id} className="admin-item-card">
                <p>
                  <strong>Name:</strong> {request.requester_name}
                </p>
                <p>
                  <strong>Email:</strong> {request.requester_email}
                </p>
                <p>
                  <strong>Phone:</strong> {request.requester_phone}
                </p>
                <p>
                  <strong>Status:</strong> {request.status}
                </p>
                <p>
                  <strong>Reason:</strong> {request.reason_details}
                </p>
                {linkedProfile ? (
                  <p className="muted">
                    <strong>Matched account:</strong> {formatName(linkedProfile)} | {getRestrictionText(linkedProfile)}
                  </p>
                ) : (
                  <p className="muted">No linked profile matched this email.</p>
                )}
                <p className="muted">
                  <strong>Created:</strong> {formatDate(request.created_at)}
                </p>
                {summary ? (
                  <p className="muted">
                    <strong>Login attempts:</strong> {summary.total_attempts} total, {summary.failed_attempts} failed,{" "}
                    {summary.successful_attempts} successful
                    {summary.last_failed_at ? ` | Last failed: ${formatDate(summary.last_failed_at)}` : ""}
                  </p>
                ) : (
                  <p className="muted">No recorded login attempts for this email yet.</p>
                )}
                <div className="admin-actions-row">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setSelectedAttemptEmail((prev) => (prev === emailKey ? "" : emailKey))}
                  >
                    {isSelectedEmail ? "Hide Login Logs" : "View Login Logs"}
                  </button>
                </div>
                {isSelectedEmail ? (
                  <div className="admin-attempt-logs">
                    {loginAttemptLogsQuery.isLoading ? <p className="muted">Loading logs...</p> : null}
                    {!loginAttemptLogsQuery.isLoading && (loginAttemptLogsQuery.data || []).length === 0 ? (
                      <p className="muted">No attempt logs found for this email.</p>
                    ) : null}
                    {(loginAttemptLogsQuery.data || []).map((attempt) => (
                      <p key={attempt.id} className={`admin-attempt-row ${attempt.success ? "ok" : "fail"}`}>
                        <strong>{attempt.success ? "SUCCESS" : "FAILED"}</strong> - {formatDate(attempt.attempted_at)}
                        {!attempt.success && attempt.failure_message ? ` - ${attempt.failure_message}` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}

                {request.admin_response ? (
                  <p className="muted">
                    <strong>Admin response:</strong> {request.admin_response}
                  </p>
                ) : null}
                <label>
                  Admin Response (optional)
                  <textarea
                    rows={2}
                    value={responseValue}
                    onChange={(event) =>
                      setLoginRecoveryResponseById((prev) => ({
                        ...prev,
                        [request.id]: event.target.value
                      }))
                    }
                    placeholder="Resolution notes for this request"
                  />
                </label>
                {request.status === "pending" ? (
                  <div className="admin-actions-row">
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={reviewLoginRecoveryMutation.isPending}
                      onClick={() =>
                        reviewLoginRecoveryMutation.mutate({
                          requestId: request.id,
                          decision: "approved",
                          adminResponse: responseValue,
                          requesterEmail: request.requester_email
                        })
                      }
                    >
                      Approve & Send Reset Link
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={reviewLoginRecoveryMutation.isPending}
                      onClick={() =>
                        reviewLoginRecoveryMutation.mutate({
                          requestId: request.id,
                          decision: "rejected",
                          adminResponse: responseValue
                        })
                      }
                    >
                      Reject Recovery
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        {loginAttemptLogsQuery.isError ? <p className="feedback error">{loginAttemptLogsQuery.error.message}</p> : null}
        {reviewLoginRecoveryMutation.isError ? <p className="feedback error">{reviewLoginRecoveryMutation.error.message}</p> : null}
      </article>
      ) : null}

      {activeTab === "accounts" ? (
      <article className="card admin-section">
        <h3>Restricted Users</h3>
        {restrictedUsers.length === 0 && !restrictedUsersQuery.isLoading ? (
          <EmptyState title="No restricted users" description="Suspended or blocked users will be listed here." />
        ) : null}
        {restrictedUsersQuery.isError ? <p className="feedback error">{restrictedUsersQuery.error.message}</p> : null}
        <div className="stack">
          {restrictedUsers.map((profile) => {
            const reasonValue = liftReasonByUserId[profile.id] || "";
            return (
              <article key={profile.id} className="admin-item-card">
                <p>
                  <strong>User:</strong> {formatName(profile)}
                </p>
                <p>
                  <strong>Restriction:</strong> {getRestrictionText(profile)}
                </p>
                <p>
                  <strong>Offense count:</strong> {Number(profile.offense_count || 0)}
                </p>
                <label>
                  Lift Reason (optional)
                  <input
                    value={reasonValue}
                    onChange={(event) =>
                      setLiftReasonByUserId((prev) => ({
                        ...prev,
                        [profile.id]: event.target.value
                      }))
                    }
                    placeholder="Reason for lifting"
                  />
                </label>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={liftRestrictionMutation.isPending}
                  onClick={() =>
                    liftRestrictionMutation.mutate({
                      userId: profile.id,
                      reason: reasonValue
                    })
                  }
                >
                  Lift Restriction
                </button>
              </article>
            );
          })}
        </div>
        {liftRestrictionMutation.isError ? <p className="feedback error">{liftRestrictionMutation.error.message}</p> : null}
      </article>
      ) : null}

      {activeTab === "accounts" ? (
      <article className="card admin-section">
        <h3>Manage User Accounts</h3>
        {users.length === 0 && !usersQuery.isLoading ? (
          <EmptyState title="No users" description="User accounts will be listed here." />
        ) : null}
        {usersQuery.isError ? <p className="feedback error">{usersQuery.error.message}</p> : null}
        <div className="stack">
          {users.map((profile) => (
            <article key={profile.id} className="admin-item-card admin-user-row">
              <div>
                <p>
                  <strong>{formatName(profile)}</strong>
                </p>
                <p className="muted">
                  {profile.is_admin ? "Administrator" : "Regular user"} | {getRestrictionText(profile)}
                </p>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  className={profile.is_admin ? "btn btn-danger" : "btn btn-secondary"}
                  type="button"
                  disabled={setAdminMutation.isPending}
                  onClick={() =>
                    setAdminMutation.mutate({
                      userId: profile.id,
                      makeAdmin: !profile.is_admin
                    })
                  }
                >
                  {profile.is_admin ? "Remove Admin" : "Make Admin"}
                </button>
                {profile.id !== user?.id ? (
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={deleteUserMutation.isPending}
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Delete this user account? This will permanently remove the user and their data."
                      );
                      if (!confirmed) return;
                      deleteUserMutation.mutate({
                        userId: profile.id,
                        reason: "Admin deletion"
                      });
                    }}
                  >
                    Delete User
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {setAdminMutation.isError ? <p className="feedback error">{setAdminMutation.error.message}</p> : null}
        {deleteUserMutation.isError ? <p className="feedback error">{deleteUserMutation.error.message}</p> : null}
      </article>
      ) : null}
    </section>
  );
}
