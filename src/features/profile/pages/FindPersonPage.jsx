import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { getProfileById, listFreelancerProfiles, makeDirectOffer } from "../api";
import { EmptyState } from "../../../components/common/EmptyState";
import { formatAddress } from "../utils";

function fullName(profile) {
  return [profile.firstname, profile.middlename, profile.surname, profile.suffix].filter(Boolean).join(" ").trim() || "Freelancer";
}

function formatRating(profile) {
  const roleCount = Number(profile.freelancer_rating_count || 0);
  const roleAvg = Number(profile.freelancer_rating_avg || 0);
  if (roleCount > 0) return `★ ${roleAvg.toFixed(1)} (${roleCount})`;

  const fallbackCount = Number(profile.rating_count || 0);
  const fallbackAvg = Number(profile.rating_avg || 0);
  if (fallbackCount > 0) return `★ ${fallbackAvg.toFixed(1)} (${fallbackCount})`;

  return "No ratings yet";
}

function expertiseText(profile) {
  return Array.isArray(profile.expertise) && profile.expertise.length > 0 ? profile.expertise.join(" / ") : "No expertise listed";
}

function initialsFromName(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function ratingValue(profile) {
  const roleCount = Number(profile.freelancer_rating_count || 0);
  const roleAvg = Number(profile.freelancer_rating_avg || 0);
  if (roleCount > 0) return roleAvg;
  return Number(profile.rating_avg || 0);
}

function normalizeLocationTokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[\s,.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function locationScore(candidate, userAddress) {
  if (!candidate || !userAddress) return 0;
  const candidateTokens = new Set(normalizeLocationTokens(candidate));
  const userTokens = normalizeLocationTokens(userAddress);
  let score = 0;
  userTokens.forEach((token) => {
    if (candidateTokens.has(token)) {
      score += 1;
    }
  });
  return score;
}

export function FindPersonPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [nameFilter, setNameFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [skillDraft, setSkillDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [sortDraft, setSortDraft] = useState("default");
  const [offerTargetId, setOfferTargetId] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [offerSalary, setOfferSalary] = useState("");
  const [offerSuccessMessage, setOfferSuccessMessage] = useState("");

  const freelancersQuery = useQuery({
    queryKey: ["freelancer-profiles"],
    queryFn: listFreelancerProfiles
  });

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => getProfileById(user.id),
    enabled: !!user?.id
  });

  const offerMutation = useMutation({
    mutationFn: ({ freelancerId, description, salaryPhp }) =>
      makeDirectOffer({ freelancerId, description, salaryPhp }),
    onSuccess: () => {
      setOfferSuccessMessage("Offer sent successfully.");
      queryClient.invalidateQueries({ queryKey: ["freelancer-profiles"] });
      setOfferTargetId("");
      setOfferDescription("");
      setOfferSalary("");
    }
  });

  const filteredProfiles = useMemo(() => {
    const nameTerm = nameFilter.trim().toLowerCase();
    const skillTerm = skillFilter.trim().toLowerCase();
    const locationTerm = locationFilter.trim().toLowerCase();

    let filtered = (freelancersQuery.data || []).filter((profile) => {
      if (!profile || profile.id === user?.id) return false;
      if (profile.is_currently_hired) return false;

      const candidateName = fullName(profile).toLowerCase();
      const candidateSkills = expertiseText(profile).toLowerCase();
      const candidateAddress = formatAddress(profile, "").toLowerCase();

      const matchName = !nameTerm || candidateName.includes(nameTerm);
      const matchSkill = !skillTerm || candidateSkills.includes(skillTerm);
      const matchLocation = !locationTerm || candidateAddress.includes(locationTerm);

      return matchName && matchSkill && matchLocation;
    });
    if (sortBy !== "default") {
      const userAddress = formatAddress(profileQuery.data, "");
      filtered = [...filtered].sort((a, b) => {
        if (sortBy === "rating_high") return ratingValue(b) - ratingValue(a);
        if (sortBy === "rating_low") return ratingValue(a) - ratingValue(b);
        if (sortBy === "location_near")
          return locationScore(formatAddress(b, ""), userAddress) - locationScore(formatAddress(a, ""), userAddress);
        if (sortBy === "location_far")
          return locationScore(formatAddress(a, ""), userAddress) - locationScore(formatAddress(b, ""), userAddress);
        return 0;
      });
    }
    return filtered;
  }, [freelancersQuery.data, nameFilter, skillFilter, locationFilter, sortBy, user?.id, profileQuery.data]);

  const skillOptions = useMemo(() => {
    const items = freelancersQuery.data || [];
    const unique = new Set();
    items.forEach((profile) => {
      (profile.expertise || []).forEach((skill) => {
        const trimmed = String(skill || "").trim();
        if (trimmed) unique.add(trimmed);
      });
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [freelancersQuery.data]);

  const locationOptions = useMemo(() => {
    const items = freelancersQuery.data || [];
    const unique = new Set(items.map((profile) => formatAddress(profile, "")).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [freelancersQuery.data]);

  return (
    <section className="page">
      <h2>Find Person</h2>

      <div className="card find-person-filters">
        <div className="marketplace-filter-head">
          <h3>Search Freelancers</h3>
        </div>
        <div className="marketplace-filter-search">
          <label>
            <span className="sr-only">Search</span>
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Search freelancer name"
            />
          </label>
        </div>
        <div className="find-person-filter-grid">
          <label>
            Skill / Expertise
            <input
              list="find-person-skill-options"
              value={skillDraft}
              onChange={(event) => setSkillDraft(event.target.value)}
              placeholder="Search or select skill"
            />
            <datalist id="find-person-skill-options">
              <option value="">All Skills</option>
              {skillOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Location
            <input
              list="find-person-location-options"
              value={locationDraft}
              onChange={(event) => setLocationDraft(event.target.value)}
              placeholder="Search or select location"
            />
            <datalist id="find-person-location-options">
              <option value="">All Locations</option>
              {locationOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Sort By
            <select value={sortDraft} onChange={(event) => setSortDraft(event.target.value)}>
              <option value="default">Default</option>
              <option value="location_near">Location: Nearest</option>
              <option value="location_far">Location: Farthest</option>
              <option value="rating_high">Rating: High to Low</option>
              <option value="rating_low">Rating: Low to High</option>
            </select>
          </label>
        </div>
        <div className="marketplace-filter-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={
              nameDraft === nameFilter &&
              skillDraft === skillFilter &&
              locationDraft === locationFilter &&
              sortDraft === sortBy
            }
            onClick={() => {
              setNameFilter(nameDraft);
              setSkillFilter(skillDraft);
              setLocationFilter(locationDraft);
              setSortBy(sortDraft);
            }}
          >
            Apply Filters
          </button>
          <p className="find-person-results-count">{filteredProfiles.length} freelancer(s) matched</p>
        </div>
      </div>

      {freelancersQuery.isLoading ? <p className="muted">Loading freelancers...</p> : null}
      {freelancersQuery.isError ? <p className="feedback error">{freelancersQuery.error.message}</p> : null}
      {offerMutation.isError ? <p className="feedback error">{offerMutation.error.message}</p> : null}
      {offerSuccessMessage ? <p className="feedback success">{offerSuccessMessage}</p> : null}

      {!freelancersQuery.isLoading && filteredProfiles.length === 0 ? (
        <EmptyState title="No suitable freelancers found" description="Try adjusting name, skill, or location filters." />
      ) : null}

      <div className="stack">
        {filteredProfiles.map((profile) => {
          const name = fullName(profile);
          const skills = expertiseText(profile);
          const rating = formatRating(profile);

          return (
            <article key={profile.id} className="card find-person-card">
              <div className="find-person-head">
                {profile.avatar_url ? (
                  <img className="find-person-avatar" src={profile.avatar_url} alt={name} />
                ) : (
                  <span className="find-person-avatar-fallback">{initialsFromName(name)}</span>
                )}
                <div className="find-person-meta">
                  <h4>{name}</h4>
                  <p className="find-person-skills">{skills}</p>
                  <p className="find-person-rating">{rating}</p>
                </div>
              </div>
              <p className={`find-person-status ${profile.is_currently_hired ? "busy" : "available"}`}>
                {profile.is_currently_hired ? "Currently hired by a client" : "Available for new work"}
              </p>
              <p className="find-person-address">
                <strong>Address:</strong> {formatAddress(profile, "No address provided")}
              </p>
              <div className="find-person-actions">
                <Link className="btn btn-secondary" to={`/profiles/${profile.id}`}>
                  View Profile
                </Link>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setOfferSuccessMessage("");
                    setOfferTargetId((prev) => (prev === profile.id ? "" : profile.id));
                    setOfferDescription(profile.offer_description || "");
                    setOfferSalary(profile.offer_salary_php != null ? String(profile.offer_salary_php) : "");
                  }}
                >
                  {offerTargetId === profile.id
                    ? "Cancel"
                    : profile.has_direct_offer
                      ? "Edit Offer"
                      : "Make Offer"}
                </button>
              </div>

              {offerTargetId === profile.id ? (
                <form
                  className="find-person-offer-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const salaryPhp = Number(offerSalary);
                    if (!offerDescription.trim() || !salaryPhp || salaryPhp <= 0) return;
                    offerMutation.mutate({
                      freelancerId: profile.id,
                      description: offerDescription.trim(),
                      salaryPhp
                    });
                  }}
                >
                  <label>
                    Job Description
                    <textarea
                      rows={3}
                      value={offerDescription}
                      onChange={(event) => setOfferDescription(event.target.value)}
                      placeholder="Describe the work to be done"
                      required
                    />
                  </label>
                  <label>
                    Salary to be Paid (PHP)
                    <input
                      type="number"
                      min="1"
                      value={offerSalary}
                      onChange={(event) => setOfferSalary(event.target.value)}
                      placeholder="e.g. 800"
                      required
                    />
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={offerMutation.isPending}>
                    {offerMutation.isPending ? "Sending Offer..." : "Send Offer"}
                  </button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
