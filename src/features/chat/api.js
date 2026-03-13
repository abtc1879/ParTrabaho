import { supabase } from "../../lib/supabaseClient";

export async function listConversations(userId) {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, job_id, product_id, rental_id, accommodation_id, client_id, freelancer_id, created_at, job:job_id(id, title, status), product:product_id(id, name, category, price_php, stock, sold_out, location, map_url, photo_url), rental:rental_id(id, title, category, price_php, location, map_url, photo_url, is_reserved, is_rented), accommodation:accommodation_id(id, title, category, price_php, location, map_url, photo_url), client_profile:client_id(id, firstname, surname, avatar_url, rating_avg, rating_count, client_rating_avg, client_rating_count, freelancer_rating_avg, freelancer_rating_count), freelancer_profile:freelancer_id(id, firstname, surname, avatar_url, rating_avg, rating_count, client_rating_avg, client_rating_count, freelancer_rating_avg, freelancer_rating_count)"
    )
    .or(`client_id.eq.${userId},freelancer_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getConversationById(conversationId) {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, job_id, product_id, rental_id, accommodation_id, client_id, freelancer_id, created_at, job:job_id(id, title, description, status, location, salary_php, is_direct_offer), product:product_id(id, name, category, specification, price_php, stock, sold_out, location, map_url, notes, photo_url, photos:marketplace_product_photos(id, photo_url, created_at)), rental:rental_id(id, title, category, description, price_php, location, map_url, notes, photo_url, is_reserved, is_rented, photos:rental_listing_photos(id, photo_url, created_at)), accommodation:accommodation_id(id, title, category, description, price_php, price_min_php, price_max_php, location, map_url, notes, photo_url, photos:accommodation_listing_photos(id, photo_url, created_at), room_rates:accommodation_room_rates(id, classification, price_php, created_at)), client_profile:client_id(id, firstname, surname, avatar_url), freelancer_profile:freelancer_id(id, firstname, surname, avatar_url)"
    )
    .eq("id", conversationId)
    .single();
  if (error) throw error;
  return data;
}

export async function listMessages(conversationId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*, sender:sender_id(id, firstname, surname, avatar_url)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendMessage({ conversationId, senderId, body }) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: body ?? ""
    })
    .select("*, sender:sender_id(id, firstname, surname, avatar_url)")
    .single();
  if (error) throw error;
  return data;
}

export async function uploadChatImage({ userId, conversationId, file }) {
  if (!userId) throw new Error("Missing user id for image upload.");
  if (!file) throw new Error("Missing image file.");
  const fileExt = (file.name.split(".").pop() || file.type.split("/")[1] || "jpg").toLowerCase();
  const bucket = "chat-media";
  const filePath = `public/${userId}/${conversationId || "general"}/chat-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: false });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrl;
}

export async function deleteConversation(conversationId) {
  const { error } = await supabase.from("conversations").delete().eq("id", conversationId);
  if (error) throw error;
  return true;
}

export async function deleteConversations({ userId, conversationIds }) {
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) return 0;
  let query = supabase.from("conversations").delete().in("id", conversationIds);
  if (userId) {
    query = query.or(`client_id.eq.${userId},freelancer_id.eq.${userId}`);
  }
  const { error } = await query;
  if (error) throw error;
  return conversationIds.length;
}

export async function getUnreadMessagesCount() {
  const { data, error } = await supabase.rpc("get_unread_messages_count");
  if (error) throw error;
  return Number(data || 0);
}

