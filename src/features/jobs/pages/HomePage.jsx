import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getJobById, listJobs } from "../api";
import { JobCard } from "../components/JobCard";
import { EmptyState } from "../../../components/common/EmptyState";
import { LoadingSkeleton } from "../../../components/common/LoadingSkeleton";

export function HomePage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterCategoryDraft, setFilterCategoryDraft] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterLocationDraft, setFilterLocationDraft] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [sortDraft, setSortDraft] = useState("newest");

  const jobsQuery = useQuery({
    queryKey: ["jobs", filterCategory, filterLocation],
    queryFn: () =>
      listJobs({
        category: filterCategory !== "all" ? filterCategory : "",
        location: filterLocation !== "all" ? filterLocation : "",
        onlyOpen: true
      })
  });

  function prefetchJobDetails(jobId) {
    if (!jobId) return;
    queryClient.prefetchQuery({
      queryKey: ["job", jobId],
      queryFn: () => getJobById(jobId),
      staleTime: 60 * 1000
    });
    import("./JobDetailsPage");
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  let visibleJobs = (jobsQuery.data || []).filter((job) => {
    if (!normalizedSearch) return true;
    const searchBase = [
      job.title,
      job.description,
      job.required_skill,
      job.category,
      job.location
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchBase.includes(normalizedSearch);
  });
  if (sortBy !== "newest") {
    visibleJobs = [...visibleJobs].sort((a, b) => {
      const salaryA = Number(a.salary_php || 0);
      const salaryB = Number(b.salary_php || 0);
      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "salary_high":
          return salaryB - salaryA;
        case "salary_low":
          return salaryA - salaryB;
        case "title_az":
          return (a.title || "").localeCompare(b.title || "");
        case "title_za":
          return (b.title || "").localeCompare(a.title || "");
        default:
          return 0;
      }
    });
  }
  const hasFeedJobs = (jobsQuery.data?.length || 0) > 0;

  const categoryOptions = useMemo(() => {
    const items = jobsQuery.data || [];
    const unique = new Set(items.map((item) => (item.category || "").trim()).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [jobsQuery.data]);

  const locationOptions = useMemo(() => {
    const items = jobsQuery.data || [];
    const unique = new Set(items.map((item) => (item.location || "").trim()).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [jobsQuery.data]);

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Part-Time Jobs</h2>
        <Link className="btn btn-primary" to="/jobs/new">
          Post Job
        </Link>
      </div>

      <div className="dashboard-search card">
        <div className="marketplace-filter-head">
          <h3>Search Jobs</h3>
        </div>
        <div className="marketplace-filter-search">
          <label>
            <span className="sr-only">Search</span>
            <input
              className="dashboard-search-input"
              type="search"
              placeholder="Search title, description, skill, category, or location"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>
        </div>
        <div className="marketplace-filter-grid">
          <label>
            Category
            <input
              list="job-category-options"
              value={filterCategoryDraft}
              onChange={(event) => setFilterCategoryDraft(event.target.value)}
              placeholder="Search or select category"
            />
            <datalist id="job-category-options">
              <option value="all">All Categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Location
            <input
              list="job-location-options"
              value={filterLocationDraft}
              onChange={(event) => setFilterLocationDraft(event.target.value)}
              placeholder="Search or select location"
            />
            <datalist id="job-location-options">
              <option value="all">All Locations</option>
              {locationOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Sort By
            <select value={sortDraft} onChange={(event) => setSortDraft(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="salary_high">Salary: High to Low</option>
              <option value="salary_low">Salary: Low to High</option>
              <option value="title_az">Title: A to Z</option>
              <option value="title_za">Title: Z to A</option>
            </select>
          </label>
        </div>
        <div className="marketplace-filter-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={
              searchDraft === searchTerm &&
              filterCategoryDraft === filterCategory &&
              filterLocationDraft === filterLocation &&
              sortDraft === sortBy
            }
            onClick={() => {
              setSearchTerm(searchDraft);
              setFilterCategory(filterCategoryDraft);
              setFilterLocation(filterLocationDraft);
              setSortBy(sortDraft);
            }}
          >
            Apply Filters
          </button>
          <p className="muted">{visibleJobs.length} result(s) found.</p>
        </div>
      </div>

      {jobsQuery.isLoading ? <LoadingSkeleton lines={4} /> : null}
      {jobsQuery.isError ? <p className="feedback error">{jobsQuery.error.message}</p> : null}
      {!jobsQuery.isLoading && !jobsQuery.isError && !hasFeedJobs ? (
        <EmptyState title="No jobs yet" description="Try changing filters or create the first job post." />
      ) : null}
      {!jobsQuery.isLoading && !jobsQuery.isError && hasFeedJobs && visibleJobs.length === 0 ? (
        <EmptyState title="No jobs match your search" description="Try a different keyword or clear the search field." />
      ) : null}

      <div className="stack">
        {visibleJobs.map((job) => (
          <JobCard key={job.id} job={job} onPrefetch={() => prefetchJobDetails(job.id)} />
        ))}
      </div>
    </section>
  );
}
