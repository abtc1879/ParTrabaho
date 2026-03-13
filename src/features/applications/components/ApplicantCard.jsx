import { formatAddress } from "../../profile/utils";

export function ApplicantCard({ application, canAccept, onAccept }) {
  const fullName = [application.profiles?.firstname, application.profiles?.surname].filter(Boolean).join(" ");

  return (
    <article className="card">
      <h3>{fullName || "Freelancer"}</h3>
      <p className="address-text">Address: {formatAddress(application.profiles, "No address available")}</p>
      <p>{application.cover_letter || "No cover letter provided."}</p>
      <p className="muted">Status: {application.status}</p>
      {canAccept && application.status === "pending" ? (
        <button className="btn btn-primary" type="button" onClick={() => onAccept(application.id)}>
          Hire Applicant
        </button>
      ) : null}
    </article>
  );
}
