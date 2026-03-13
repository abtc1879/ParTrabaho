import { supabase } from "../../lib/supabaseClient";

export async function applyToJob({ jobId, freelancerId, coverLetter }) {
  const { data, error } = await supabase
    .from("job_applications")
    .insert({
      job_id: jobId,
      freelancer_id: freelancerId,
      cover_letter: coverLetter || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listApplicants(jobId) {
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "*, profiles:freelancer_id(id, firstname, surname, address, barangay, city_municipality, province, avatar_url, rating_avg)"
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function acceptApplicant(applicationId) {
  const { data, error } = await supabase.rpc("accept_job_application", {
    application_id: applicationId
  });
  if (error) throw error;
  return data;
}

export async function declineApplicant(applicationId) {
  const { data, error } = await supabase
    .from("job_applications")
    .update({ status: "rejected" })
    .eq("id", applicationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This application is already processed.");
  return data;
}

export async function hasActiveHire(freelancerId) {
  const { data, error } = await supabase
    .from("job_applications")
    .select("id, jobs!inner(id, status)")
    .eq("freelancer_id", freelancerId)
    .eq("status", "accepted")
    .in("jobs.status", ["assigned", "in_progress"])
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}
