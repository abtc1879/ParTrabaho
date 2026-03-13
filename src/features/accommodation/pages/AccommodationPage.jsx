import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { openAccommodationConversation } from "../../chat/api";
import {
  addAccommodationListingPhotos,
  addAccommodationRoomRates,
  createAccommodationListing,
  deleteAccommodationListing,
  listAccommodationListings,
  replaceAccommodationRoomRates,
  updateAccommodationListing,
  uploadAccommodationPhoto
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

function formatPriceRange(listing) {
  const minValue = Number(listing?.price_min_php ?? listing?.price_php ?? 0);
  const maxValue = Number(listing?.price_max_php ?? listing?.price_php ?? 0);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return "PHP 0";
  if (minValue === maxValue) return `PHP ${minValue.toLocaleString()}`;
  return `PHP ${minValue.toLocaleString()} - ${maxValue.toLocaleString()}`;
}

const defaultCategories = ["Hotel", "Lodge", "Inn"];

export function AccommodationPage() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { user, isRestricted, restrictionMessage } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [roomRates, setRoomRates] = useState([{ classification: "", price: "" }]);
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
    roomRates: [{ classification: "", price: "" }],
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

  const accommodationsQuery = useQuery({
    queryKey: ["accommodation-listings"],
    queryFn: () => listAccommodationListings()
  });

  const createMutation = useMutation({
    mutationFn: ({ ownerId, payload }) => createAccommodationListing({ ownerId, payload }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accommodation-listings"] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ listingId, updates }) => updateAccommodationListing({ listingId, updates }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accommodation-listings"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (listingId) => deleteAccommodationListing(listingId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accommodation-listings"] });
    }
  });

  const categoryOptions = useMemo(() => {
    const items = accommodationsQuery.data || [];
    const unique = new Set([
      ...defaultCategories,
      ...items.map((item) => (item.category || "").trim()).filter(Boolean)
    ]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [accommodationsQuery.data]);

  const locationOptions = useMemo(() => {
    const items = accommodationsQuery.data || [];
    const unique = new Set(items.map((item) => (item.location || "").trim()).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [accommodationsQuery.data]);

  const visibleAccommodations = useMemo(() => {
    const items = accommodationsQuery.data || [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    let filtered = items.filter((listing) => {
      if (showMyListings && listing.owner_id !== user?.id) return false;
      if (filterCategory !== "all" && (listing.category || "").trim() !== filterCategory) return false;
      if (filterLocation !== "all" && (listing.location || "").trim() !== filterLocation) return false;
      if (!normalizedSearch) return true;
      const searchBase = [listing.title, listing.category, listing.description, listing.notes, listing.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchBase.includes(normalizedSearch);
    });
    if (sortBy !== "newest") {
      filtered = [...filtered].sort((a, b) => {
        const priceA = Number(a.price_min_php ?? a.price_php ?? 0);
        const priceB = Number(b.price_min_php ?? b.price_php ?? 0);
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
  }, [accommodationsQuery.data, searchTerm, filterCategory, filterLocation, sortBy, showMyListings, user?.id]);

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

  function normalizeRoomRates(rawRates) {
    const cleaned = (rawRates || [])
      .map((rate) => ({
        classification: String(rate.classification || "").trim(),
        price: Number(rate.price)
      }))
      .filter((rate) => rate.classification || Number.isFinite(rate.price));

    if (!cleaned.length) {
      return { error: "At least one room classification is required." };
    }

    for (const rate of cleaned) {
      if (!rate.classification) {
        return { error: "Room classification is required." };
      }
      if (!Number.isFinite(rate.price) || rate.price <= 0) {
        return { error: "Room price must be a number greater than zero." };
      }
    }

    const prices = cleaned.map((rate) => rate.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    return {
      rates: cleaned.map((rate) => ({
        classification: rate.classification,
        price_php: rate.price
      })),
      minPrice,
      maxPrice
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user?.id) return;
    const trimmedTitle = title.trim();
    const trimmedCategory = category.trim();
    const trimmedLocation = location.trim();
    const normalizedRates = normalizeRoomRates(roomRates);

    if (!trimmedTitle) {
      setFormError("Title is required.");
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
    if (normalizedRates.error) {
      setFormError(normalizedRates.error);
      return;
    }

    setFormError("");
    setFormSuccess("");
    try {
      const photoUrls = [];
      if (photoFiles.length) {
        for (const file of photoFiles) {
          const url = await uploadAccommodationPhoto(user.id, file);
          photoUrls.push(url);
        }
      }
      const photoUrl = photoUrls[0] || null;
      const created = await createMutation.mutateAsync({
        ownerId: user.id,
        payload: {
          title: trimmedTitle,
          category: trimmedCategory,
          description: description.trim() || null,
          priceMinPhp: normalizedRates.minPrice,
          priceMaxPhp: normalizedRates.maxPrice,
          pricePhp: normalizedRates.minPrice,
          location: trimmedLocation,
          mapUrl: mapUrl.trim() || null,
          notes: notes.trim() || null,
          photoUrl
        }
      });
      if (normalizedRates.rates?.length && created?.id) {
        await addAccommodationRoomRates({
          accommodationId: created.id,
          ownerId: user.id,
          roomRates: normalizedRates.rates
        });
      }
      if (photoUrls.length && created?.id) {
        await addAccommodationListingPhotos({
          accommodationId: created.id,
          ownerId: user.id,
          photoUrls
        });
        await queryClient.invalidateQueries({ queryKey: ["accommodation-listings"] });
      }
      setTitle("");
      setCategory("");
      setDescription("");
      setRoomRates([{ classification: "", price: "" }]);
      setLocation("");
      setMapUrl("");
      setNotes("");
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setPhotoError("");
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
      setFormSuccess("Accommodation listing posted.");
      setShowPostForm(false);
    } catch (error) {
      setFormError(error?.message || "Unable to post accommodation right now.");
    }
  }

  async function handleMessageOwner(listing) {
    if (!user?.id || listing.owner_id === user.id) return;
    setOpeningId(listing.id);
    try {
      const conversationId = await openAccommodationConversation({
        accommodationId: listing.id,
        ownerId: listing.owner_id,
        guestId: user.id
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

  function startEditing(listing) {
    setEditingId(listing.id);
    setEditValues({
      title: listing.title || "",
      category: listing.category || "",
      description: listing.description || "",
      roomRates:
        listing.room_rates && listing.room_rates.length
          ? listing.room_rates.map((rate) => ({
              classification: rate.classification || "",
              price: rate.price_php != null ? String(rate.price_php) : ""
            }))
          : [{ classification: "", price: "" }],
      location: listing.location || "",
      mapUrl: listing.map_url || "",
      notes: listing.notes || ""
    });
    setEditError("");
  }

  async function handleSaveEdit(listing) {
    if (!user?.id || editingId !== listing.id) return;
    const trimmedTitle = editValues.title.trim();
    const trimmedCategory = editValues.category.trim();
    const trimmedLocation = editValues.location.trim();
    const normalizedRates = normalizeRoomRates(editValues.roomRates);

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
    if (normalizedRates.error) {
      setEditError(normalizedRates.error);
      return;
    }

    setEditError("");
    try {
      await updateMutation.mutateAsync({
        listingId: listing.id,
        updates: {
          title: trimmedTitle,
          category: trimmedCategory,
          description: editValues.description.trim() || null,
          price_min_php: normalizedRates.minPrice,
          price_max_php: normalizedRates.maxPrice,
          price_php: normalizedRates.minPrice,
          location: trimmedLocation,
          map_url: editValues.mapUrl.trim() || null,
          notes: editValues.notes.trim() || null
        }
      });
      await replaceAccommodationRoomRates({
        accommodationId: listing.id,
        ownerId: user.id,
        roomRates: normalizedRates.rates
      });
      setEditingId("");
    } catch (error) {
      setEditError(error?.message || "Unable to update accommodation right now.");
    }
  }

  async function handleDeleteListing(listing) {
    if (!user?.id || listing.owner_id !== user.id) return;
    setDeletingId(listing.id);
    try {
      await deleteMutation.mutateAsync(listing.id);
    } catch (error) {
      setFormError(error?.message || "Unable to delete accommodation right now.");
    } finally {
      setDeletingId("");
    }
  }

  function handleRequestDelete(listing) {
    if (!user?.id || listing.owner_id !== user.id) return;
    setConfirmingDeleteId(listing.id);
  }

  async function handleConfirmDelete(listing) {
    if (confirmingDeleteId !== listing.id) return;
    await handleDeleteListing(listing);
    setConfirmingDeleteId("");
  }

  return (
    <section className="page">
      <div className="page-title-row">
        <h2>{showMyListings ? "Manage My Accommodation" : "Accommodation"}</h2>
        <button className="btn btn-primary" type="button" onClick={() => setShowPostForm((prev) => !prev)}>
          {showPostForm ? "Close Accommodation Form" : "Post Accommodation"}
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
              list="accommodation-filter-categories"
              value={filterCategoryDraft === "all" ? "" : filterCategoryDraft}
              onChange={(event) => {
                const value = event.target.value.trim();
                setFilterCategoryDraft(value ? value : "all");
              }}
              placeholder="All Categories"
            />
            <datalist id="accommodation-filter-categories">
              {categoryOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Location
            <input
              list="accommodation-filter-locations"
              value={filterLocationDraft === "all" ? "" : filterLocationDraft}
              onChange={(event) => {
                const value = event.target.value.trim();
                setFilterLocationDraft(value ? value : "all");
              }}
              placeholder="All Locations"
            />
            <datalist id="accommodation-filter-locations">
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
          <p className="muted">{visibleAccommodations.length} result(s) found.</p>
        </div>
      </div>

      {showPostForm ? (
        <article className="card">
          <p className="eyebrow">Post Accommodation</p>
          <h3>List your accommodation</h3>
          <p className="muted">Examples: hotel, lodge, inn, and more.</p>
          {isRestricted ? <p className="feedback error">{restrictionMessage}</p> : null}
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. City center hotel room"
                required
              />
            </label>
            <label>
              Category
              <input
                list="accommodation-category-options"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Select or type a category"
                required
              />
              <datalist id="accommodation-category-options">
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
            <div className="room-rate-list">
              <p className="room-rate-label">Room Classification & Price</p>
              {roomRates.map((rate, index) => (
                <div className="room-rate-row" key={`room-rate-${index}`}>
                  <label>
                    Classification
                    <input
                      value={rate.classification}
                      onChange={(event) => {
                        const next = [...roomRates];
                        next[index] = { ...next[index], classification: event.target.value };
                        setRoomRates(next);
                      }}
                      placeholder="e.g. Deluxe, Standard"
                      required
                    />
                  </label>
                  <label>
                    Price (PHP)
                    <input
                      type="number"
                      min="1"
                      value={rate.price}
                      onChange={(event) => {
                        const next = [...roomRates];
                        next[index] = { ...next[index], price: event.target.value };
                        setRoomRates(next);
                      }}
                      placeholder="e.g. 1500"
                      required
                    />
                  </label>
                  {roomRates.length > 1 ? (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => setRoomRates((prev) => prev.filter((_item, idx) => idx !== index))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setRoomRates((prev) => [...prev, { classification: "", price: "" }])}
              >
                Add Room Classification
              </button>
            </div>
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
                placeholder="Check-in details, preferred contact time"
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
                      <img src={preview} alt="Selected accommodation" />
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
              {createMutation.isPending ? "Posting..." : "Post Accommodation"}
            </button>
            {formError ? <p className="feedback error">{formError}</p> : null}
            {formSuccess ? <p className="feedback success">{formSuccess}</p> : null}
          </form>
        </article>
      ) : null}

      {accommodationsQuery.isError ? <p className="feedback error">{accommodationsQuery.error.message}</p> : null}
      {!accommodationsQuery.isLoading && visibleAccommodations.length === 0 && (accommodationsQuery.data || []).length === 0 ? (
        <EmptyState title="No accommodations yet" description="Be the first to post an accommodation listing." />
      ) : null}
      {!accommodationsQuery.isLoading && visibleAccommodations.length === 0 && (accommodationsQuery.data || []).length > 0 ? (
        <EmptyState title="No matches found" description="Try a different keyword or clear the filters." />
      ) : null}

      <div className="stack rental-list">
        {visibleAccommodations.map((listing) => {
          const owner = readSingle(listing.owner);
          const ownerName = fullName(owner) || "Owner";
          const mainPhoto = listing.photo_url || listing.photos?.[0]?.photo_url || "";
          const extraPhotos = (listing.photos || []).filter((photo) => photo.photo_url !== mainPhoto);
          const photoList = [mainPhoto, ...extraPhotos.map((photo) => photo.photo_url)].filter(Boolean);
          const hasMedia = Boolean(mainPhoto || extraPhotos.length);
          const isOwner = user?.id && listing.owner_id === user.id;
          const isEditing = editingId === listing.id;
          const descriptionParts = getDescriptionParts(listing.description);
          const mapUrl = (listing.map_url || "").trim();
          const notesValue = (listing.notes || "").trim();
          return (
            <article className="card rental-card" key={listing.id}>
              <div className={`marketplace-card-layout ${hasMedia ? "" : "marketplace-card-layout--no-media"}`}>
                {hasMedia ? (
                  <div className="marketplace-card-media">
                    <div className="marketplace-photo">
                      <button
                        className="marketplace-photo-button"
                        type="button"
                        onClick={() => openLightbox(photoList, 0)}
                        aria-label="View accommodation photo"
                      >
                        <img src={mainPhoto} alt={listing.title} loading="lazy" />
                      </button>
                    </div>
                    {extraPhotos.length ? (
                      <div className="rental-photo-strip" aria-label="More accommodation photos">
                        {extraPhotos.map((photo, index) => (
                          <button
                            className="marketplace-photo-thumb"
                            type="button"
                            key={photo.id}
                            onClick={() => openLightbox(photoList, index + 1)}
                            aria-label="View accommodation photo"
                          >
                            <img src={photo.photo_url} alt={`${listing.title} photo`} loading="lazy" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="marketplace-card-content">
                  <div className="marketplace-card-header">
                    <div>
                      <p className="eyebrow">Accommodation</p>
                      <h3>{listing.title}</h3>
                      <p className="marketplace-price">{formatPriceRange(listing)}</p>
                    </div>
                    <span className="pill marketplace">Accommodation</span>
                  </div>
                  <div className="marketplace-meta marketplace-meta-compact">
                    <p>
                      <strong>Category:</strong> {listing.category || "Not provided"}
                    </p>
                    <p>
                      <strong>Location:</strong> {listing.location || "Not provided"}
                    </p>
                    {listing.room_rates?.length ? (
                      <div className="marketplace-meta-item marketplace-meta-full">
                        <strong>Room Rates:</strong>
                        <ul className="marketplace-desc-list">
                          {listing.room_rates.map((rate) => (
                            <li key={rate.id}>
                              {rate.classification}: PHP {Number(rate.price_php || 0).toLocaleString()}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
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
                                <li key={`${listing.id}-desc-${index}`}>{item}</li>
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
                        onClick={() => (isEditing ? setEditingId("") : startEditing(listing))}
                        disabled={updateMutation.isPending}
                      >
                        {isEditing ? "Cancel Edit" : "Edit Listing"}
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={deletingId === listing.id}
                        onClick={() => handleRequestDelete(listing)}
                      >
                        {deletingId === listing.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ) : user?.id ? (
                    <div className="marketplace-message-row">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={openingId === listing.id}
                        onClick={() => handleMessageOwner(listing)}
                      >
                        {openingId === listing.id ? "Opening Chat..." : "Inquire Here"}
                      </button>
                    </div>
                  ) : null}
                  <p className="muted marketplace-posted">Posted {new Date(listing.created_at).toLocaleString()}</p>
                </div>
              </div>
              {isOwner && confirmingDeleteId === listing.id ? (
                <div className="delete-confirm">
                  <p>Delete this accommodation listing? This cannot be undone.</p>
                  <div className="delete-confirm-actions">
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={deletingId === listing.id}
                      onClick={() => handleConfirmDelete(listing)}
                    >
                      {deletingId === listing.id ? "Deleting..." : "Confirm Delete"}
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
                    handleSaveEdit(listing);
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
                  <div className="room-rate-list">
                    <p className="room-rate-label">Room Classification & Price</p>
                    {editValues.roomRates.map((rate, index) => (
                      <div className="room-rate-row" key={`edit-room-rate-${index}`}>
                        <label>
                          Classification
                          <input
                            value={rate.classification}
                            onChange={(event) => {
                              const next = [...editValues.roomRates];
                              next[index] = { ...next[index], classification: event.target.value };
                              setEditValues((prev) => ({ ...prev, roomRates: next }));
                            }}
                            placeholder="e.g. Deluxe, Standard"
                            required
                          />
                        </label>
                        <label>
                          Price (PHP)
                          <input
                            type="number"
                            min="1"
                            value={rate.price}
                            onChange={(event) => {
                              const next = [...editValues.roomRates];
                              next[index] = { ...next[index], price: event.target.value };
                              setEditValues((prev) => ({ ...prev, roomRates: next }));
                            }}
                            placeholder="e.g. 1500"
                            required
                          />
                        </label>
                        {editValues.roomRates.length > 1 ? (
                          <button
                            className="btn btn-danger"
                            type="button"
                            onClick={() =>
                              setEditValues((prev) => ({
                                ...prev,
                                roomRates: prev.roomRates.filter((_item, idx) => idx !== index)
                              }))
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() =>
                        setEditValues((prev) => ({
                          ...prev,
                          roomRates: [...prev.roomRates, { classification: "", price: "" }]
                        }))
                      }
                    >
                      Add Room Classification
                    </button>
                  </div>
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
                  setLightboxIndex((prev) => (prev - 1 + lightboxPhotos.length) % lightboxPhotos.length);
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
                  setLightboxIndex((prev) => (prev + 1) % lightboxPhotos.length);
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
            alt="Accommodation zoomed"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}
