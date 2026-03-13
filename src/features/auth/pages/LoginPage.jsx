import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  logLoginAttempt,
  resendSignupConfirmation,
  signInWithEmail,
  signInWithFacebook,
  submitLoginRecoveryRequest
} from "../api";
import { DEFAULT_LOGO_URL, getAppSettings } from "../../../lib/appSettings";

const LOGIN_FAILURES_KEY = "partrabaho.login.consecutive_failures";
const RECOVERY_THRESHOLD = 3;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readFailureMap() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOGIN_FAILURES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFailureMap(map) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOGIN_FAILURES_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failure.
  }
}

function getConsecutiveFailures(email) {
  const key = normalizeEmail(email);
  if (!key) return 0;
  const map = readFailureMap();
  const count = Number(map[key] || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function setStoredConsecutiveFailures(email, count) {
  const key = normalizeEmail(email);
  if (!key) return;
  const map = readFailureMap();
  if (count > 0) {
    map[key] = count;
  } else {
    delete map[key];
  }
  writeFailureMap(map);
}

export function LoginPage() {
  const navigate = useNavigate();
  const appSettingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    staleTime: 5 * 60 * 1000
  });
  const logoUrl = appSettingsQuery.data?.logo_url || DEFAULT_LOGO_URL;
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [attemptedEmailSubmit, setAttemptedEmailSubmit] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryForm, setRecoveryForm] = useState({
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    reasonDetails: ""
  });
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  useEffect(() => {
    const count = getConsecutiveFailures(form.email);
    setConsecutiveFailures(count);
    if (count < RECOVERY_THRESHOLD) {
      setRecoveryOpen(false);
    }
  }, [form.email]);

  async function safeLogLoginAttempt({ attemptedEmail, success, failureMessage = null }) {
    if (!attemptedEmail) return;
    try {
      await logLoginAttempt({
        attemptedEmail,
        success,
        failureMessage
      });
    } catch (logError) {
      // Best effort only, but keep a console trace for debugging.
      console.warn("Failed to persist login attempt log:", logError?.message || logError);
    }
  }

  async function handleEmailLogin(event) {
    event.preventDefault();
    setAttemptedEmailSubmit(true);
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setError("");
    setMessage("");
    setNeedsEmailConfirm(false);
    setLoading(true);
    const normalizedEmail = normalizeEmail(form.email);
    try {
      await signInWithEmail({ email: form.email, password: form.password });
      await safeLogLoginAttempt({ attemptedEmail: form.email, success: true });
      setStoredConsecutiveFailures(normalizedEmail, 0);
      setConsecutiveFailures(0);
      setRecoveryOpen(false);
      navigate("/");
    } catch (err) {
      await safeLogLoginAttempt({
        attemptedEmail: form.email,
        success: false,
        failureMessage: err?.message || "Login failed"
      });
      const nextFailures = getConsecutiveFailures(normalizedEmail) + 1;
      setStoredConsecutiveFailures(normalizedEmail, nextFailures);
      setConsecutiveFailures(nextFailures);
      setError(err.message);
      if (String(err.message).toLowerCase().includes("email not confirmed")) {
        setNeedsEmailConfirm(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleFacebookLogin() {
    setError("");
    setMessage("");
    setNeedsEmailConfirm(false);
    setLoading(true);
    try {
      await signInWithFacebook();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleSubmitRecoveryRequest(event) {
    event.preventDefault();
    if (!recoveryForm.requesterName || !recoveryForm.requesterEmail || !recoveryForm.requesterPhone || !recoveryForm.reasonDetails) {
      return;
    }

    setRecoveryLoading(true);
    setRecoveryMessage("");
    setRecoveryError("");
    try {
      await submitLoginRecoveryRequest({
        requesterName: recoveryForm.requesterName.trim(),
        requesterEmail: recoveryForm.requesterEmail.trim(),
        requesterPhone: recoveryForm.requesterPhone.trim(),
        reasonDetails: recoveryForm.reasonDetails.trim()
      });
      setRecoveryMessage("Recovery request submitted. Please wait for admin response.");
      setRecoveryForm({
        requesterName: "",
        requesterEmail: form.email || "",
        requesterPhone: "",
        reasonDetails: ""
      });
      setRecoveryOpen(false);
    } catch (err) {
      setRecoveryError(err.message);
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (!form.email) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await resendSignupConfirmation(form.email);
      setMessage("Confirmation email sent. Please check your inbox/spam.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page auth-page auth-login">
      <div className="auth-shell">
        <div className="auth-panel auth-panel-form auth-panel-merged">
          <div className="auth-merged-head">
            <div className="auth-brand-top">
              <img className="auth-brand-logo" src={logoUrl} alt="ParTrabaho logo" />
              <div>
                <p className="auth-brand-kicker">ParTrabaho Workspace</p>
                <h2>Welcome Back</h2>
              </div>
            </div>
            <p className="auth-brand-copy">Connect with trusted clients and skilled freelancers for fast, reliable part-time work.</p>
            <div className="auth-brand-pills">
              <span>Client Ready</span>
              <span>Freelancer Ready</span>
              <span>Realtime Chat</span>
            </div>
          </div>

          <div className="auth-form-head">
            <p className="eyebrow">Sign In</p>
            <h3>Access your account</h3>
            <p>Use your email and password to continue.</p>
          </div>

          <form className={`auth-form-grid ${attemptedEmailSubmit ? "show-validation" : ""}`} onSubmit={handleEmailLogin} noValidate>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Enter your password"
                required
              />
            </label>
            <button className="btn btn-primary auth-submit-btn" disabled={loading} type="submit">
              {loading ? "Logging in..." : "Login with Email"}
            </button>
            {needsEmailConfirm ? (
              <button className="btn btn-secondary auth-confirm-btn" onClick={handleResendConfirmation} type="button" disabled={loading}>
                Resend Confirmation Email
              </button>
            ) : null}
          </form>

          <div className="auth-divider">
            <span>or continue with</span>
          </div>
          <button className="btn btn-secondary auth-social-btn" onClick={handleFacebookLogin} disabled={loading} type="button">
            Continue with Facebook
          </button>

          {error ? <p className="feedback error">{error}</p> : null}
          {message ? <p className="feedback success">{message}</p> : null}

          {consecutiveFailures >= RECOVERY_THRESHOLD ? (
            <div className="auth-recovery-box">
              <button
                className="btn btn-secondary auth-recovery-toggle"
                type="button"
                onClick={() => {
                  setRecoveryOpen((prev) => !prev);
                  setRecoveryError("");
                  setRecoveryMessage("");
                  setRecoveryForm((prev) => ({
                    ...prev,
                    requesterEmail: prev.requesterEmail || form.email || ""
                  }));
                }}
              >
                {recoveryOpen ? "Cancel Recovery Request" : "Need account recovery?"}
              </button>
              {recoveryOpen ? (
                <form className="auth-form-grid" onSubmit={handleSubmitRecoveryRequest}>
                  <label>
                    Full Name
                    <input
                      value={recoveryForm.requesterName}
                      onChange={(event) =>
                        setRecoveryForm((prev) => ({
                          ...prev,
                          requesterName: event.target.value
                        }))
                      }
                      placeholder="Your full name"
                      required
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={recoveryForm.requesterEmail}
                      onChange={(event) =>
                        setRecoveryForm((prev) => ({
                          ...prev,
                          requesterEmail: event.target.value
                        }))
                      }
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                  <label>
                    Phone Number
                    <input
                      value={recoveryForm.requesterPhone}
                      onChange={(event) =>
                        setRecoveryForm((prev) => ({
                          ...prev,
                          requesterPhone: event.target.value
                        }))
                      }
                      placeholder="+639XXXXXXXXX"
                      required
                    />
                  </label>
                  <label>
                    Reason
                    <textarea
                      rows={3}
                      value={recoveryForm.reasonDetails}
                      onChange={(event) =>
                        setRecoveryForm((prev) => ({
                          ...prev,
                          reasonDetails: event.target.value
                        }))
                      }
                      placeholder="Describe your login credential issue"
                      required
                    />
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={recoveryLoading}>
                    {recoveryLoading ? "Submitting..." : "Send Recovery Request"}
                  </button>
                </form>
              ) : null}
              {recoveryMessage ? <p className="feedback success">{recoveryMessage}</p> : null}
              {recoveryError ? <p className="feedback error">{recoveryError}</p> : null}
            </div>
          ) : null}

          <p className="text-center auth-switch-text">
            No account yet? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
