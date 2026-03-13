import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { signInWithFacebook, signUpWithEmail } from "../api";
import { upsertProfile } from "../../profile/api";
import { formatAddress } from "../../profile/utils";
import { DEFAULT_LOGO_URL, getAppSettings } from "../../../lib/appSettings";

const initialForm = {
  email: "",
  password: "",
  surname: "",
  firstname: "",
  middlename: "",
  suffix: "",
  birthdate: "",
  gender: "prefer_not_to_say",
  barangay: "",
  city_municipality: "",
  province: ""
};

export function SignupPage() {
  const navigate = useNavigate();
  const appSettingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    staleTime: 5 * 60 * 1000
  });
  const logoUrl = appSettingsQuery.data?.logo_url || DEFAULT_LOGO_URL;
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleFacebookSignup() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await signInWithFacebook();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setAttemptedSubmit(true);
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const { user, session } = await signUpWithEmail({
        email: form.email,
        password: form.password
      });

      if (user && session) {
        await upsertProfile({
          id: user.id,
          surname: form.surname,
          firstname: form.firstname,
          middlename: form.middlename || null,
          suffix: form.suffix || null,
          birthdate: form.birthdate,
          gender: form.gender,
          barangay: form.barangay,
          city_municipality: form.city_municipality,
          province: form.province,
          address: formatAddress(form, "")
        });
        navigate("/complete-profile");
      } else {
        setMessage("Account created. Verify your email, then login to complete your profile.");
        navigate("/login");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page auth-page auth-signup">
      <div className="auth-shell">
        <div className="auth-panel auth-panel-form auth-panel-merged">
          <div className="auth-merged-head">
            <div className="auth-brand-top">
              <img className="auth-brand-logo" src={logoUrl} alt="ParTrabaho logo" />
              <div>
                <p className="auth-brand-kicker">ParTrabaho Workspace</p>
                <h2>Create Your Account</h2>
              </div>
            </div>
            <p className="auth-brand-copy">Build your profile once and unlock better job matches, faster hiring, and trusted collaboration.</p>
            <div className="auth-brand-pills">
              <span>Professional Profile</span>
              <span>Quick Applications</span>
              <span>Secure Messaging</span>
            </div>
          </div>

          <div className="auth-form-head">
            <p className="eyebrow">Sign Up</p>
            <h3>Join ParTrabaho today</h3>
            <p>Fill in your details to get started.</p>
          </div>

          <form className={`auth-form-grid auth-signup-grid ${attemptedSubmit ? "show-validation" : ""}`} onSubmit={handleSubmit} noValidate>
            <label>
              Surname
              <input name="surname" value={form.surname} onChange={onChange} required />
            </label>
            <label>
              Firstname
              <input name="firstname" value={form.firstname} onChange={onChange} required />
            </label>
            <label>
              Middle Name (Optional)
              <input name="middlename" value={form.middlename} onChange={onChange} />
            </label>
            <label>
              Suffix (Optional)
              <input name="suffix" value={form.suffix} onChange={onChange} />
            </label>
            <label>
              Birthdate
              <input name="birthdate" type="date" value={form.birthdate} onChange={onChange} required />
            </label>
            <label>
              Gender
              <select name="gender" value={form.gender} onChange={onChange}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>
            <label>
              Barangay
              <input name="barangay" value={form.barangay} onChange={onChange} required />
            </label>
            <label>
              City / Municipality
              <input name="city_municipality" value={form.city_municipality} onChange={onChange} required />
            </label>
            <label className="auth-field-wide">
              Province
              <input name="province" value={form.province} onChange={onChange} required />
            </label>
            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={onChange} required />
            </label>
            <label>
              Password
              <input name="password" type="password" value={form.password} onChange={onChange} required />
            </label>

            <button className="btn btn-primary auth-submit-btn" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Sign Up"}
            </button>
          </form>

          <div className="auth-divider">
            <span>or continue with</span>
          </div>
          <button className="btn btn-secondary auth-social-btn" onClick={handleFacebookSignup} disabled={loading} type="button">
            Continue with Facebook
          </button>

          {error ? <p className="feedback error">{error}</p> : null}
          {message ? <p className="feedback success">{message}</p> : null}

          <p className="text-center auth-switch-text">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
