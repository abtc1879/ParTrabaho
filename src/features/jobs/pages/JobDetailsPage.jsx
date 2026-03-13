import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJobById } from "../api";
import { applyToJob, listApplicants, acceptApplicant, hasActiveHire } from "../../applications/api";
import { ApplicantCard } from "../../applications/components/ApplicantCard";
import { useAuth } from "../../auth/AuthContext";
import { LoadingSkeleton } from "../../../components/common/LoadingSkeleton";

function getClientName(profile) {
  if (!profile) return "Client";
  const name = [profile.firstname, profile.surname].filter(Boolean).join(" ").trim();
  return name || "Client";
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "CL";
}

export function JobDetailsPage() {
  const { jobId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [coverLetter, setCoverLetter] = useState("");

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobById(jobId)
  });

  const applicantsQuery = useQuery({
    queryKey: ["job-applicants", jobId],
    queryFn: () => listApplicants(jobId),
    enabled: !!jobQuery.data?.id
  });

  const activeHireQuery = useQuery({
    queryKey: ["freelancer-active-hire", user?.id],
    queryFn: () => hasActiveHire(user.id),
    enabled: !!user?.id
  });

  const isClientOwner = useMemo(() => user?.id && jobQuery.data?.client_id === user.id, [user?.id, jobQuery.data?.client_id]);

  const applyMutation = useMutation({
    mutationFn: () =>
      applyToJob({
        jobId,
        freelancerId: user.id,
        coverLetter
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-applicants", jobId] });
      setCoverLetter("");
    }
  });

  const acceptMutation = useMutation({
    mutationFn: (applicationId) => acceptApplicant(applicationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["job", jobId] }),
        queryClient.invalidateQueries({ queryKey: ["job-applicants", jobId] })
      ]);
    }
  });

  if (jobQuery.isLoading) {
    return (
      <section className="page">
        <LoadingSkeleton lines={5} />
      </section>
    );
  }

  if (jobQuery.isError) {
    return (
      <section className="page">
        <p className="feedback error">{jobQuery.error.message}</p>
      </section>
    );
  }

  const job = jobQuery.data;
  const clientProfile = job.client_profile;
  const clientName = getClientName(clientProfile);
  const clientProfileLink = clientProfile?.id ? `/profiles/${clientProfile.id}` : "";
  const hasAnotherActiveHire = activeHireQuery.data === true;
  const canApply = user?.id && !isClientOwner && job.status === "open" && !hasAnotherActiveHire;

  return (
    <section className="page">
      <article className="card">
        <div className="job-row">
          <h2>{job.title}</h2>
          <span className={`pill ${job.status}`}>{job.status}</span>
        </div>

        <div className="job-poster">
          {clientProfileLink ? (
            <Link className="job-poster-avatar-link" to={clientProfileLink} aria-label={`View ${clientName} profile`}>
              {clientProfile?.avatar_url ? (
                <img className="job-poster-avatar" src={clientProfile.avatar_url} alt={clientName} />
              ) : (
                <span className="job-poster-avatar-fallback">{getInitials(clientName)}</span>
              )}
            </Link>
          ) : clientProfile?.avatar_url ? (
            <img className="job-poster-avatar" src={clientProfile.avatar_url} alt={clientName} />
          ) : (
            <span className="job-poster-avatar-fallback">{getInitials(clientName)}</span>
          )}
          <div className="job-poster-text">
            <p className="job-poster-label">Posted by</p>
            {clientProfileLink ? (
              <Link className="job-poster-name" to={clientProfileLink}>
                {clientName}
              </Link>
            ) : (
              <p className="job-poster-name">{clientName}</p>
            )}
          </div>
        </div>

        <p className="job-description">{job.description}</p>
        <div className="job-detail-grid">
          <div className="job-detail-item">
            <span className="job-detail-label">Category</span>
            <span className="job-detail-value">{job.category || "General"}</span>
          </div>
          <div className="job-detail-item">
            <span className="job-detail-label">Skill</span>
            <span className="job-detail-value">{job.required_skill}</span>
          </div>
          <div className="job-detail-item">
            <span className="job-detail-label">Location</span>
            <span className="job-detail-value">{job.location}</span>
          </div>
          <div className="job-detail-item salary">
            <span className="job-detail-label">Salary</span>
            <span className="job-detail-value">PHP {Number(job.salary_php || 0).toLocaleString()}</span>
          </div>
        </div>
      </article>

      {canApply ? (
        <div className="card form-grid">
          <label>
            Cover Letter (optional)
            <textarea
              rows={4}
              value={coverLetter}
              onChange={(event) => setCoverLetter(event.target.value)}
              placeholder="Tell the client why you are a good fit."
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? "Applying..." : "Apply"}
          </button>
          {applyMutation.isError ? <p className="feedback error">{applyMutation.error.message}</p> : null}
          {applyMutation.isSuccess ? <p className="feedback success">Application sent.</p> : null}
        </div>
      ) : null}
      {!isClientOwner && hasAnotherActiveHire ? (
        <p className="feedback error">You are currently hired on an active job and cannot apply to other jobs yet.</p>
      ) : null}

      {isClientOwner ? (
        <div className="stack">
          <h3>Applicants</h3>
          {applicantsQuery.isError ? <p className="feedback error">{applicantsQuery.error.message}</p> : null}
          {applicantsQuery.data?.map((application) => (
            <ApplicantCard
              key={application.id}
              application={application}
              canAccept={job.status === "open"}
              onAccept={(applicationId) => acceptMutation.mutate(applicationId)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
