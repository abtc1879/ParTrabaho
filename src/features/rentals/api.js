import { supabase } from "../../lib/supabaseClient";

export async function listRentalListings() {
  const { data, error } = await supabase
    .from("rental_listings")
    .select(
      "id, owner_id, title, category, description, price_php, location, map_url, notes, photo_url, is_reserved, is_rented, created_at, owner:owner_id(id, firstname, surname, avatar_url), photos:rental_listing_photos(id, photo_url, created_at)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createRentalListing({ ownerId, payload }) {
  const { data, error } = await supabase
    .from("rental_listings")
    .insert({
      owner_id: ownerId,
      title: payload.title,
      category: payload.category,
      description: payload.description || null,
      price_php: payload.pricePhp,
      location: payload.location,
      map_url: payload.mapUrl || null,
      notes: payload.notes || null,
      photo_url: payload.photoUrl || null
    })
    .select(
      "id, owner_id, title, category, description, price_php, location, map_url, notes, photo_url, is_reserved, is_rented, created_at, owner:owner_id(id, firstname, surname, avatar_url), photos:rental_listing_photos(id, photo_url, created_at)"
    )
    .single();
  if (error) throw error;
  return data;
}

export async function updateRentalListing({ rentalId, updates }) {
  const { data, error } = await supabase
    .from("rental_listings")
    .update(updates)
    .eq("id", rentalId)
    .select(
      "id, owner_id, title, category, description, price_php, location, map_url, notes, photo_url, is_reserved, is_rented, created_at, owner:owner_id(id, firstname, surname, avatar_url), photos:rental_listing_photos(id, photo_url, created_at)"
    )
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRentalListing(rentalId) {
  const { error } = await supabase.from("rental_listings").delete().eq("id", rentalId);
  if (error) throw error;
  return true;
}

export async function uploadRentalPhoto(userId, file) {
  const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `public/${userId}/rental-${Date.now()}.${fileExt}`;
  const bucket = "rental-photos";

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: false });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrl;
}

export async function addRentalListingPhotos({ rentalId, ownerId, photoUrls }) {
  if (!photoUrls?.length) return [];
  const { data, error } = await supabase
    .from("rental_listing_photos")
    .insert(
      photoUrls.map((url) => ({
        rental_id: rentalId,
        owner_id: ownerId,
        photo_url: url
      }))
    )
    .select("id, rental_id, photo_url, created_at");
  if (error) throw error;
  return data || [];
}

export async function getRentalReservation({ rentalId, renterId }) {
  if (!rentalId || !renterId) return null;
  const { data, error } = await supabase
    .from("rental_reservations")
    .select("id, rental_id, owner_id, renter_id, days, include_driver, status, completed_at, created_at, updated_at")
    .eq("rental_id", rentalId)
    .eq("renter_id", renterId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createRentalReservation({ rentalId, days, includeDriver }) {
  const { data, error } = await supabase.rpc("create_rental_reservation", {
    p_rental_id: rentalId,
    p_days: Number(days),
    p_include_driver: !!includeDriver
  });
  if (error) throw error;
  return data;
}

export async function ownerUpdateRentalReservation({ reservationId, decision }) {
  const { data, error } = await supabase.rpc("owner_update_rental_reservation", {
    p_reservation_id: reservationId,
    p_decision: decision
  });
  if (error) throw error;
  return data;
}

export async function renterUpdateRentalReservation({ reservationId, days, includeDriver }) {
  const { data, error } = await supabase.rpc("renter_update_rental_reservation", {
    p_reservation_id: reservationId,
    p_days: Number(days),
    p_include_driver: !!includeDriver
  });
  if (error) throw error;
  return data;
}

export async function renterCancelRentalReservation({ reservationId }) {
  const { data, error } = await supabase.rpc("renter_cancel_rental_reservation", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function ownerMarkRentalRented({ reservationId }) {
  const { data, error } = await supabase.rpc("owner_mark_rental_rented", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function ownerMarkRentalDone({ reservationId }) {
  const { data, error } = await supabase.rpc("owner_mark_rental_reservation_done", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function markRentalReservationDone({ reservationId }) {
  const { data, error } = await supabase.rpc("mark_rental_reservation_done", {
    p_reservation_id: reservationId
  });
  if (error) throw error;
  return data;
}

export async function getMyRentalReview({ reservationId, reviewerId }) {
  if (!reservationId || !reviewerId) return null;
  const { data, error } = await supabase
    .from("rental_reviews")
    .select("id, reservation_id, rental_id, reviewer_id, owner_id, stars, comment, created_at")
    .eq("reservation_id", reservationId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function submitRentalReview({ reservationId, stars, comment }) {
  const { data, error } = await supabase.rpc("submit_rental_review", {
    p_reservation_id: reservationId,
    p_stars: Number(stars),
    p_comment: comment || null
  });
  if (error) throw error;
  return data;
}
