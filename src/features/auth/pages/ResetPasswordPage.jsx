import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function syncSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasRecoverySession(!!data.session?.user);
      setCheckingSession(false);
    }

    syncSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setHasRecoverySession(!!session?.user);
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!hasRecoverySession) {
      setError("Recovery session not found. Please open the latest reset link from your email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setMessage("Password updated successfully. Redirecting to login...");
      setPassword("");
      setConfirmPassword("");

      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
      }, 1200);
    } catch (err) {
      setError(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page auth-page auth-login">
      <div className="auth-shell">
        <article className="auth-panel auth-panel-form reset-password-panel">
          <div className="auth-form-head">
            <p className="eyebrow">Account Recovery</p>
            <h3>Set a new password</h3>
            <p>Create a new password to restore access to your account.</p>
          </div>

          {checkingSession ? <p className="muted">Preparing secure recovery session...</p> : null}

          {!checkingSession && !hasRecoverySession ? (
            <p className="feedback error">This reset link is invalid or expired. Request a new recovery link from admin.</p>
          ) : null}

          <form className="auth-form-grid" onSubmit={handleSubmit}>
            <label>
              New Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter new password"
                minLength={6}
                required
                disabled={!hasRecoverySession || loading}
              />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                minLength={6}
                required
                disabled={!hasRecoverySession || loading}
              />
            </label>
            <button className="btn btn-primary auth-submit-btn" type="submit" disabled={!hasRecoverySession || loading}>
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>

          {error ? <p className="feedback error">{error}</p> : null}
          {message ? <p className="feedback success">{message}</p> : null}

          <p className="text-center auth-switch-text">
            <Link to="/login">Back to login</Link>
          </p>
        </article>
      </div>
    </section>
  );
}
