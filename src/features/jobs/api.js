import { supabase } from "../../lib/supabaseClient";

export async function listJobs(filters = {}, pagination = {}) {
  let query = supabase
    .from("jobs")
    .select(
      "*, client_profile:client_id(id, firstname, surname, avatar_url, address, barangay, city_municipality, province, rating_avg), completion:job_completions(completed_at)"
    )
    .order("created_at", { ascending: false });

  if (filters.location) {
    query = query.ilike("location", `%${filters.location}%`);
  }
  if (filters.skill) {
    query = query.ilike("required_skill", `%${filters.skill}%`);
  }
  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.onlyOpen) {
    query = query.eq("status", "open");
  }

  const page = Number(pagination.page || 1);
  const pageSize = Number(pagination.pageSize || 0);
  if (Number.isFinite(pageSize) && pageSize > 0) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const from = (safePage - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getJobById(jobId) {
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "*, client_profile:client_id(id, firstname, surname, avatar_url, address, barangay, city_municipality, province, rating_avg), completion:job_completions(completed_at)"
    )
    .eq("id", jobId)
    .single();
  if (error) throw error;
  return data;
}

export async function createJob(payload) {
  const { data, error } = await supabase.from("jobs").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateJob(jobId, payload) {
  const { data, error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", jobId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteJob(jobId) {
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) throw error;
}

export async function listReviewsForJobs(jobIds = []) {
  if (!Array.isArray(jobIds) || jobIds.length === 0) return [];

  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, job_id, stars, comment, reviewee_role, created_at, reviewer:reviewer_id(id, firstname, surname, avatar_url), reviewee:reviewee_id(id, firstname, surname, avatar_url)"
    )
    .in("job_id", jobIds)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
