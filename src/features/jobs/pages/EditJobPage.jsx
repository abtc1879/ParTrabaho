import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PostJobForm } from "../components/PostJobForm";
import { getJobById, updateJob } from "../api";
import { useAuth } from "../../auth/AuthContext";

export function EditJobPage() {
  const { user } = useAuth();
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobById(jobId),
    enabled: !!jobId
  });

  async function handleUpdate(payload) {
    if (!jobId || !user) return;
    setError("");
    setSubmitting(true);
    try {
      await updateJob(jobId, payload);
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const job = jobQuery.data;
  const isOwner = job?.client_id === user?.id;
  const initialValues = job
    ? {
        title: job.title || "",
        description: job.description || "",
        required_skill: job.required_skill || "",
        category: job.category || "Others",
        salary_php: String(job.salary_php ?? ""),
        location: job.location || ""
      }
    : undefined;

  return (
    <section className="page">
      <h2>Edit Job Post</h2>
      <p className="muted">Update your job details so freelancers can review accurate information.</p>

      {jobQuery.isLoading ? <p className="muted">Loading job details...</p> : null}
      {jobQuery.isError ? <p className="feedback error">{jobQuery.error.message}</p> : null}
      {job && !isOwner ? <p className="feedback error">You are not allowed to edit this job.</p> : null}

      {job && isOwner ? (
        <PostJobForm initialValues={initialValues} onSubmit={handleUpdate} submitting={submitting} submitLabel="Save Changes" />
      ) : null}

      {error ? <p className="feedback error">{error}</p> : null}
    </section>
  );
}

