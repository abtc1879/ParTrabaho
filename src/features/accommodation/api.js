import { supabase } from "../../lib/supabaseClient";

export async function listAccommodationListings() {
  const { data, error } = await supabase
    .from("accommodation_listings")
    .select(
      "id, owner_id, title, category, description, price_php, price_min_php, price_max_php, location, map_url, notes, photo_url, created_at, owner:owner_id(id, firstname, surname, avatar_url), photos:accommodation_listing_photos(id, photo_url, created_at), room_rates:accommodation_room_rates(id, classification, price_php, created_at)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createAccommodationListing({ ownerId, payload }) {
  const { data, error } = await supabase
    .from("accommodation_listings")
    .insert({
      owner_id: ownerId,
      title: payload.title,
      category: payload.category,
      description: payload.description || null,
      price_php: payload.priceMinPhp ?? payload.pricePhp ?? null,
      price_min_php: payload.priceMinPhp ?? payload.pricePhp ?? null,
      price_max_php: payload.priceMaxPhp ?? payload.pricePhp ?? null,
      location: payload.location,
      map_url: payload.mapUrl || null,
      notes: payload.notes || null,
      photo_url: payload.photoUrl || null
    })
    .select(
      "id, owner_id, title, category, description, price_php, price_min_php, price_max_php, location, map_url, notes, photo_url, created_at, owner:owner_id(id, firstname, surname, avatar_url), photos:accommodation_listing_photos(id, photo_url, created_at), room_rates:accommodation_room_rates(id, classification, price_php, created_at)"
    )
    .single();
  if (error) throw error;
  return data;
}

export async function updateAccommodationListing({ listingId, updates }) {
  const { data, error } = await supabase
    .from("accommodation_listings")
    .update(updates)
    .eq("id", listingId)
    .select(
      "id, owner_id, title, category, description, price_php, price_min_php, price_max_php, location, map_url, notes, photo_url, created_at, owner:owner_id(id, firstname, surname, avatar_url), photos:accommodation_listing_photos(id, photo_url, created_at), room_rates:accommodation_room_rates(id, classification, price_php, created_at)"
    )
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAccommodationListing(listingId) {
  const { error } = await supabase.from("accommodation_listings").delete().eq("id", listingId);
  if (error) throw error;
  return true;
}

export async function uploadAccommodationPhoto(userId, file) {
  const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `public/${userId}/accommodation-${Date.now()}.${fileExt}`;
  const bucket = "accommodation-photos";

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: false });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrl;
}

export async function addAccommodationListingPhotos({ accommodationId, ownerId, photoUrls }) {
  if (!photoUrls?.length) return [];
  const { data, error } = await supabase
    .from("accommodation_listing_photos")
    .insert(
      photoUrls.map((url) => ({
        accommodation_id: accommodationId,
        owner_id: ownerId,
        photo_url: url
      }))
    )
    .select("id, accommodation_id, photo_url, created_at");
  if (error) throw error;
  return data || [];
}

export async function addAccommodationRoomRates({ accommodationId, ownerId, roomRates }) {
  if (!roomRates?.length) return [];
  const payload = roomRates.map((rate) => ({
    accommodation_id: accommodationId,
    owner_id: ownerId,
    classification: rate.classification,
    price_php: rate.price_php
  }));
  const { data, error } = await supabase
    .from("accommodation_room_rates")
    .insert(payload)
    .select("id, accommodation_id, classification, price_php, created_at");
  if (error) throw error;
  return data || [];
}

export async function replaceAccommodationRoomRates({ accommodationId, ownerId, roomRates }) {
  const { error: deleteError } = await supabase.from("accommodation_room_rates").delete().eq("accommodation_id", accommodationId);
  if (deleteError) throw deleteError;
  return addAccommodationRoomRates({ accommodationId, ownerId, roomRates });
}

export async function getAccommodationReservation({ accommodationId, guestId }) {
  if (!accommodationId || !guestId) return null;
  const { data, error } = await supabase
    .from("accommodation_reservations")
    .select("id, accommodation_id, room_rate_id, owner_id, guest_id, status, last_reviewed_at, created_at, updated_at")
    .eq("accommodation_id", accommodationId)
    .eq("guest_id", guestId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAccommodationReservation({ accommodationId, roomRateId }) {
  const { data, error } = await supabase.rpc("create_accommodation_reservation", {
    p_accommodation_id: accommodationId,
    p_room_rate_id: roomRateId
  });
  if (error) throw error;
  return data;
}

export async function guestCancelAccommodationReservation({ reservationId }) {
  const { data, error } = await supabase.rpc("guest_cancel_accommodation_reservation", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function ownerCancelAccommodationReservation({ reservationId }) {
  const { data, error } = await supabase.rpc("owner_cancel_accommodation_reservation", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function ownerAcceptAccommodationReservation({ reservationId }) {
  const { data, error } = await supabase.rpc("owner_accept_accommodation_reservation", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function ownerCheckinAccommodationReservation({ reservationId }) {
  const { data, error } = await supabase.rpc("owner_checkin_accommodation_reservation", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function markAccommodationCheckedOut({ reservationId }) {
  const { data, error } = await supabase.rpc("mark_accommodation_checked_out", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function getMyAccommodationReview({ accommodationId, reviewerId }) {
  if (!accommodationId || !reviewerId) return null;
  const { data, error } = await supabase
    .from("accommodation_reviews")
    .select("id, accommodation_id, reviewer_id, owner_id, stars, comment, created_at")
    .eq("accommodation_id", accommodationId)
    .eq("reviewer_id", reviewerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function submitAccommodationReview({ reservationId, stars, comment }) {
  const { data, error } = await supabase.rpc("submit_accommodation_review", {
    p_reservation_id: reservationId,
    p_stars: Number(stars),
    p_comment: comment || null
  });
  if (error) throw error;
  return data;
}
