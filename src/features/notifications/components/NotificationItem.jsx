import { useState } from "react";
import { Link } from "react-router-dom";

function getInitials(name) {
  if (!name) return "FR";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function normalizeUuid(value) {
  const asText = typeof value === "string" ? value : "";
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(asText);
  return isUuid ? asText : "";
}

function reportReasonLabel(value) {
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

export function NotificationItem({
  notification,
  onAcceptApplication,
  onDeclineApplication,
  onOpenNotificationChat,
  onSubmitReportAppeal,
  isSelected = false,
  onToggleSelect
}) {
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealSent, setAppealSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [actionError, setActionError] = useState("");

  const applicantName = [
    notification.application?.profiles?.firstname || notification.data?.applicant_name,
    notification.application?.profiles?.surname
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const applicantMessage =
    notification.application?.cover_letter ||
    notification.data?.cover_letter ||
    "No message provided by applicant.";
  const applicantId = normalizeUuid(
    notification.application?.profiles?.id ||
    notification.application?.freelancer_id ||
    notification.data?.freelancer_id
  );
  const applicantAvatar = notification.application?.profiles?.avatar_url || "";
  const applicantDisplayName = applicantName || notification.data?.applicant_name || "Freelancer";
  const avatarStyle = {
    width: 32,
    height: 32,
    maxWidth: 32,
    maxHeight: 32,
    borderRadius: 999,
    objectFit: "cover",
    flexShrink: 0
  };

  const isJobApplication = notification.type === "job_application" && !!notification.data?.application_id;
  const isDirectOffer = notification.type === "job_match" && notification.data?.offer_type === "direct" && !!notification.data?.job_id;
  const isJobFinishUpdate = notification.type === "job_completed" && !!notification.data?.job_id;
  const isMarketplaceUpdate = notification.type === "marketplace_update" && !!notification.data?.product_id;
  const isRentalNotification =
    (notification.type === "rental_reservation" || notification.type === "rental_update") && !!notification.data?.rental_id;
  const isAccommodationNotification =
    (notification.type === "accommodation_reservation" || notification.type === "accommodation_update") &&
    !!notification.data?.accommodation_id;
  const reportId = normalizeUuid(notification.data?.report_id);
  const reportStatus = String(notification.data?.report_status || notification.data?.review_status || "").toLowerCase();
  const isReportNotification = notification.type === "report_update" && !!reportId;
  const canAppealFromNotification =
    isReportNotification &&
    reportStatus === "submitted" &&
    notification.data?.can_appeal !== false &&
    typeof onSubmitReportAppeal === "function" &&
    !appealSent;
  const reportReason = notification.data?.reason_label || reportReasonLabel(notification.data?.reason_type);
  const reportDetails = String(notification.data?.reason_details || "").trim();
  const reportSanctionWarning =
    String(notification.data?.possible_account_action || "").trim() ||
    "If this report is validated by admin, your account may be suspended or blocked.";
  const reportAppealGuide =
    String(notification.data?.appeal_hint || "").trim() ||
    "If this report is false, submit an appeal so admin can review your side.";

  const canOpenChatFromStatus =
    notification.type === "application_accepted" ||
    isDirectOffer ||
    isJobFinishUpdate ||
    isMarketplaceUpdate ||
    isRentalNotification ||
    isAccommodationNotification ||
    (isReportNotification && !!notification.data?.job_id);
  const canOpenFromApplication = isJobApplication && (accepted || notification.application?.status === "accepted");
  const canOpenChat =
    (canOpenChatFromStatus || canOpenFromApplication) &&
    (isMarketplaceUpdate || isRentalNotification || isAccommodationNotification || !!notification.data?.job_id);
  const applicationPending = notification.application?.status === "pending" || !notification.application?.status;

  async function handleAccept() {
    if (!notification.data?.application_id) return;
    setActionError("");
    setAccepting(true);
    try {
      await onAcceptApplication(notification.data.application_id, notification.id);
      setAccepted(true);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setAccepting(false);
    }
  }

  async function handleDecline() {
    if (!notification.data?.application_id) return;
    setActionError("");
    setDeclining(true);
    try {
      await onDeclineApplication(notification.data.application_id, notification.id);
      setDeclined(true);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeclining(false);
    }
  }

  async function handleOpenChat() {
    if (!canOpenChat || !onOpenNotificationChat || openingChat) return;
    setActionError("");
    setOpeningChat(true);
    try {
      await onOpenNotificationChat(notification);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setOpeningChat(false);
    }
  }

  async function handleSubmitAppeal(event) {
    event.preventDefault();
    if (!canAppealFromNotification || !reportId || !appealReason.trim()) return;
    setActionError("");
    setAppealSubmitting(true);
    try {
      await onSubmitReportAppeal({
        reportId,
        reasonDetails: appealReason.trim(),
        notificationId: notification.id
      });
      setAppealSent(true);
      setAppealOpen(false);
      setAppealReason("");
    } catch (err) {
      setActionError(err.message);
    } finally {
      setAppealSubmitting(false);
    }
  }

  return (
    <article
      className={`card notification-item ${notification.is_read ? "" : "unread"} ${canOpenChat ? "clickable" : ""}`}
      role={canOpenChat ? "button" : undefined}
      tabIndex={canOpenChat ? 0 : undefined}
      onClick={(event) => {
        if (!canOpenChat) return;
        if (event.target.closest("a,button,input,textarea,select,label")) return;
        handleOpenChat();
      }}
      onKeyDown={(event) => {
        if (!canOpenChat) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("a,button,input,textarea,select,label")) return;
        event.preventDefault();
        handleOpenChat();
      }}
    >
      <div className="notification-header">
        <div className="notification-title">
          <label className="notification-select">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect?.(notification.id)}
              aria-label="Select notification"
            />
          </label>
          <h3>{notification.title}</h3>
        </div>
        {!notification.is_read ? <span className="notification-unread-pill">Unread</span> : null}
      </div>
      <p>{notification.body}</p>
      {isJobApplication ? (
        <div className="notification-extra">
          <div className="notification-applicant" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {applicantId ? (
              <Link
                className="notification-applicant-avatar-link"
                to={`/profiles/${applicantId}`}
                aria-label={`View ${applicantDisplayName} profile`}
                style={{ display: "inline-flex", width: 32, height: 32, overflow: "hidden", borderRadius: 999 }}
              >
                {applicantAvatar ? (
                  <img className="notification-applicant-avatar" src={applicantAvatar} alt={applicantDisplayName} style={avatarStyle} />
                ) : (
                  <span className="notification-applicant-avatar-fallback">{getInitials(applicantDisplayName)}</span>
                )}
              </Link>
            ) : applicantAvatar ? (
              <img className="notification-applicant-avatar" src={applicantAvatar} alt={applicantDisplayName} style={avatarStyle} />
            ) : (
              <span className="notification-applicant-avatar-fallback">{getInitials(applicantDisplayName)}</span>
            )}
            <div className="notification-applicant-text">
              <p className="notification-applicant-caption">Applicant</p>
              {applicantId ? (
                <Link className="notification-applicant-name" to={`/profiles/${applicantId}`}>
                  {applicantDisplayName}
                </Link>
              ) : (
                <p className="notification-applicant-name">{applicantDisplayName}</p>
              )}
            </div>
          </div>
          <p>
            <strong>Message:</strong> {applicantMessage}
          </p>
        </div>
      ) : null}
      {isReportNotification ? (
        <div className="notification-extra">
          <p>
            <strong>Reason:</strong> {reportReason}
          </p>
          {reportDetails ? (
            <p>
              <strong>Details:</strong> {reportDetails}
            </p>
          ) : null}
          {reportStatus === "submitted" ? (
            <>
              <p className="muted">
                <strong>Notice:</strong> {reportSanctionWarning}
              </p>
              <p className="muted">
                <strong>Appeal:</strong> {reportAppealGuide}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
      <p className="muted">{new Date(notification.created_at).toLocaleString()}</p>
      <div className="notification-actions">
        {isJobApplication && applicationPending && !accepted && !declined ? (
          <button className="btn btn-primary" type="button" onClick={handleAccept} disabled={accepting || declining}>
            {accepting ? "Hiring..." : "Hire Applicant"}
          </button>
        ) : null}
        {isJobApplication && applicationPending && !accepted && !declined ? (
          <button className="btn btn-danger" type="button" onClick={handleDecline} disabled={declining || accepting}>
            {declining ? "Declining..." : "Decline Application"}
          </button>
        ) : null}
        {canAppealFromNotification ? (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              setActionError("");
              setAppealOpen((prev) => !prev);
            }}
          >
            {appealOpen ? "Cancel Appeal" : "Appeal This Report"}
          </button>
        ) : null}
      </div>
      {appealOpen && canAppealFromNotification ? (
        <form className="form-grid" onSubmit={handleSubmitAppeal}>
          <label>
            Appeal Reason
            <textarea
              rows={3}
              value={appealReason}
              onChange={(event) => setAppealReason(event.target.value)}
              placeholder="Explain why this report is false or unfair"
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={appealSubmitting || !appealReason.trim()}>
            {appealSubmitting ? "Submitting..." : "Send Appeal to Admin"}
          </button>
        </form>
      ) : null}
      {accepted ? <p className="feedback success">Applicant hired. Job is now in progress.</p> : null}
      {declined || notification.application?.status === "rejected" ? <p className="feedback">Application declined.</p> : null}
      {appealSent ? <p className="feedback success">Appeal sent to admin. We will review your case.</p> : null}
      {actionError ? <p className="feedback error">{actionError}</p> : null}
    </article>
  );
}
