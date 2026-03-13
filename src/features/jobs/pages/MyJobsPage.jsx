import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteJob, listJobs, listReviewsForJobs } from "../api";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../../components/common/EmptyState";

function formatStars(value) {
  const safe = Math.max(0, Math.min(5, Number(value || 0)));
  return `${"\u2605".repeat(safe)}${"\u2606".repeat(5 - safe)}`;
}

export function MyJobsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deletingJobId, setDeletingJobId] = useState("");

  const jobsQuery = useQuery({
    queryKey: ["my-jobs", user?.id],
    queryFn: async () => {
      const jobs = await listJobs();
      return jobs.filter((job) => job.client_id === user?.id);
    },
    enabled: !!user?.id
  });

  const myJobIds = useMemo(() => (jobsQuery.data || []).map((job) => job.id), [jobsQuery.data]);

  const reviewsQuery = useQuery({
    queryKey: ["posted-job-reviews", user?.id, myJobIds],
    queryFn: () => listReviewsForJobs(myJobIds),
    enabled: !!user?.id && myJobIds.length > 0
  });

  const reviewsByJobId = useMemo(() => {
    const grouped = {};
    for (const review of reviewsQuery.data || []) {
      if (!grouped[review.job_id]) grouped[review.job_id] = [];
      grouped[review.job_id].push(review);
    }
    return grouped;
  }, [reviewsQuery.data]);

  const deleteMutation = useMutation({
    mutationFn: (jobId) => deleteJob(jobId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-jobs", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] })
      ]);
    },
    onSettled: () => {
      setDeletingJobId("");
    }
  });

  async function handleDeleteCompleted(jobId) {
    const confirmed = window.confirm("Delete this completed job post?");
    if (!confirmed) return;

    setDeletingJobId(jobId);
    try {
      await deleteMutation.mutateAsync(jobId);
    } catch {
      // Error is shown via mutation error state.
    }
  }

  return (
    <section className="page">
      <h2>My Job Posts</h2>
      {deleteMutation.isError ? <p className="feedback error">{deleteMutation.error.message}</p> : null}
      {jobsQuery.data?.length === 0 ? (
        <EmptyState title="No posts yet" description="Post your first part-time job from the Find Part-time Job tab." />
      ) : null}
      {reviewsQuery.isError ? <p className="feedback error">{reviewsQuery.error.message}</p> : null}

      <div className="stack">
        {jobsQuery.data?.map((job) => {
          const freelancerFeedback = (reviewsByJobId[job.id] || []).filter((review) => review.reviewee_role === "client");

          return (
            <article key={job.id} className="card job-review-panel">
              <div className="job-review-head">
                <h4>{job.title || "Job Post"}</h4>
                <div className="job-review-actions">
                  <Link className="btn btn-secondary" to={`/jobs/${job.id}/edit`}>
                    Edit
                  </Link>
                  {job.status === "completed" ? (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => handleDeleteCompleted(job.id)}
                      disabled={deletingJobId === job.id}
                    >
                      {deletingJobId === job.id ? "Deleting..." : "Delete Completed Job"}
                    </button>
                  ) : null}
                </div>
              </div>

              <p className="job-post-description">{job.description || "No description provided."}</p>

              {reviewsQuery.isLoading ? <p className="muted">Loading reviews...</p> : null}
              {!reviewsQuery.isLoading && freelancerFeedback.length === 0 ? (
                <p className="muted">No freelancer rating/comment yet for this job.</p>
              ) : null}

              {freelancerFeedback.map((review) => (
                <div key={review.id} className="job-review-item compact">
                  <p className="job-review-stars-only">
                    {formatStars(review.stars)} <span>{review.stars}/5</span>
                  </p>
                  <p className="job-review-comment">{review.comment || "No comment provided."}</p>
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}
