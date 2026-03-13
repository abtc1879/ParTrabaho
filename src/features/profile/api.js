import { supabase } from "../../lib/supabaseClient";

export async function getProfileById(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertProfile(profile) {
  const { data, error } = await supabase.from("profiles").upsert(profile).select().single();
  if (error) throw error;
  return data;
}

export async function uploadAvatar(userId, file) {
  const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `public/${userId}/avatar-${Date.now()}.${fileExt}`;
  const bucket = "profile-photos";

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrl;
}

export async function uploadProfileAlbumPhoto(userId, file) {
  const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `public/${userId}/album-${Date.now()}.${fileExt}`;
  const bucket = "profile-photos";

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, { upsert: false });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrl;
}

export async function listProfileAlbumPhotos(userId) {
  const { data, error } = await supabase
    .from("profile_album_photos")
    .select("id, user_id, photo_url, caption, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addProfileAlbumPhoto({ userId, photoUrl, caption }) {
  const { data, error } = await supabase
    .from("profile_album_photos")
    .insert({
      user_id: userId,
      photo_url: photoUrl,
      caption: caption || null
    })
    .select("id, user_id, photo_url, caption, created_at")
    .single();
  if (error) throw error;
  return data;
}

function readSingle(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export async function listFreelancerCompletedJobsWithClientReviews(freelancerId) {
  const { data: applications, error: appError } = await supabase
    .from("job_applications")
    .select("job:job_id(id, title, status, completion:job_completions(completed_at))")
    .eq("freelancer_id", freelancerId)
    .eq("status", "accepted");

  if (appError) throw appError;

  const completedJobs = (applications || [])
    .map((row) => readSingle(row.job))
    .filter((job) => job && job.status === "completed");

  if (completedJobs.length === 0) return [];

  const jobIds = completedJobs.map((job) => job.id);

  const { data: reviews, error: reviewError } = await supabase
    .from("reviews")
    .select("id, job_id, stars, comment, created_at, reviewer:reviewer_id(id, firstname, middlename, surname, suffix, avatar_url)")
    .eq("reviewee_id", freelancerId)
    .eq("reviewee_role", "freelancer")
    .in("job_id", jobIds)
    .order("created_at", { ascending: false });

  if (reviewError) throw reviewError;

  const reviewByJobId = new Map(
    (reviews || []).map((review) => [
      review.job_id,
      {
        ...review,
        reviewer: readSingle(review.reviewer)
      }
    ])
  );

  return completedJobs.map((job) => ({
    job,
    review: reviewByJobId.get(job.id) || null
  }));
}

export async function listClientCompletedJobsWithFreelancerReviews(clientId) {
  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, title, status, completion:job_completions(completed_at)")
    .eq("client_id", clientId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (jobsError) throw jobsError;

  const completedJobs = (jobs || []).filter((job) => job && job.status === "completed");
  if (completedJobs.length === 0) return [];

  const jobIds = completedJobs.map((job) => job.id);

  const { data: reviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("id, job_id, stars, comment, created_at, reviewer:reviewer_id(id, firstname, middlename, surname, suffix, avatar_url)")
    .eq("reviewee_id", clientId)
    .eq("reviewee_role", "client")
    .in("job_id", jobIds)
    .order("created_at", { ascending: false });

  if (reviewsError) throw reviewsError;

  const reviewByJobId = new Map(
    (reviews || []).map((review) => [
      review.job_id,
      {
        ...review,
        reviewer: readSingle(review.reviewer)
      }
    ])
  );

  return completedJobs.map((job) => ({
    job,
    review: reviewByJobId.get(job.id) || null
  }));
}

export async function listSellerMarketplaceReviews(sellerId) {
  const { data, error } = await supabase
    .from("marketplace_reviews")
    .select(
      "id, product_id, buyer_id, stars, comment, created_at, buyer:buyer_id(id, firstname, middlename, surname, suffix, avatar_url), product:product_id(id, name, category, price_php, photo_url)"
    )
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((review) => ({
    ...review,
    buyer: readSingle(review.buyer),
    product: readSingle(review.product)
  }));
}

export async function listRentalReviewsByOwner(ownerId) {
  const { data, error } = await supabase
    .from("rental_reviews")
    .select(
      "id, rental_id, reviewer_id, owner_id, stars, comment, created_at, reviewer:reviewer_id(id, firstname, middlename, surname, suffix, avatar_url), rental:rental_id(id, title, category, location, price_php, photo_url)"
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((review) => ({
    ...review,
    reviewer: readSingle(review.reviewer),
    rental: readSingle(review.rental)
  }));
}

export async function listAccommodationReviewsByOwner(ownerId) {
  const { data, error } = await supabase
    .from("accommodation_reviews")
    .select(
      "id, accommodation_id, reviewer_id, owner_id, stars, comment, created_at, reviewer:reviewer_id(id, firstname, middlename, surname, suffix, avatar_url), accommodation:accommodation_id(id, title, category, location, price_php, price_min_php, price_max_php, photo_url)"
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((review) => ({
    ...review,
    reviewer: readSingle(review.reviewer),
    accommodation: readSingle(review.accommodation)
  }));
}

export async function listFreelancerProfiles() {
  const { data, error } = await supabase.rpc("list_freelancer_directory");

  if (error) throw error;
  return data || [];
}

export async function makeDirectOffer({ freelancerId, description, salaryPhp }) {
  const { data, error } = await supabase.rpc("make_direct_offer", {
    p_freelancer_id: freelancerId,
    p_description: description,
    p_salary_php: salaryPhp
  });

  if (error) throw error;
  return data;
}
