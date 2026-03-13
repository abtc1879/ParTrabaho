import { useState } from "react";
import { uploadAvatar } from "../api";

export function AvatarUploader({ userId, onUploaded }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      const publicUrl = await uploadAvatar(userId, file);
      onUploaded(publicUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="avatar-uploader">
      <label className="btn btn-secondary">
        {loading ? "Uploading..." : "Upload Profile Picture"}
        <input type="file" accept="image/*" onChange={handleFileChange} hidden />
      </label>
      {error ? <p className="feedback error">{error}</p> : null}
    </div>
  );
}
