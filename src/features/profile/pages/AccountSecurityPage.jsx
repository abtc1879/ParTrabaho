import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { signInWithEmail, updateAccountEmail, updateAccountPassword } from "../../auth/api";

export function AccountSecurityPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  if (!user) {
    return (
      <section className="page">
        <div className="page-title-row">
          <h2>Account Security</h2>
          <Link className="btn btn-secondary" to="/login">
            Go to Login
          </Link>
        </div>
        <p className="feedback error">You must be logged in to update account security settings.</p>
      </section>
    );
  }

  async function handleEmailUpdate(event) {
    event.preventDefault();
    setEmailMessage("");
    setEmailError("");
    setEmailLoading(true);
    try {
      await updateAccountEmail(email);
      setEmailMessage("Email update requested. Please check your inbox to confirm the change.");
    } catch (err) {
      setEmailError(err.message || "Failed to update email.");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (!newPassword || newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      if (currentPassword) {
        await signInWithEmail({ email: user.email, password: currentPassword });
      }
      await updateAccountPassword(newPassword);
      setPasswordMessage("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err.message || "Failed to update password.");
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>Account Security</h2>
        <Link className="btn btn-secondary" to="/profile">
          Back
        </Link>
      </div>

      <article className="card support-form-card">
        <h3>Change Email</h3>
        <p className="muted">Current email: {user.email || "Not available"}</p>
        <form className="form-grid" onSubmit={handleEmailUpdate}>
          <label>
            New email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <button className="btn btn-primary" type="submit" disabled={emailLoading}>
            {emailLoading ? "Updating..." : "Update Email"}
          </button>
          {emailMessage ? <p className="feedback success">{emailMessage}</p> : null}
          {emailError ? <p className="feedback error">{emailError}</p> : null}
        </form>
      </article>

      <article className="card support-form-card">
        <h3>Change Password</h3>
        <p className="muted">For security, you may be asked to log in again after updating.</p>
        <form className="form-grid" onSubmit={handlePasswordUpdate}>
          <label>
            Current password (optional)
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Enter current password"
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter new password"
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={passwordLoading}>
            {passwordLoading ? "Updating..." : "Update Password"}
          </button>
          {passwordMessage ? <p className="feedback success">{passwordMessage}</p> : null}
          {passwordError ? <p className="feedback error">{passwordError}</p> : null}
        </form>
      </article>
    </section>
  );
}
