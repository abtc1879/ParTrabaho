import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getProfileById, upsertProfile } from "../../profile/api";
import { formatAddress, splitLegacyAddress } from "../../profile/utils";
import { AvatarUploader } from "../../profile/components/AvatarUploader";

export function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [profile, setProfile] = useState({
    surname: "",
    firstname: "",
    middlename: "",
    suffix: "",
    birthdate: "",
    gender: "prefer_not_to_say",
    barangay: "",
    city_municipality: "",
    province: "",
    email: "",
    contact_number: "",
    expertise: "",
    avatar_url: ""
  });

  useEffect(() => {
    if (!user) return;
    getProfileById(user.id)
      .then((data) => {
        setProfile((prev) => ({
          ...prev,
          ...data,
          ...(data.barangay || data.city_municipality || data.province
            ? {}
            : splitLegacyAddress(data.address)),
          expertise: Array.isArray(data.expertise) ? data.expertise.join(", ") : ""
        }));
      })
      .catch(() => {
        // It's fine when the profile is not created yet.
      });
  }, [user]);

  function onChange(event) {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setAttemptedSubmit(true);
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    if (!user) return;
    setError("");
    setLoading(true);
    try {
      await upsertProfile({
        id: user.id,
        surname: profile.surname,
        firstname: profile.firstname,
        middlename: profile.middlename || null,
        suffix: profile.suffix || null,
        birthdate: profile.birthdate,
        gender: profile.gender,
        barangay: profile.barangay,
        city_municipality: profile.city_municipality,
        province: profile.province,
        email: profile.email || null,
        contact_number: profile.contact_number || null,
        address: formatAddress(profile, ""),
        avatar_url: profile.avatar_url || null,
        expertise: profile.expertise
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      });
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <section className="page">
        <p>Please login first.</p>
      </section>
    );
  }

  return (
    <section className="page auth-page auth-complete">
      <div className="auth-stage">
        <div className="hero-card">
          <p className="eyebrow">Final Step</p>
          <h2>Complete Profile</h2>
          <p>Add profile photo and expertise to get better job matches.</p>
        </div>
        <div className="card auth-illustration auth-illustration-complete">
          <span className="illustration-dot dot-a" />
          <span className="illustration-dot dot-b" />
          <h3>Stand Out Faster</h3>
          <p>Profiles with clear expertise and photo get more client responses.</p>
          <div className="illustration-steps">
            <span>Photo</span>
            <span>Skills</span>
            <span>Go Live</span>
          </div>
        </div>
      </div>

      <div className="card form-grid auth-card auth-motion-a">
        <AvatarUploader userId={user.id} onUploaded={(avatarUrl) => setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }))} />
        {profile.avatar_url ? <img className="avatar-preview" src={profile.avatar_url} alt="Profile preview" /> : null}
      </div>

      <form
        className={`card form-grid auth-card auth-motion-b ${attemptedSubmit ? "show-validation" : ""}`}
        onSubmit={handleSubmit}
        noValidate
      >
        <label>
          Surname
          <input name="surname" value={profile.surname || ""} onChange={onChange} required />
        </label>
        <label>
          Firstname
          <input name="firstname" value={profile.firstname || ""} onChange={onChange} required />
        </label>
        <label>
          Middle Name (Optional)
          <input name="middlename" value={profile.middlename || ""} onChange={onChange} />
        </label>
        <label>
          Suffix (Optional)
          <input name="suffix" value={profile.suffix || ""} onChange={onChange} />
        </label>
        <label>
          Birthdate
          <input name="birthdate" type="date" value={profile.birthdate || ""} onChange={onChange} required />
        </label>
        <label>
          Gender
          <select name="gender" value={profile.gender || "prefer_not_to_say"} onChange={onChange}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
        <label>
          Barangay
          <input name="barangay" value={profile.barangay || ""} onChange={onChange} required />
        </label>
        <label>
          City / Municipality
          <input name="city_municipality" value={profile.city_municipality || ""} onChange={onChange} required />
        </label>
        <label>
          Province
          <input name="province" value={profile.province || ""} onChange={onChange} required />
        </label>
        <label>
          Email (Optional)
          <input
            name="email"
            type="email"
            value={profile.email || ""}
            onChange={onChange}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Contact Number (Optional)
          <input
            name="contact_number"
            value={profile.contact_number || ""}
            onChange={onChange}
            placeholder="e.g. 0917 123 4567"
            inputMode="tel"
          />
        </label>
        <label>
          Expertise (comma-separated)
          <input
            name="expertise"
            value={profile.expertise || ""}
            onChange={onChange}
            placeholder="Plumbing, Electrical, Delivery"
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save Profile"}
        </button>
      </form>
      {error ? <p className="feedback error">{error}</p> : null}
    </section>
  );
}
