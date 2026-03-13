import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listMySupportRequests, listReportsAgainstUser, submitAccountSupportRequest } from "../../admin/api";
import { EmptyState } from "../../../components/common/EmptyState";

function readSingle(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function formatName(profile, fallback = "User") {
  if (!profile) return fallback;
  const value = [profile.firstname, profile.middlename, profile.surname, profile.suffix].filter(Boolean).join(" ").trim();
  return value || fallback;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
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

export function AccountSupportPage() {
  const { user, isRestricted, restrictionMessage } = useAuth();
  const queryClient = useQueryClient();
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState("");
  const [activeAppealReportId, setActiveAppealReportId] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [appealSuccess, setAppealSuccess] = useState("");

  const reportsQuery = useQuery({
    queryKey: ["reports-against-user", user?.id],
    enabled: !!user?.id,
    queryFn: () => listReportsAgainstUser(user.id)
  });

  const supportRequestsQuery = useQuery({
    queryKey: ["my-support-requests", user?.id],
    enabled: !!user?.id,
    queryFn: () => listMySupportRequests(user.id)
  });

  const pendingAppealsByReportId = useMemo(() => {
    const map = new Set();
    (supportRequestsQuery.data || []).forEach((request) => {
      if (request.request_type === "appeal" && request.status === "pending" && request.report_id) {
        map.add(request.report_id);
      }
    });
    return map;
  }, [supportRequestsQuery.data]);

  const recoveryMutation = useMutation({
    mutationFn: (reasonDetails) =>
      submitAccountSupportRequest({
        requestType: "recovery",
        reasonDetails
      }),
    onSuccess: async () => {
      setRecoveryReason("");
      setRecoverySuccess("Recovery request submitted. Please wait for admin review.");
      await queryClient.invalidateQueries({ queryKey: ["my-support-requests", user?.id] });
    }
  });

  const appealMutation = useMutation({
    mutationFn: ({ reportId, reasonDetails }) =>
      submitAccountSupportRequest({
        requestType: "appeal",
        reasonDetails,
        reportId
      }),
    onSuccess: async () => {
      setAppealReason("");
      setActiveAppealReportId("");
      setAppealSuccess("Appeal submitted. Admin will review your case.");
      await queryClient.invalidateQueries({ queryKey: ["my-support-requests", user?.id] });
    }
  });

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Account Support</h2>
        <Link className="btn btn-secondary" to="/profile">
          Back
        </Link>
      </div>

      <article className="card support-status-card">
        <p className="eyebrow">Support Center</p>
        <h3>Recovery and Appeal Requests</h3>
        {isRestricted ? (
          <p className="feedback error">{restrictionMessage || "Your account is currently restricted."}</p>
        ) : (
          <p className="feedback success">Your account is currently active.</p>
        )}
        <p className="muted">Use this page to request recovery or appeal reports you believe are false.</p>
      </article>

      <article className="card support-form-card">
        <h3>Request Account Recovery</h3>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            if (!recoveryReason.trim()) return;
            setRecoverySuccess("");
            recoveryMutation.mutate(recoveryReason.trim());
          }}
        >
          <label>
            Why should your account be recovered?
            <textarea
              rows={4}
              value={recoveryReason}
              onChange={(event) => setRecoveryReason(event.target.value)}
              placeholder="Explain your request in detail"
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={recoveryMutation.isPending || !recoveryReason.trim()}>
            {recoveryMutation.isPending ? "Submitting..." : "Submit Recovery Request"}
          </button>
          {recoverySuccess ? <p className="feedback success">{recoverySuccess}</p> : null}
          {recoveryMutation.isError ? <p className="feedback error">{recoveryMutation.error.message}</p> : null}
        </form>
      </article>

      <article className="card support-form-card">
        <h3>Appeal Reports Against You</h3>
        {reportsQuery.isError ? <p className="feedback error">{reportsQuery.error.message}</p> : null}
        {!reportsQuery.isLoading && (reportsQuery.data || []).length === 0 ? (
          <EmptyState title="No reports found" description="Reports filed against your account will appear here." />
        ) : null}

        <div className="stack">
          {(reportsQuery.data || []).map((report) => {
            const reporter = readSingle(report.reporter);
            const job = readSingle(report.job);
            const isPendingAppeal = pendingAppealsByReportId.has(report.id);
            const canAppeal = report.status !== "dismissed" && !isPendingAppeal;
            const isAppealOpen = activeAppealReportId === report.id;
            return (
              <article key={report.id} className="support-report-item">
                <p className="muted">
                  <strong>Job:</strong> {job?.title || "Job Post"}
                </p>
                <p>
                  <strong>Reported by:</strong> {formatName(reporter, "Other participant")}
                </p>
                <p>
                  <strong>Reason:</strong> {reasonLabel(report.reason_type)}
                </p>
                <p>
                  <strong>Details:</strong> {report.reason_details}
                </p>
                <p className="muted">
                  <strong>Status:</strong> {report.status} | <strong>Filed:</strong> {formatDate(report.created_at)}
                </p>
                {report.review_note ? (
                  <p className="muted">
                    <strong>Admin note:</strong> {report.review_note}
                  </p>
                ) : null}

                {isPendingAppeal ? <p className="feedback">You already have a pending appeal for this report.</p> : null}

                {canAppeal ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      setAppealSuccess("");
                      setAppealReason("");
                      setActiveAppealReportId((prev) => (prev === report.id ? "" : report.id));
                    }}
                  >
                    {isAppealOpen ? "Cancel Appeal" : "Appeal This Report"}
                  </button>
                ) : null}

                {isAppealOpen ? (
                  <form
                    className="form-grid"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!appealReason.trim()) return;
                      setAppealSuccess("");
                      appealMutation.mutate({
                        reportId: report.id,
                        reasonDetails: appealReason.trim()
                      });
                    }}
                  >
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
                    <button className="btn btn-primary" type="submit" disabled={appealMutation.isPending || !appealReason.trim()}>
                      {appealMutation.isPending ? "Submitting..." : "Submit Appeal"}
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
        {appealSuccess ? <p className="feedback success">{appealSuccess}</p> : null}
        {appealMutation.isError ? <p className="feedback error">{appealMutation.error.message}</p> : null}
      </article>

      <article className="card support-form-card">
        <h3>My Support Requests</h3>
        {supportRequestsQuery.isError ? <p className="feedback error">{supportRequestsQuery.error.message}</p> : null}
        {!supportRequestsQuery.isLoading && (supportRequestsQuery.data || []).length === 0 ? (
          <EmptyState title="No requests yet" description="Submitted recovery and appeal requests will appear here." />
        ) : null}
        <div className="stack">
          {(supportRequestsQuery.data || []).map((request) => (
            <article key={request.id} className="support-request-item">
              <p>
                <strong>Type:</strong> {request.request_type}
              </p>
              <p>
                <strong>Status:</strong> {request.status}
              </p>
              <p>
                <strong>Your reason:</strong> {request.reason_details}
              </p>
              <p className="muted">
                <strong>Submitted:</strong> {formatDate(request.created_at)}
              </p>
              {request.admin_response ? (
                <p>
                  <strong>Admin response:</strong> {request.admin_response}
                </p>
              ) : null}
              {request.reviewed_at ? (
                <p className="muted">
                  <strong>Reviewed:</strong> {formatDate(request.reviewed_at)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
