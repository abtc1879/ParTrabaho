import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { openRentalConversation } from "../../chat/api";
import {
  addRentalListingPhotos,
  createRentalListing,
  deleteRentalListing,
  listRentalListings,
  updateRentalListing,
  uploadRentalPhoto
} from "../api";
import { EmptyState } from "../../../components/common/EmptyState";

function readSingle(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function fullName(profile) {
  if (!profile) return "";
  return [profile.firstname, profile.surname].filter(Boolean).join(" ").trim();
}

function getInitials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function getDescriptionParts(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized
    .split(/\n|[•▪■□✔✓]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { intro: normalized.replace(/\s+/g, " ").trim(), items: [] };
  }
  const first = parts[0];
  const hasIntro = first.length > 90 || /[.!?]/.test(first);
  if (hasIntro) {
    return { intro: first, items: parts.slice(1) };
  }
  return { intro: "", items: parts };
}

const defaultCategories = [
  "House",
  "Boarding House",
  "Apartment",
  "Commercial Space",
  "Events Place",
  "Warehouse",
  "Car",
  "Videoke (Karaoke)"
];

export function RentalsPage() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { user, isRestricted, restrictionMessage } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [showPostForm, setShowPostForm] = useState(false);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [photoError, setPhotoError] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editValues, setEditValues] = useState({
    title: "",
    category: "",
    description: "",
    price: "",
    location: "",
    mapUrl: "",
    notes: ""
  });
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState("");
  const [lightboxPhotos, setLightboxPhotos] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const photoInputRef = useRef(null);
  const maxPhotos = 5;
  const [showMyListings, setShowMyListings] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [searchDraft, setSearchDraft] = useState("");
  const [filterCategoryDraft, setFilterCategoryDraft] = useState("all");
  const [filterLocationDraft, setFilterLocationDraft] = useState("all");
  const [sortByDraft, setSortByDraft] = useState("newest");

  const rentalsQuery = useQuery({
    queryKey: ["rental-listings"],
    queryFn: () => listRentalListings()
  });

  const createMutation = useMutation({
    mutationFn: ({ ownerId, payload }) => createRentalListing({ ownerId, payload }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rental-listings"] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ rentalId, updates }) => updateRentalListing({ rentalId, updates }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rental-listings"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (rentalId) => deleteRentalListing(rentalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rental-listings"] });
    }
  });

  const categoryOptions = useMemo(() => {
    const items = rentalsQuery.data || [];
    const unique = new Set([
      ...defaultCategories,
      ...items.map((item) => (item.category || "").trim()).filter(Boolean)
    ]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [rentalsQuery.data]);

  const locationOptions = useMemo(() => {
    const items = rentalsQuery.data || [];
    const unique = new Set(items.map((item) => (item.location || "").trim()).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [rentalsQuery.data]);

  const visibleRentals = useMemo(() => {
    const items = rentalsQuery.data || [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    let filtered = items.filter((rental) => {
      if (showMyListings) {
        if (rental.owner_id !== user?.id) return false;
      } else if (user?.id && rental.owner_id === user.id) {
        return false;
      }
      if (filterCategory !== "all" && (rental.category || "").trim() !== filterCategory) return false;
      if (filterLocation !== "all" && (rental.location || "").trim() !== filterLocation) return false;
      if (!normalizedSearch) return true;
      const searchBase = [rental.title, rental.category, rental.description, rental.notes, rental.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchBase.includes(normalizedSearch);
    });
    if (sortBy !== "newest") {
      filtered = [...filtered].sort((a, b) => {
        const priceA = Number(a.price_php || 0);
        const priceB = Number(b.price_php || 0);
        switch (sortBy) {
          case "oldest":
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case "price_high":
            return priceB - priceA;
          case "price_low":
            return priceA - priceB;
          case "name_az":
            return (a.title || "").localeCompare(b.title || "");
          case "name_za":
            return (b.title || "").localeCompare(a.title || "");
          default:
            return 0;
        }
      });
    }
    return filtered;
  }, [rentalsQuery.data, searchTerm, filterCategory, filterLocation, sortBy, showMyListings, user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(routeLocation.search);
    const wantsMine = params.get("view") === "mine" || params.get("mine") === "1";
    if (wantsMine) {
      setShowMyListings(true);
    }
  }, [routeLocation.search]);

  useEffect(() => {
    if (!photoFiles.length) {
      setPhotoPreviews([]);
      return undefined;
    }
    const objectUrls = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(objectUrls);
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [photoFiles]);

  function openLightbox(photos, startIndex = 0) {
    const cleaned = (photos || []).map((photo) => String(photo || "").trim()).filter(Boolean);
    if (!cleaned.length) return;
    const safeIndex = Math.min(Math.max(startIndex, 0), cleaned.length - 1);
    setLightboxPhotos(cleaned);
    setLightboxIndex(safeIndex);
  }

  function closeLightbox() {
    setLightboxPhotos([]);
    setLightboxIndex(0);
  }

  function goLightboxNext() {
    setLightboxIndex((prev) => {
      if (!lightboxPhotos.length) return 0;
      return (prev + 1) % lightboxPhotos.length;
    });
  }

  function goLightboxPrev() {
    setLightboxIndex((prev) => {
      if (!lightboxPhotos.length) return 0;
      return (prev - 1 + lightboxPhotos.length) % lightboxPhotos.length;
    });
  }

  useEffect(() => {
    if (!lightboxPhotos.length) return undefined;
    const total = lightboxPhotos.length;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeLightbox();
        return;
      }
      if (event.key === "ArrowRight") {
        setLightboxIndex((prev) => (prev + 1) % total);
      }
      if (event.key === "ArrowLeft") {
        setLightboxIndex((prev) => (prev - 1 + total) % total);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxPhotos.length]);

  function validatePhotoFile(file) {
    if (!file) return false;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select an image file.");
      return false;
    }
    const maxSizeMb = 5;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setPhotoError(`Image must be smaller than ${maxSizeMb}MB.`);
      return false;
    }
    setPhotoError("");
    return true;
  }

  function handleSelectPhoto(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (photoFiles.length >= maxPhotos) {
      setPhotoError(`You can upload up to ${maxPhotos} photos.`);
      event.target.value = "";
      return;
    }
    const validFiles = files.filter((file) => validatePhotoFile(file));
    if (!validFiles.length) {
      event.target.value = "";
      return;
    }
    const remainingSlots = maxPhotos - photoFiles.length;
    const nextFiles = validFiles.slice(0, remainingSlots);
    if (validFiles.length > remainingSlots) {
      setPhotoError(`Only ${remainingSlots} more photo(s) allowed.`);
    } else {
      setPhotoError("");
    }
    setPhotoFiles((prev) => [...prev, ...nextFiles]);
  }

  function handleRemovePhoto(index) {
    setPhotoFiles((prev) => prev.filter((_file, idx) => idx !== index));
    setPhotoError("");
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user?.id) return;
    const trimmedTitle = title.trim();
    const trimmedCategory = category.trim();
    const trimmedLocation = location.trim();
    const priceValue = Number(price);

    if (!trimmedTitle) {
      setFormError("Property name is required.");
      return;
    }
    if (!trimmedCategory) {
      setFormError("Category is required.");
      return;
    }
    if (!trimmedLocation) {
      setFormError("Location is required.");
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setFormError("Price must be a number greater than zero.");
      return;
    }

    setFormError("");
    setFormSuccess("");
    try {
      let photoUrl = null;
      const photoUrls = [];
      if (photoFiles.length) {
        for (const file of photoFiles) {
          const url = await uploadRentalPhoto(user.id, file);
          photoUrls.push(url);
        }
      }
      photoUrl = photoUrls[0] || null;
      const created = await createMutation.mutateAsync({
        ownerId: user.id,
        payload: {
          title: trimmedTitle,
          category: trimmedCategory,
          description: description.trim() || null,
          pricePhp: priceValue,
          location: trimmedLocation,
          mapUrl: mapUrl.trim() || null,
          notes: notes.trim() || null,
          photoUrl
        }
      });
      if (photoUrls.length && created?.id) {
        await addRentalListingPhotos({
          rentalId: created?.id,
          ownerId: user.id,
          photoUrls
        });
        await queryClient.invalidateQueries({ queryKey: ["rental-listings"] });
      }
      setTitle("");
      setCategory("");
      setDescription("");
      setPrice("");
      setLocation("");
      setMapUrl("");
      setNotes("");
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setPhotoError("");
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
      setFormSuccess("Rental listing posted.");
      setShowPostForm(false);
    } catch (error) {
      setFormError(error?.message || "Unable to post rental right now.");
    }
  }

  async function handleMessageOwner(rental) {
    if (!user?.id || rental.owner_id === user.id) return;
    setOpeningId(rental.id);
    try {
      const conversationId = await openRentalConversation({
        rentalId: rental.id,
        ownerId: rental.owner_id,
        renterId: user.id
      });
      await queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
      if (conversationId) {
        navigate(`/chat/${conversationId}`);
      }
    } catch (error) {
      setFormError(error?.message || "Unable to open chat with owner.");
    } finally {
      setOpeningId("");
    }
  }

  function startEditing(rental) {
    setEditingId(rental.id);
    setEditValues({
      title: rental.title || "",
      category: rental.category || "",
      description: rental.description || "",
      price: rental.price_php != null ? String(rental.price_php) : "",
      location: rental.location || "",
      mapUrl: rental.map_url || "",
      notes: rental.notes || ""
    });
    setEditError("");
  }

  async function handleSaveEdit(rental) {
    if (!user?.id || editingId !== rental.id) return;
    const trimmedTitle = editValues.title.trim();
    const trimmedCategory = editValues.category.trim();
    const trimmedLocation = editValues.location.trim();
    const priceValue = Number(editValues.price);

    if (!trimmedTitle) {
      setEditError("Title is required.");
      return;
    }
    if (!trimmedCategory) {
      setEditError("Category is required.");
      return;
    }
    if (!trimmedLocation) {
      setEditError("Location is required.");
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setEditError("Price must be a number greater than zero.");
      return;
    }

    setEditError("");
    try {
      await updateMutation.mutateAsync({
        rentalId: rental.id,
        updates: {
          title: trimmedTitle,
          category: trimmedCategory,
          description: editValues.description.trim() || null,
          price_php: priceValue,
          location: trimmedLocation,
          map_url: editValues.mapUrl.trim() || null,
          notes: editValues.notes.trim() || null
        }
      });
      setEditingId("");
    } catch (error) {
      setEditError(error?.message || "Unable to update rental right now.");
    }
  }

  async function handleDeleteListing(rental) {
    if (!user?.id || rental.owner_id !== user.id) return;
    setDeletingId(rental.id);
    try {
      await deleteMutation.mutateAsync(rental.id);
    } catch (error) {
      setFormError(error?.message || "Unable to delete rental right now.");
    } finally {
      setDeletingId("");
    }
  }

  function handleRequestDelete(rental) {
    if (!user?.id || rental.owner_id !== user.id) return;
    setConfirmingDeleteId(rental.id);
  }

  async function handleConfirmDelete(rental) {
    if (confirmingDeleteId !== rental.id) return;
    await handleDeleteListing(rental);
    setConfirmingDeleteId("");
  }

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>{showMyListings ? "Manage My Rentals" : "Rentals"}</h2>
        <button className="btn btn-primary" type="button" onClick={() => setShowPostForm((prev) => !prev)}>
          {showPostForm ? "Close Rental Form" : "Post Rental"}
        </button>
      </div>

      <div className="card marketplace-filter-card">
        <div className="marketplace-filter-head">
          <h3>Search & Filters</h3>
        </div>
        <div className="marketplace-filter-search">
          <label>
            <span className="sr-only">Search</span>
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search title, category, notes, or location"
            />
          </label>
        </div>
        <div className="marketplace-filter-grid">
          <label>
            Category
            <input
              list="rental-filter-categories"
              value={filterCategoryDraft === "all" ? "" : filterCategoryDraft}
              onChange={(event) => {
                const value = event.target.value.trim();
                setFilterCategoryDraft(value ? value : "all");
              }}
              placeholder="All Categories"
            />
            <datalist id="rental-filter-categories">
              {categoryOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Location
            <input
              list="rental-filter-locations"
              value={filterLocationDraft === "all" ? "" : filterLocationDraft}
              onChange={(event) => {
                const value = event.target.value.trim();
                setFilterLocationDraft(value ? value : "all");
              }}
              placeholder="All Locations"
            />
            <datalist id="rental-filter-locations">
              {locationOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Sort By
            <select value={sortByDraft} onChange={(event) => setSortByDraft(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="price_high">Price: High to Low</option>
              <option value="price_low">Price: Low to High</option>
              <option value="name_az">Title: A to Z</option>
              <option value="name_za">Title: Z to A</option>
            </select>
          </label>
        </div>
        <div className="marketplace-filter-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setSearchTerm(searchDraft);
              setFilterCategory(filterCategoryDraft);
              setFilterLocation(filterLocationDraft);
              setSortBy(sortByDraft);
            }}
            disabled={
              searchDraft === searchTerm &&
              filterCategoryDraft === filterCategory &&
              filterLocationDraft === filterLocation &&
              sortByDraft === sortBy
            }
          >
            Apply Filters
          </button>
          <p className="muted">{visibleRentals.length} result(s) found.</p>
        </div>
      </div>

      {showPostForm ? (
        <article className="card">
        <p className="eyebrow">Post a Rental</p>
        <h3>List your property for rent</h3>
          <p className="muted">Examples: house, boarding house, apartment, warehouse, car, videoke (karaoke), and more.</p>
          {isRestricted ? <p className="feedback error">{restrictionMessage}</p> : null}
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Apartment near city center"
                required
              />
            </label>
            <label>
              Category
              <input
                list="rental-category-options"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Select or type a category"
                required
              />
              <datalist id="rental-category-options">
                {categoryOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Room size, amenities, inclusions"
              />
            </label>
            <label>
              Price (PHP)
              <input
                type="number"
                min="1"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="e.g. 5000"
                required
              />
            </label>
            <label>
              Location
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="City or area"
                required
              />
            </label>
            <div className="map-pin-row">
              <p className="map-pin-label">Pin Location (Google Maps)</p>
              <div className="map-pin-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    const query = location.trim();
                    const target = query
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
                      : "https://www.google.com/maps";
                    window.open(target, "_blank", "noopener,noreferrer");
                  }}
                >
                  Open Google Maps
                </button>
                {mapUrl.trim() ? (
                  <a className="btn btn-secondary" href={mapUrl.trim()} target="_blank" rel="noreferrer">
                    View Pinned
                  </a>
                ) : null}
              </div>
            </div>
            <label>
              Google Maps Link (Optional)
              <input
                value={mapUrl}
                onChange={(event) => setMapUrl(event.target.value)}
                placeholder="Paste Google Maps link here"
              />
            </label>
            <label>
              Notes
              <textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Available dates, preferred contact time"
              />
            </label>
            <div className="marketplace-photo-upload">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={isRestricted || createMutation.isPending}
              >
                Add Photo ({photoFiles.length}/{maxPhotos})
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleSelectPhoto}
                hidden
              />
              {photoPreviews.length ? (
                <div className="marketplace-photo-preview-list">
                  {photoPreviews.map((preview, index) => (
                    <div className="marketplace-photo-preview" key={`${preview}-${index}`}>
                      <img src={preview} alt="Selected rental" />
                      <button className="btn btn-danger" type="button" onClick={() => handleRemovePhoto(index)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {photoError ? <p className="feedback error">{photoError}</p> : null}
            </div>
            <button className="btn btn-primary" type="submit" disabled={isRestricted || createMutation.isPending}>
              {createMutation.isPending ? "Posting..." : "Post Rental"}
            </button>
            {formError ? <p className="feedback error">{formError}</p> : null}
            {formSuccess ? <p className="feedback success">{formSuccess}</p> : null}
          </form>
        </article>
      ) : null}

      {rentalsQuery.isError ? <p className="feedback error">{rentalsQuery.error.message}</p> : null}
      {!rentalsQuery.isLoading && visibleRentals.length === 0 && (rentalsQuery.data || []).length === 0 ? (
        <EmptyState title="No rentals yet" description="Be the first to post a rental listing." />
      ) : null}
      {!rentalsQuery.isLoading && visibleRentals.length === 0 && (rentalsQuery.data || []).length > 0 ? (
        <EmptyState title="No matches found" description="Try a different keyword or clear the filters." />
      ) : null}

      <div className="stack rental-list">
        {visibleRentals.map((rental) => {
          const owner = readSingle(rental.owner);
          const ownerName = fullName(owner) || "Owner";
          const mainPhoto = rental.photo_url || rental.photos?.[0]?.photo_url || "";
          const extraPhotos = (rental.photos || []).filter((photo) => photo.photo_url !== mainPhoto);
          const photoList = [mainPhoto, ...extraPhotos.map((photo) => photo.photo_url)].filter(Boolean);
          const hasMedia = Boolean(mainPhoto || extraPhotos.length);
          const isOwner = user?.id && rental.owner_id === user.id;
          const isEditing = editingId === rental.id;
          const descriptionParts = getDescriptionParts(rental.description);
          const mapUrl = (rental.map_url || "").trim();
          const notesValue = (rental.notes || "").trim();
          return (
            <article className="card rental-card" key={rental.id}>
              <div className={`marketplace-card-layout ${hasMedia ? "" : "marketplace-card-layout--no-media"}`}>
                {hasMedia ? (
                  <div className="marketplace-card-media">
                    <div className="marketplace-photo">
                      <button
                        className="marketplace-photo-button"
                        type="button"
                        onClick={() => openLightbox(photoList, 0)}
                        aria-label="View rental photo"
                      >
                        <img src={mainPhoto} alt={rental.title} loading="lazy" />
                      </button>
                    </div>
                    {extraPhotos.length ? (
                      <div className="rental-photo-strip" aria-label="More rental photos">
                        {extraPhotos.map((photo, index) => (
                          <button
                            className="marketplace-photo-thumb"
                            type="button"
                            key={photo.id}
                            onClick={() => openLightbox(photoList, index + 1)}
                            aria-label="View rental photo"
                          >
                            <img src={photo.photo_url} alt={`${rental.title} photo`} loading="lazy" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="marketplace-card-content">
                  <div className="marketplace-card-header">
                    <div>
                      <p className="eyebrow">For Rent</p>
                      <h3>{rental.title}</h3>
                      <p className="marketplace-price">PHP {Number(rental.price_php || 0).toLocaleString()}</p>
                    </div>
                    <div className="marketplace-badges">
                      <span className="pill marketplace">Rental</span>
                      {rental.is_rented ? (
                        <span className="pill reserved">Already Rented</span>
                      ) : rental.is_reserved ? (
                        <span className="pill reserved">Reserved</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="marketplace-meta marketplace-meta-compact">
                    <p>
                      <strong>Category:</strong> {rental.category || "Not provided"}
                    </p>
                    <p>
                      <strong>Location:</strong> {rental.location || "Not provided"}
                    </p>
                    <div className="marketplace-meta-item marketplace-meta-full">
                      <strong>Description:</strong>
                      {descriptionParts ? (
                        <div className="marketplace-desc">
                          {descriptionParts.intro ? (
                            <p className="marketplace-desc-text">{descriptionParts.intro}</p>
                          ) : null}
                          {descriptionParts.items.length ? (
                            <ul className="marketplace-desc-list">
                              {descriptionParts.items.map((item, index) => (
                                <li key={`${rental.id}-desc-${index}`}>{item}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : (
                        <span className="muted">Not provided</span>
                      )}
                    </div>
                    {notesValue ? (
                      <p>
                        <strong>Notes:</strong> {notesValue}
                      </p>
                    ) : null}
                    {mapUrl ? (
                      <p>
                        <strong>Map:</strong>{" "}
                        <a href={mapUrl} target="_blank" rel="noreferrer">
                          View on Google Maps
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <div className="marketplace-card-bottom">
                    <div className="marketplace-seller">
                      {owner?.avatar_url ? (
                        <img className="marketplace-seller-avatar" src={owner.avatar_url} alt={ownerName} />
                      ) : (
                        <span className="marketplace-seller-fallback">{getInitials(ownerName)}</span>
                      )}
                      <div>
                        <p className="marketplace-seller-label">Owner</p>
                        <p className="marketplace-seller-name">{ownerName}</p>
                      </div>
                    </div>
                  </div>
                  {isOwner ? (
                    <div className="marketplace-actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => (isEditing ? setEditingId("") : startEditing(rental))}
                        disabled={updateMutation.isPending}
                      >
                        {isEditing ? "Cancel Edit" : "Edit Listing"}
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={deletingId === rental.id}
                        onClick={() => handleRequestDelete(rental)}
                      >
                        {deletingId === rental.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ) : user?.id ? (
                    <div className="marketplace-message-row">
                      {rental.is_reserved || rental.is_rented ? (
                        <button className="btn btn-secondary" type="button" disabled>
                          {rental.is_rented ? "Already Rented" : "Reserved"}
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          type="button"
                          disabled={openingId === rental.id}
                          onClick={() => handleMessageOwner(rental)}
                        >
                          {openingId === rental.id ? "Opening Chat..." : "Inquire Here"}
                        </button>
                      )}
                    </div>
                  ) : null}
                  <p className="muted marketplace-posted">Posted {new Date(rental.created_at).toLocaleString()}</p>
                </div>
              </div>
              {isOwner && confirmingDeleteId === rental.id ? (
                <div className="delete-confirm">
                  <p>Delete this rental listing? This cannot be undone.</p>
                  <div className="delete-confirm-actions">
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={deletingId === rental.id}
                      onClick={() => handleConfirmDelete(rental)}
                    >
                      {deletingId === rental.id ? "Deleting..." : "Confirm Delete"}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => setConfirmingDeleteId("")}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {isEditing ? (
                <form
                  className="form-grid marketplace-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSaveEdit(rental);
                  }}
                >
                  <label>
                    Title
                    <input
                      value={editValues.title}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, title: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Category
                    <input
                      value={editValues.category}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, category: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      rows={3}
                      value={editValues.description}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </label>
                  <label>
                    Price (PHP)
                    <input
                      type="number"
                      min="1"
                      value={editValues.price}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, price: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Location
                    <input
                      value={editValues.location}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, location: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Google Maps Link (Optional)
                    <input
                      value={editValues.mapUrl}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, mapUrl: event.target.value }))}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      rows={3}
                      value={editValues.notes}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </form>
              ) : null}
              {isEditing && editError ? <p className="feedback error">{editError}</p> : null}
            </article>
          );
        })}
      </div>
      {lightboxPhotos.length ? (
        <div className="photo-lightbox" role="dialog" aria-modal="true" onClick={closeLightbox}>
          <button className="photo-lightbox-close" type="button" onClick={closeLightbox}>
            Close
          </button>
          {lightboxPhotos.length > 1 ? (
            <>
              <button
                className="photo-lightbox-arrow photo-lightbox-prev"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goLightboxPrev();
                }}
                aria-label="Previous photo"
              >
                {"<"}
              </button>
              <button
                className="photo-lightbox-arrow photo-lightbox-next"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goLightboxNext();
                }}
                aria-label="Next photo"
              >
                {">"}
              </button>
              <div className="photo-lightbox-counter">
                {lightboxIndex + 1} / {lightboxPhotos.length}
              </div>
            </>
          ) : null}
          <img
            src={lightboxPhotos[lightboxIndex]}
            alt="Rental zoomed"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}

