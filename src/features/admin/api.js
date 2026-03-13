import { supabase } from "../../lib/supabaseClient";

function getResetRedirectTo() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/reset-password`;
}

async function sendPasswordResetLink(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Valid requester email is required");
  }

  const { data, error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: getResetRedirectTo()
  });
  if (error) throw error;
  return data;
}

export async function listAllReportsForAdmin() {
  const { data, error } = await supabase
    .from("user_reports")
    .select(
      "id, reporter_id, reported_user_id, job_id, reason_type, reason_details, status, review_note, reviewed_at, created_at, sanction_action, sanction_days, sanctioned_until, reporter:reporter_id(id, firstname, middlename, surname, suffix, avatar_url), reported:reported_user_id(id, firstname, middlename, surname, suffix, avatar_url, blocked_listed, suspended_until, offense_count), reviewer:reviewed_by(id, firstname, surname), job:job_id(id, title, status)"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listSupportRequestsForAdmin() {
  const { data, error } = await supabase
    .from("account_support_requests")
    .select(
      "id, user_id, request_type, report_id, reason_details, status, admin_response, reviewed_at, created_at, user:user_id(id, firstname, middlename, surname, suffix, avatar_url, blocked_listed, suspended_until, offense_count), reviewer:reviewed_by(id, firstname, surname), report:report_id(id, reason_type, reason_details, status, created_at, reported_user_id, reporter_id)"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listRestrictedUsers() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, firstname, middlename, surname, suffix, avatar_url, offense_count, suspended_until, blocked_listed, is_admin")
    .or(`blocked_listed.eq.true,suspended_until.gt.${nowIso}`)
    .order("blocked_listed", { ascending: false })
    .order("suspended_until", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function listUsersForAdmin() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, firstname, middlename, surname, suffix, avatar_url, is_admin, blocked_listed, suspended_until, offense_count")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listLoginRecoveryRequestsForAdmin() {
  const { data, error } = await supabase
    .from("login_recovery_requests")
    .select(
      "id, requester_name, requester_email, requester_phone, reason_details, linked_profile_id, status, admin_response, reviewed_at, created_at, linked_profile:linked_profile_id(id, firstname, middlename, surname, suffix, blocked_listed, suspended_until, offense_count), reviewer:reviewed_by(id, firstname, surname)"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function adminReviewLoginRecoveryRequest({ requestId, decision, adminResponse, requesterEmail }) {
  let resolvedResponse = String(adminResponse || "").trim();

  if (decision === "approved") {
    await sendPasswordResetLink(requesterEmail);
    resolvedResponse = resolvedResponse
      ? `${resolvedResponse}\nPassword reset link was sent to the requester email.`
      : "Password reset link was sent to the requester email.";
  }

  const { data, error } = await supabase.rpc("admin_review_login_recovery_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_admin_response: resolvedResponse || null
  });
  if (error) throw error;
  return data;
}

export async function listLoginAttemptSummaryForAdmin() {
  const { data, error } = await supabase.rpc("list_login_attempt_summary_for_admin");
  if (error) throw error;
  return data || [];
}

export async function listLoginAttemptLogsForAdmin({ attemptedEmail, limit = 40 }) {
  const { data, error } = await supabase.rpc("list_login_attempt_logs_for_admin", {
    p_attempted_email: attemptedEmail || null,
    p_limit: limit
  });
  if (error) throw error;
  return data || [];
}

export async function getAdminPendingItemsCount() {
  const [supportRes, recoveryRes, reportRes] = await Promise.all([
    supabase.from("account_support_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("login_recovery_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("user_reports").select("id", { count: "exact", head: true }).eq("status", "submitted")
  ]);

  if (supportRes.error) throw supportRes.error;
  if (recoveryRes.error) throw recoveryRes.error;
  if (reportRes.error) throw reportRes.error;

  const supportPending = Number(supportRes.count || 0);
  const recoveryPending = Number(recoveryRes.count || 0);
  const reportsPending = Number(reportRes.count || 0);

  return {
    supportPending,
    recoveryPending,
    reportsPending,
    total: supportPending + recoveryPending + reportsPending
  };
}

export async function adminUpdateReport({
  reportId,
  status,
  reviewNote,
  sanctionAction = "none",
  suspendDays = null
}) {
  const { data, error } = await supabase.rpc("admin_update_user_report", {
    p_report_id: reportId,
    p_status: status,
    p_review_note: reviewNote || null,
    p_sanction_action: sanctionAction || "none",
    p_suspend_days: sanctionAction === "suspend" ? Number(suspendDays || 0) : null
  });
  if (error) throw error;
  return data;
}

export async function adminReviewSupportRequest({ requestId, decision, adminResponse, liftRestriction }) {
  const { data, error } = await supabase.rpc("admin_review_account_support_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_admin_response: adminResponse || null,
    p_lift_restriction: !!liftRestriction
  });
  if (error) throw error;
  return data;
}

export async function adminLiftUserRestriction({ userId, reason }) {
  const { data, error } = await supabase.rpc("admin_lift_user_restriction", {
    p_user_id: userId,
    p_reason: reason || null
  });
  if (error) throw error;
  return data;
}

export async function adminSetUserAdmin({ userId, makeAdmin }) {
  const { data, error } = await supabase.rpc("admin_set_user_admin", {
    p_user_id: userId,
    p_make_admin: !!makeAdmin
  });
  if (error) throw error;
  return data;
}

export async function adminDeleteUser({ userId, reason }) {
  const { data, error } = await supabase.rpc("admin_delete_user", {
    p_user_id: userId,
    p_reason: reason || null
  });
  if (error) throw error;
  return data;
}

export async function listReportsAgainstUser(userId) {
  const { data, error } = await supabase
    .from("user_reports")
    .select(
      "id, reporter_id, reported_user_id, job_id, reason_type, reason_details, status, review_note, reviewed_at, created_at, reporter:reporter_id(id, firstname, middlename, surname, suffix, avatar_url), job:job_id(id, title, status)"
    )
    .eq("reported_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listMySupportRequests(userId) {
  const { data, error } = await supabase
    .from("account_support_requests")
    .select(
      "id, request_type, report_id, reason_details, status, admin_response, reviewed_at, created_at, reviewer:reviewed_by(id, firstname, surname), report:report_id(id, reason_type, reason_details, status, created_at)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function submitAccountSupportRequest({ requestType, reasonDetails, reportId = null }) {
  const { data, error } = await supabase.rpc("submit_account_support_request", {
    p_request_type: requestType,
    p_reason_details: reasonDetails,
    p_report_id: reportId
  });
  if (error) throw error;
  return data;
}