export async function markConversationMessagesRead(conversationId) {
  const { data, error } = await supabase.rpc("mark_conversation_messages_read", {
    p_conversation_id: conversationId
  });
  if (error) throw error;
  return Number(data || 0);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

export async function openMarketplaceConversation({ productId, sellerId, buyerId }) {
  if (!isUuid(productId) || !isUuid(sellerId) || !isUuid(buyerId)) return "";
  if (sellerId === buyerId) return "";

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id")
    .eq("product_id", productId)
    .eq("client_id", sellerId)
    .eq("freelancer_id", buyerId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from("conversations")
    .insert({
      job_id: null,
      product_id: productId,
      client_id: sellerId,
      freelancer_id: buyerId
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: duplicateSafe, error: duplicateSafeError } = await supabase
        .from("conversations")
        .select("id")
        .eq("product_id", productId)
        .eq("client_id", sellerId)
        .eq("freelancer_id", buyerId)
        .maybeSingle();
      if (duplicateSafeError) throw duplicateSafeError;
      return duplicateSafe?.id || "";
    }
    throw insertError;
  }

  return inserted?.id || "";
}

export async function openRentalConversation({ rentalId, ownerId, renterId }) {
  if (!isUuid(rentalId) || !isUuid(ownerId) || !isUuid(renterId)) return "";
  if (ownerId === renterId) return "";

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id")
    .eq("rental_id", rentalId)
    .eq("client_id", ownerId)
    .eq("freelancer_id", renterId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from("conversations")
    .insert({
      job_id: null,
      product_id: null,
      rental_id: rentalId,
      client_id: ownerId,
      freelancer_id: renterId
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: duplicateSafe, error: duplicateSafeError } = await supabase
        .from("conversations")
        .select("id")
        .eq("rental_id", rentalId)
        .eq("client_id", ownerId)
        .eq("freelancer_id", renterId)
        .maybeSingle();
      if (duplicateSafeError) throw duplicateSafeError;
      return duplicateSafe?.id || "";
    }
    throw insertError;
  }

  return inserted?.id || "";
}

export async function openAccommodationConversation({ accommodationId, ownerId, guestId }) {
  if (!isUuid(accommodationId) || !isUuid(ownerId) || !isUuid(guestId)) return "";
  if (ownerId === guestId) return "";

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id")
    .eq("accommodation_id", accommodationId)
    .eq("client_id", ownerId)
    .eq("freelancer_id", guestId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from("conversations")
    .insert({
      job_id: null,
      product_id: null,
      rental_id: null,
      accommodation_id: accommodationId,
      client_id: ownerId,
      freelancer_id: guestId
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: duplicateSafe, error: duplicateSafeError } = await supabase
        .from("conversations")
        .select("id")
        .eq("accommodation_id", accommodationId)
        .eq("client_id", ownerId)
        .eq("freelancer_id", guestId)
        .maybeSingle();
      if (duplicateSafeError) throw duplicateSafeError;
      return duplicateSafe?.id || "";
    }
    throw insertError;
  }

  return inserted?.id || "";
}

export async function getJobCompletion(jobId) {
  const { data, error } = await supabase.from("job_completions").select("*").eq("job_id", jobId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function markJobFinished(jobId) {
  const { data, error } = await supabase.rpc("mark_job_finished", {
    p_job_id: jobId
  });
  if (error) throw error;
  return data;
}

export async function listMyJobReviews({ jobId, reviewerId }) {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, job_id, reviewer_id, reviewee_id, reviewee_role, stars, comment, created_at")
    .eq("job_id", jobId)
    .eq("reviewer_id", reviewerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function submitJobReview({ jobId, revieweeId, stars, comment }) {
  const { data, error } = await supabase.rpc("submit_job_review", {
    p_job_id: jobId,
    p_reviewee_id: revieweeId,
    p_stars: stars,
    p_comment: comment || null
  });
  if (error) throw error;
  return data;
}

export async function respondDirectOffer({ jobId, action }) {
  const { data, error } = await supabase.rpc("respond_direct_offer", {
    p_job_id: jobId,
    p_action: action
  });
  if (error) throw error;
  return data;
}

export async function updateDirectOffer({ jobId, description, salaryPhp }) {
  if (!jobId) {
    throw new Error("Offer update failed: missing job id.");
  }
  const { data, error } = await supabase.rpc("update_direct_offer", {
    p_job_id: jobId,
    p_description: description,
    p_salary_php: salaryPhp
  });
  if (error) {
    const message = error?.message || "";
    if (error.code === "PGRST202" || message.includes("Could not find the function")) {
      throw new Error(
        "Offer update failed because the server RPC is missing. Apply migration 0027_update_direct_offer_by_job_id.sql and refresh the Supabase API schema."
      );
    }
    throw error;
  }
  return data;
}

export async function getMyReportAgainstUserForJob({ jobId, reporterId, reportedUserId }) {
  const { data, error } = await supabase
    .from("user_reports")
    .select("id, status, created_at, reviewed_at, review_note")
    .eq("job_id", jobId)
    .eq("reporter_id", reporterId)
    .eq("reported_user_id", reportedUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function submitUserReport({ reportedUserId, jobId, reasonType, reasonDetails }) {
  const { data, error } = await supabase.rpc("submit_user_report", {
    p_reported_user_id: reportedUserId,
    p_job_id: jobId,
    p_reason_type: reasonType,
    p_reason_details: reasonDetails
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("You already reported this user for this job. Pending admin approval.");
    }
    throw error;
  }
  return data;
}
