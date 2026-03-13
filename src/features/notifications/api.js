import { supabase } from "../../lib/supabaseClient";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

export async function listNotifications(userId) {
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!notifications?.length) return [];

  const applicationIds = notifications
    .filter((item) => item.type === "job_application" && item.data?.application_id)
    .map((item) => item.data.application_id)
    .filter((id) => isUuid(id));

  if (!applicationIds.length) return notifications;

  const { data: applications, error: applicationsError } = await supabase
    .from("job_applications")
    .select("id, status, job_id, freelancer_id, cover_letter, profiles:freelancer_id(id, firstname, surname, avatar_url)")
    .in("id", applicationIds);

  if (applicationsError) throw applicationsError;

  const applicationsById = new Map((applications || []).map((application) => [application.id, application]));

  return notifications.map((notification) => {
    const applicationId = notification.data?.application_id;
    if (!applicationId) return notification;
    return {
      ...notification,
      application: applicationsById.get(applicationId) || null
    };
  });
}

export async function markNotificationRead(notificationId) {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNotifications({ userId, notificationIds }) {
  if (!userId) {
    throw new Error("Missing user id for notification deletion.");
  }
  if (!Array.isArray(notificationIds) || notificationIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .in("id", notificationIds)
    .eq("user_id", userId)
    .select("id");
  if (error) throw error;
  if (!data?.length) {
    throw new Error("No notifications were deleted. Please try again.");
  }
  return data.length;
}

export async function submitReportAppealFromNotification({ reportId, reasonDetails }) {
  const { data, error } = await supabase.rpc("submit_account_support_request", {
    p_request_type: "appeal",
    p_reason_details: reasonDetails,
    p_report_id: reportId
  });
  if (error) throw error;
  return data;
}

export async function openDirectOfferConversation({ jobId, clientId, freelancerId }) {
  if (!isUuid(jobId) || !isUuid(freelancerId)) return "";

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  let resolvedClientId = clientId;
  if (!isUuid(resolvedClientId)) {
    const { data: jobRow, error: jobError } = await supabase.from("jobs").select("client_id").eq("id", jobId).maybeSingle();
    if (jobError) throw jobError;
    resolvedClientId = jobRow?.client_id || "";
  }

  if (!isUuid(resolvedClientId)) return "";

  const { data: inserted, error: insertError } = await supabase
    .from("conversations")
    .insert({
      job_id: jobId,
      client_id: resolvedClientId,
      freelancer_id: freelancerId
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: duplicateSafe, error: duplicateSafeError } = await supabase
        .from("conversations")
        .select("id")
        .eq("job_id", jobId)
        .maybeSingle();
      if (duplicateSafeError) throw duplicateSafeError;
      return duplicateSafe?.id || "";
    }
    throw insertError;
  }

  return inserted?.id || "";
}

export async function getConversationIdByJob(jobId) {
  if (!isUuid(jobId)) return "";

  const { data, error } = await supabase.from("conversations").select("id").eq("job_id", jobId).maybeSingle();
  if (error) throw error;
  return data?.id || "";
}

export async function getRentalReservationById(reservationId) {
  if (!isUuid(reservationId)) return null;
  const { data, error } = await supabase
    .from("rental_reservations")
    .select("id, rental_id, owner_id, renter_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAccommodationReservationById(reservationId) {
  if (!isUuid(reservationId)) return null;
  const { data, error } = await supabase
    .from("accommodation_reservations")
    .select("id, accommodation_id, owner_id, guest_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
