import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PostJobForm } from "../components/PostJobForm";
import { createJob } from "../api";
import { useAuth } from "../../auth/AuthContext";

export function PostJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(payload) {
    if (!user) return;
    setError("");
    setSubmitting(true);
    try {
      const data = await createJob({
        ...payload,
        client_id: user.id
      });
      navigate(`/jobs/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page">
      <h2>Post a Part-Time Job</h2>
      <p className="muted">Fill out the details so freelancers can quickly apply.</p>
      <PostJobForm onSubmit={handleCreate} submitting={submitting} />
      {error ? <p className="feedback error">{error}</p> : null}
    </section>
  );
}
