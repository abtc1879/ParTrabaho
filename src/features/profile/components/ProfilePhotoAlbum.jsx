import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addProfileAlbumPhoto, listProfileAlbumPhotos, uploadProfileAlbumPhoto } from "../api";

export function ProfilePhotoAlbum({ userId, isOwner = false, canUpload = false }) {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState("");

  const photosQuery = useQuery({
    queryKey: ["profile-album", userId],
    queryFn: () => listProfileAlbumPhotos(userId),
    enabled: !!userId
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const photoUrl = await uploadProfileAlbumPhoto(userId, file);
      return addProfileAlbumPhoto({ userId, photoUrl });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile-album", userId] });
    }
  });

  useEffect(() => {
    if (!selectedFile) return undefined;
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    if (!lightboxUrl) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setLightboxUrl("");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxUrl]);

  function handleSelectFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      event.target.value = "";
      return;
    }
    const maxSizeMb = 5;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setUploadError(`Image must be smaller than ${maxSizeMb}MB.`);
      event.target.value = "";
      return;
    }
    setUploadError("");
    setSelectedFile(file);
  }

  function handleClearSelection() {
    setSelectedFile(null);
    setPreviewUrl("");
    setUploadError("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleUpload() {
    if (!selectedFile || !userId) return;
    setUploadError("");
    try {
      await uploadMutation.mutateAsync(selectedFile);
      handleClearSelection();
    } catch (error) {
      setUploadError(error?.message || "Unable to upload photo right now.");
    }
  }

  const photos = photosQuery.data || [];

  return (
    <div className="card profile-album-card">
      <div className="profile-album-header">
        <h3>Photo Album</h3>
        <p className="muted">Show your work, tools, or past jobs. Visible to other users.</p>
      </div>

      {photosQuery.isError ? <p className="feedback error">{photosQuery.error.message}</p> : null}

      {isOwner ? (
        <div className="profile-album-upload">
          <div className="profile-album-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!canUpload || uploadMutation.isPending}
            >
              Add Photo
            </button>
            <input ref={inputRef} type="file" accept="image/*" onChange={handleSelectFile} hidden />
            {!canUpload ? <p className="feedback error">Photo uploads are disabled while your account is restricted.</p> : null}
          </div>

          {previewUrl ? (
            <div className="profile-album-preview">
              <img src={previewUrl} alt="Selected upload" />
              <div className="profile-album-preview-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? "Uploading..." : "Upload Photo"}
                </button>
                <button className="btn btn-danger" type="button" onClick={handleClearSelection} disabled={uploadMutation.isPending}>
                  Remove
                </button>
              </div>
            </div>
          ) : null}
          {uploadError ? <p className="feedback error">{uploadError}</p> : null}
        </div>
      ) : null}

      {photosQuery.isLoading ? <p className="muted">Loading album...</p> : null}
      {!photosQuery.isLoading && photos.length === 0 ? <p className="muted">No album photos yet.</p> : null}
      {photos.length > 0 ? (
        <div className="profile-album-grid">
          {photos.map((photo) => (
            <figure key={photo.id} className="profile-album-item">
              <button
                className="profile-album-photo"
                type="button"
                onClick={() => setLightboxUrl(photo.photo_url)}
                aria-label="View photo"
              >
                <img src={photo.photo_url} alt={photo.caption || "Profile album photo"} loading="lazy" />
              </button>
              {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}
      {lightboxUrl ? (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl("")}
        >
          <button className="photo-lightbox-close" type="button" onClick={() => setLightboxUrl("")}>
            Close
          </button>
          <img src={lightboxUrl} alt="Profile album zoomed" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}
