import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { openMarketplaceConversation } from "../../chat/api";
import { getProfileById } from "../../profile/api";
import { formatAddress } from "../../profile/utils";
import {
  listMarketplaceProducts,
  createMarketplaceProduct,
  updateMarketplaceProduct,
  deleteMarketplaceProduct,
  uploadMarketplaceProductPhoto,
  addMarketplaceProductPhotos,
  deleteMarketplaceProductPhoto,
  placeMarketplaceOrder
} from "../api";
import { EmptyState } from "../../../components/common/EmptyState";

const MARKETPLACE_PAGE_SIZE = 24;

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

function formatRating(profile) {
  const avg = Number(profile?.seller_rating_avg ?? profile?.rating_avg ?? 0);
  const count = Number(profile?.seller_rating_count ?? profile?.rating_count ?? 0);
  if (count <= 0) return "No ratings yet";
  return `\u2605 ${avg.toFixed(1)} (${count})`;
}

function suggestCategory(input) {
  const text = String(input || "").toLowerCase();
  if (!text) return "";
  const rules = [
    { category: "Tools", keywords: ["tool", "wrench", "drill", "hammer", "screw", "saw", "grinder", "welder", "welding", "pliers"] },
    { category: "Electronics", keywords: ["phone", "laptop", "tablet", "camera", "tv", "speaker", "headphone", "charger", "battery"] },
    { category: "Appliances", keywords: ["ref", "refrigerator", "washer", "dryer", "oven", "microwave", "fan", "aircon", "aircon"] },
    { category: "Furniture", keywords: ["chair", "table", "sofa", "bed", "cabinet", "shelf", "desk", "drawer"] },
    { category: "Automotive", keywords: ["car", "motor", "motorcycle", "bike", "tire", "rim", "engine", "battery", "brake"] },
    { category: "Construction", keywords: ["cement", "steel", "lumber", "wood", "tile", "paint", "pipe", "wire", "nail"] },
    { category: "Clothing", keywords: ["shirt", "pants", "shoes", "jacket", "dress", "shorts", "bag"] },
    { category: "Sports", keywords: ["ball", "racket", "helmet", "glove", "gym", "fitness"] },
    { category: "Office", keywords: ["printer", "ink", "paper", "chair", "monitor", "keyboard", "mouse"] },
    { category: "Beauty", keywords: ["makeup", "skincare", "lotion", "perfume", "soap"] }
  ];
  for (const rule of rules) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.category;
    }
  }
  return "";
}

export function MarketplacePage() {
  const { user, isRestricted, restrictionMessage } = useAuth();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [specification, setSpecification] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [location, setLocation] = useState("");
  const [locationTouched, setLocationTouched] = useState(false);
  const [mapUrl, setMapUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [buyingId, setBuyingId] = useState("");
  const [confirmingOrderId, setConfirmingOrderId] = useState("");
  const [confirmingQuantity, setConfirmingQuantity] = useState(1);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState("");
  const [buyQuantities, setBuyQuantities] = useState({});
  const [buyErrors, setBuyErrors] = useState({});
  const [editValues, setEditValues] = useState({
    name: "",
    category: "",
    specification: "",
    price: "",
    stock: "",
    location: "",
    mapUrl: "",
    notes: "",
    photoUrl: ""
  });
  const [editError, setEditError] = useState("");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [photoError, setPhotoError] = useState("");
  const [editPhotoFiles, setEditPhotoFiles] = useState([]);
  const [editPhotoPreviews, setEditPhotoPreviews] = useState([]);
  const photoInputRef = useRef(null);
  const editPhotoInputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [marketSort, setMarketSort] = useState("newest");
  const [searchDraft, setSearchDraft] = useState("");
  const [filterCategoryDraft, setFilterCategoryDraft] = useState("all");
  const [filterLocationDraft, setFilterLocationDraft] = useState("all");
  const [marketSortDraft, setMarketSortDraft] = useState("newest");
  const [manageSearch, setManageSearch] = useState("");
  const [manageCategory, setManageCategory] = useState("all");
  const [manageStatus, setManageStatus] = useState("all");
  const [manageSort, setManageSort] = useState("newest");
  const [manageSearchDraft, setManageSearchDraft] = useState("");
  const [manageCategoryDraft, setManageCategoryDraft] = useState("all");
  const [manageStatusDraft, setManageStatusDraft] = useState("all");
  const [manageSortDraft, setManageSortDraft] = useState("newest");
  const [showPostForm, setShowPostForm] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [editCategoryTouched, setEditCategoryTouched] = useState(false);
  const [lightboxPhotos, setLightboxPhotos] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showMyListings, setShowMyListings] = useState(false);
  const autoLocationRef = useRef("");
  const maxPhotos = 5;

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => getProfileById(user.id),
    enabled: !!user?.id
  });

  const productsQuery = useInfiniteQuery({
    queryKey: ["marketplace-products", "infinite"],
    queryFn: ({ pageParam = 1 }) => listMarketplaceProducts({ page: pageParam, pageSize: MARKETPLACE_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!Array.isArray(lastPage) || lastPage.length < MARKETPLACE_PAGE_SIZE) return undefined;
      return allPages.length + 1;
    }
  });

  const loadedProducts = useMemo(
    () => productsQuery.data?.pages?.flatMap((page) => page || []) || [],
    [productsQuery.data]
  );

  const createMutation = useMutation({
    mutationFn: ({ sellerId, payload }) => createMarketplaceProduct({ sellerId, ...payload }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ productId, updates }) => updateMarketplaceProduct({ productId, updates }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (productId) => deleteMarketplaceProduct(productId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
    }
  });

  const orderMutation = useMutation({
    mutationFn: ({ productId, quantity }) => placeMarketplaceOrder({ productId, quantity }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
    }
  });

  const categoryOptions = useMemo(() => {
    const items = loadedProducts;
    const unique = new Set(items.map((item) => (item.category || "").trim()).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [loadedProducts]);

  const locationOptions = useMemo(() => {
    const items = loadedProducts;
    const unique = new Set(items.map((item) => (item.location || "").trim()).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [loadedProducts]);

  const visibleProducts = useMemo(() => {
    const items = loadedProducts;
    const activeSearch = showMyListings ? manageSearch : searchTerm;
    const activeCategory = showMyListings ? manageCategory : filterCategory;
    const activeLocation = showMyListings ? "all" : filterLocation;
    const normalizedSearch = activeSearch.trim().toLowerCase();
    let filtered = items.filter((product) => {
      if (showMyListings && user?.id && product.seller_id !== user.id) return false;
      if (!showMyListings && user?.id && product.seller_id === user.id) return false;
      if (!showMyListings && (product.sold_out || product.stock === 0)) return false;
      if (activeCategory !== "all" && (product.category || "").trim() !== activeCategory) return false;
      if (activeLocation !== "all" && (product.location || "").trim() !== activeLocation) return false;
      if (!normalizedSearch) return true;
      const searchBase = [
        product.name,
        product.category,
        product.specification,
        product.notes,
        product.location
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchBase.includes(normalizedSearch);
    });
    if (showMyListings && manageStatus !== "all") {
      filtered = filtered.filter((product) => {
        const isSoldOut = product.sold_out || product.stock === 0;
        if (manageStatus === "active") return !isSoldOut;
        if (manageStatus === "sold_out") return isSoldOut;
        return true;
      });
    }
    if (showMyListings && manageSort !== "newest") {
      filtered = [...filtered].sort((a, b) => {
        const priceA = Number(a.price_php || 0);
        const priceB = Number(b.price_php || 0);
        const stockA = Number(a.stock || 0);
        const stockB = Number(b.stock || 0);
        switch (manageSort) {
          case "oldest":
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case "price_high":
            return priceB - priceA;
          case "price_low":
            return priceA - priceB;
          case "stock_high":
            return stockB - stockA;
          case "stock_low":
            return stockA - stockB;
          case "name_az":
            return (a.name || "").localeCompare(b.name || "");
          case "name_za":
            return (b.name || "").localeCompare(a.name || "");
          default:
            return 0;
        }
      });
    }
    if (!showMyListings && marketSort !== "newest") {
      filtered = [...filtered].sort((a, b) => {
        const priceA = Number(a.price_php || 0);
        const priceB = Number(b.price_php || 0);
        switch (marketSort) {
          case "oldest":
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case "price_high":
            return priceB - priceA;
          case "price_low":
            return priceA - priceB;
          case "name_az":
            return (a.name || "").localeCompare(b.name || "");
          case "name_za":
            return (b.name || "").localeCompare(a.name || "");
          default:
            return 0;
        }
      });
    }
    return filtered;
  }, [
    loadedProducts,
    searchTerm,
    filterCategory,
    filterLocation,
    showMyListings,
    user?.id,
    marketSort,
    manageSearch,
    manageCategory,
    manageStatus,
    manageSort
  ]);

  useEffect(() => {
    if (!photoFiles.length) {
      setPhotoPreviews([]);
      return undefined;
    }
    const objectUrls = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(objectUrls);
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [photoFiles]);

  useEffect(() => {
    if (!editPhotoFiles.length) {
      setEditPhotoPreviews([]);
      return undefined;
    }
    const objectUrls = editPhotoFiles.map((file) => URL.createObjectURL(file));
    setEditPhotoPreviews(objectUrls);
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [editPhotoFiles]);

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

  useEffect(() => {
    if (showMyListings) {
      setManageSearchDraft(manageSearch);
      setManageCategoryDraft(manageCategory);
      setManageStatusDraft(manageStatus);
      setManageSortDraft(manageSort);
    } else {
      setSearchDraft(searchTerm);
      setFilterCategoryDraft(filterCategory);
      setFilterLocationDraft(filterLocation);
      setMarketSortDraft(marketSort);
    }
  }, [showMyListings]);

  useEffect(() => {
    if (!confirmingOrderId) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setConfirmingOrderId("");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmingOrderId]);

  useEffect(() => {
    if (!confirmingOrderId) return;
    const items = loadedProducts;
    const current = items.find((product) => product.id === confirmingOrderId);
    if (!current || current.sold_out || current.stock === 0) {
      setConfirmingOrderId("");
    }
  }, [confirmingOrderId, loadedProducts]);

  useEffect(() => {
    if (!confirmingDeleteId) return;
    const items = loadedProducts;
    const exists = items.some((product) => product.id === confirmingDeleteId);
    if (!exists) {
      setConfirmingDeleteId("");
    }
  }, [confirmingDeleteId, loadedProducts]);

  useEffect(() => {
    if (!showPostForm || locationTouched) return;
    const address = formatAddress(profileQuery.data, "").trim();
    if (!address) return;
    const current = location.trim();
    if (!current || current === autoLocationRef.current) {
      setLocation(address);
      autoLocationRef.current = address;
    }
  }, [showPostForm, locationTouched, location, profileQuery.data]);

  useEffect(() => {
    const params = new URLSearchParams(routeLocation.search);
    const wantsMine = params.get("view") === "mine" || params.get("mine") === "1";
    if (wantsMine) {
      setShowMyListings(true);
    }
  }, [routeLocation.search]);

  useEffect(() => {
    if (categoryTouched) return;
    const suggestion = suggestCategory([name, specification, notes, photoFiles.map((file) => file.name).join(" ")].filter(Boolean).join(" "));
    if (suggestion && suggestion !== category) {
      setCategory(suggestion);
    }
  }, [name, specification, notes, photoFiles, categoryTouched, category]);

  useEffect(() => {
    if (!editingId || editCategoryTouched) return;
    const suggestion = suggestCategory(
      [
        editValues.name,
        editValues.specification,
        editValues.notes,
        editPhotoFiles.map((file) => file.name).join(" ")
      ]
        .filter(Boolean)
        .join(" ")
    );
    if (suggestion && suggestion !== editValues.category) {
      setEditValues((prev) => ({ ...prev, category: suggestion }));
    }
  }, [editingId, editValues, editPhotoFiles, editCategoryTouched]);

  function validatePhotoFile(file, onError) {
    if (!file) return false;
    if (!file.type.startsWith("image/")) {
      onError("Please select an image file.");
      return false;
    }
    const maxSizeMb = 5;
    if (file.size > maxSizeMb * 1024 * 1024) {
      onError(`Image must be smaller than ${maxSizeMb}MB.`);
      return false;
    }
    onError("");
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
    const validFiles = files.filter((file) => validatePhotoFile(file, setPhotoError));
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
    setPhotoFiles((prev) => prev.filter((_, idx) => idx !== index));
    setPhotoError("");
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }

  function handleSelectEditPhoto(event, currentCount = 0) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const existingCount = currentCount;
    if (existingCount >= maxPhotos) {
      setEditError(`You can upload up to ${maxPhotos} photos.`);
      event.target.value = "";
      return;
    }
    const validFiles = files.filter((file) => validatePhotoFile(file, setEditError));
    if (!validFiles.length) {
      event.target.value = "";
      return;
    }
    const remainingSlots = maxPhotos - existingCount;
    const nextFiles = validFiles.slice(0, remainingSlots);
    if (validFiles.length > remainingSlots) {
      setEditError(`Only ${remainingSlots} more photo(s) allowed.`);
    } else {
      setEditError("");
    }
    setEditPhotoFiles((prev) => [...prev, ...nextFiles]);
  }

  function handleRemoveEditPhoto(index) {
    setEditPhotoFiles((prev) => prev.filter((_, idx) => idx !== index));
    setEditError("");
    if (editPhotoInputRef.current) {
      editPhotoInputRef.current.value = "";
    }
  }

  function startEditing(product) {
    setEditingId(product.id);
    setEditValues({
      name: product.name || "",
      category: product.category || "",
      specification: product.specification || "",
      price: product.price_php != null ? String(product.price_php) : "",
      stock: product.stock != null ? String(product.stock) : "1",
      location: product.location || "",
      mapUrl: product.map_url || "",
      notes: product.notes || "",
      photoUrl: product.photo_url || ""
    });
    setEditPhotoFiles([]);
    setEditPhotoPreviews([]);
    setEditError("");
    setEditCategoryTouched(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user?.id) return;
    const trimmedName = name.trim();
    const trimmedCategory = category.trim();
    const trimmedLocation = location.trim();
    const priceValue = Number(price);
    const stockValue = Number(stock);

    if (!trimmedName) {
      setFormError("Product name is required.");
      return;
    }
    if (!trimmedCategory) {
      setFormError("Product category is required.");
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
    if (!Number.isFinite(stockValue) || stockValue < 0) {
      setFormError("Stock must be zero or more.");
      return;
    }
    setFormError("");
    try {
      const photoUrls = [];
      if (photoFiles.length) {
        for (const file of photoFiles) {
          const url = await uploadMarketplaceProductPhoto(user.id, file);
          photoUrls.push(url);
        }
      }
      const primaryPhoto = photoUrls[0] || null;
      const created = await createMutation.mutateAsync({
        sellerId: user.id,
        payload: {
          name: trimmedName,
          category: trimmedCategory,
          specification: specification.trim() || null,
          pricePhp: priceValue,
          stock: stockValue,
          sold_out: stockValue === 0,
          location: trimmedLocation,
          mapUrl: mapUrl.trim() || null,
          notes: notes.trim() || null,
          photoUrl: primaryPhoto
        }
      });
      if (photoUrls.length) {
        await addMarketplaceProductPhotos({
          productId: created?.id,
          sellerId: user.id,
          photoUrls
        });
        await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
      }
      setName("");
      setCategory("");
      setSpecification("");
      setPrice("");
      setStock("1");
      setLocation("");
      setMapUrl("");
      setNotes("");
      setCategoryTouched(false);
      setLocationTouched(false);
      autoLocationRef.current = "";
      setPhotoFiles([]);
      setPhotoPreviews([]);
    } catch (error) {
      setFormError(error?.message || "Unable to post product right now.");
    }
  }

  async function handleMessageSeller(product) {
    if (!user?.id) return;
    if (product.seller_id === user.id) return;
    setOpeningId(product.id);
    try {
      const conversationId = await openMarketplaceConversation({
        productId: product.id,
        sellerId: product.seller_id,
        buyerId: user.id
      });
      await queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
      if (conversationId) {
        navigate(`/chat/${conversationId}`);
      }
    } catch (error) {
      setFormError(error?.message || "Unable to open chat with seller.");
    } finally {
      setOpeningId("");
    }
  }

  async function handleSaveEdit(product) {
    if (!user?.id || editingId !== product.id) return;
    const trimmedName = editValues.name.trim();
    const trimmedCategory = editValues.category.trim();
    const trimmedLocation = editValues.location.trim();
    const priceValue = Number(editValues.price);
    const stockValue = Number(editValues.stock);

    if (!trimmedName) {
      setEditError("Product name is required.");
      return;
    }
    if (!trimmedCategory) {
      setEditError("Product category is required.");
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
    if (!Number.isFinite(stockValue) || stockValue < 0) {
      setEditError("Stock must be zero or more.");
      return;
    }

    setEditError("");
    try {
      let photoUrl = editValues.photoUrl || null;
      const newPhotoUrls = [];
      if (editPhotoFiles.length) {
        for (const file of editPhotoFiles) {
          const url = await uploadMarketplaceProductPhoto(user.id, file);
          newPhotoUrls.push(url);
        }
        if (!photoUrl) {
          photoUrl = newPhotoUrls[0];
        }
      }
      await updateMutation.mutateAsync({
        productId: product.id,
        updates: {
          name: trimmedName,
          category: trimmedCategory,
          specification: editValues.specification.trim() || null,
          price_php: priceValue,
          stock: stockValue,
          sold_out: stockValue === 0,
          location: trimmedLocation,
          map_url: editValues.mapUrl.trim() || null,
          notes: editValues.notes.trim() || null,
          photo_url: photoUrl
        }
      });
      if (newPhotoUrls.length) {
        await addMarketplaceProductPhotos({
          productId: product.id,
          sellerId: user.id,
          photoUrls: newPhotoUrls
        });
        await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
      }
      setEditingId("");
      setEditPhotoFiles([]);
      setEditPhotoPreviews([]);
      if (editPhotoInputRef.current) {
        editPhotoInputRef.current.value = "";
      }
    } catch (error) {
      setEditError(error?.message || "Unable to update product right now.");
    }
  }

  async function handleDeleteProduct(product) {
    if (!user?.id || product.seller_id !== user.id) return;
    setDeletingId(product.id);
    try {
      await deleteMutation.mutateAsync(product.id);
    } catch (error) {
      setFormError(error?.message || "Unable to delete product right now.");
    } finally {
      setDeletingId("");
    }
  }

  function handleRequestDelete(product) {
    if (!user?.id || product.seller_id !== user.id) return;
    setConfirmingDeleteId(product.id);
  }

  async function handleConfirmDelete(product) {
    if (confirmingDeleteId !== product.id) return;
    await handleDeleteProduct(product);
    setConfirmingDeleteId("");
  }

  async function handlePlaceOrder(product) {
    if (!user?.id || product.seller_id === user.id) return;
    const rawQuantity = buyQuantities[product.id] ?? 1;
    const quantity = Number(rawQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setBuyErrors((prev) => ({ ...prev, [product.id]: "Quantity must be at least 1." }));
      return;
    }
    if (product.stock != null && quantity > product.stock) {
      setBuyErrors((prev) => ({ ...prev, [product.id]: "Quantity exceeds available stock." }));
      return;
    }
    setBuyErrors((prev) => ({ ...prev, [product.id]: "" }));
    setConfirmingOrderId(product.id);
    setConfirmingQuantity(quantity);
  }

  async function handleConfirmOrder(product) {
    if (!user?.id || product.seller_id === user.id) return;
    const quantity = confirmingOrderId === product.id ? confirmingQuantity : Number(buyQuantities[product.id] ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setBuyErrors((prev) => ({ ...prev, [product.id]: "Quantity must be at least 1." }));
      setConfirmingOrderId("");
      return;
    }
    if (product.stock != null && quantity > product.stock) {
      setBuyErrors((prev) => ({ ...prev, [product.id]: "Quantity exceeds available stock." }));
      setConfirmingOrderId("");
      return;
    }
    setConfirmingOrderId("");
    setBuyErrors((prev) => ({ ...prev, [product.id]: "" }));
    setBuyingId(product.id);
    try {
      await orderMutation.mutateAsync({ productId: product.id, quantity });
      setBuyQuantities((prev) => ({ ...prev, [product.id]: 1 }));
    } catch (error) {
      setBuyErrors((prev) => ({ ...prev, [product.id]: error?.message || "Unable to place order right now." }));
    } finally {
      setBuyingId("");
    }
  }

  async function handleDeleteExistingPhoto(product, photo) {
    if (!photo?.id) return;
    try {
      await deleteMarketplaceProductPhoto(photo.id);
      if (photo.photo_url && photo.photo_url === product.photo_url) {
        const remaining = (product.photos || []).filter((item) => item.id !== photo.id);
        const nextPrimary = remaining[0]?.photo_url || null;
        await updateMarketplaceProduct({
          productId: product.id,
          updates: {
            photo_url: nextPrimary
          }
        });
        setEditValues((prev) => ({ ...prev, photoUrl: nextPrimary || "" }));
      }
      await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
    } catch (error) {
      setEditError(error?.message || "Unable to remove photo right now.");
    }
  }

  return (
    <section className="page marketplace-page">
      <div className="page-title-row">
        <h2>{showMyListings ? "Manage My Products" : "Marketplace"}</h2>
        <div className="marketplace-top-actions">
          <button className="btn btn-primary" type="button" onClick={() => setShowPostForm((prev) => !prev)}>
            {showPostForm ? "Close Product Form" : "Post Product"}
          </button>
        </div>
      </div>

      <div className={`card marketplace-filter-card ${showMyListings ? "inventory-filter-card" : ""}`}>
        <div className="marketplace-filter-head">
          <h3>{showMyListings ? "Inventory Search & Filters" : "Search & Filters"}</h3>
        </div>
        <div className="marketplace-filter-search">
          <label>
            <span className="sr-only">Search</span>
            <input
              type="search"
              value={showMyListings ? manageSearchDraft : searchDraft}
              onChange={(event) =>
                showMyListings ? setManageSearchDraft(event.target.value) : setSearchDraft(event.target.value)
              }
              placeholder="Search name, category, notes, or location"
            />
          </label>
        </div>
        <div className={`marketplace-filter-grid ${showMyListings ? "inventory-filter-grid" : ""}`}>
          <label>
            Category
            <select
              value={showMyListings ? manageCategoryDraft : filterCategoryDraft}
              onChange={(event) =>
                showMyListings ? setManageCategoryDraft(event.target.value) : setFilterCategoryDraft(event.target.value)
              }
            >
              <option value="all">All Categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {!showMyListings ? (
            <label>
              Location
              <select value={filterLocationDraft} onChange={(event) => setFilterLocationDraft(event.target.value)}>
                <option value="all">All Locations</option>
                {locationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Status
              <select value={manageStatusDraft} onChange={(event) => setManageStatusDraft(event.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="sold_out">Sold Out</option>
              </select>
            </label>
          )}
          <label>
            Sort By
            <select
              value={showMyListings ? manageSortDraft : marketSortDraft}
              onChange={(event) =>
                showMyListings ? setManageSortDraft(event.target.value) : setMarketSortDraft(event.target.value)
              }
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="price_high">Price: High to Low</option>
              <option value="price_low">Price: Low to High</option>
              {showMyListings ? (
                <>
                  <option value="stock_high">Stock: High to Low</option>
                  <option value="stock_low">Stock: Low to High</option>
                </>
              ) : null}
              <option value="name_az">Name: A to Z</option>
              <option value="name_za">Name: Z to A</option>
            </select>
          </label>
        </div>
        <div className="marketplace-filter-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={
              showMyListings
                ? manageSearchDraft === manageSearch &&
                  manageCategoryDraft === manageCategory &&
                  manageStatusDraft === manageStatus &&
                  manageSortDraft === manageSort
                : searchDraft === searchTerm &&
                  filterCategoryDraft === filterCategory &&
                  filterLocationDraft === filterLocation &&
                  marketSortDraft === marketSort
            }
            onClick={() => {
              if (showMyListings) {
                setManageSearch(manageSearchDraft);
                setManageCategory(manageCategoryDraft);
                setManageStatus(manageStatusDraft);
                setManageSort(manageSortDraft);
              } else {
                setSearchTerm(searchDraft);
                setFilterCategory(filterCategoryDraft);
                setFilterLocation(filterLocationDraft);
                setMarketSort(marketSortDraft);
              }
            }}
          >
            Apply Filters
          </button>
          {showMyListings
            ? manageSearch ||
              manageCategory !== "all" ||
              manageStatus !== "all" ||
              manageSort !== "newest" ||
              manageSearchDraft ||
              manageCategoryDraft !== "all" ||
              manageStatusDraft !== "all" ||
              manageSortDraft !== "newest"
            : searchTerm ||
              filterCategory !== "all" ||
              filterLocation !== "all" ||
              marketSort !== "newest" ||
              searchDraft ||
              filterCategoryDraft !== "all" ||
              filterLocationDraft !== "all" ||
              marketSortDraft !== "newest" ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    if (showMyListings) {
                      setManageSearch("");
                      setManageCategory("all");
                      setManageStatus("all");
                      setManageSort("newest");
                      setManageSearchDraft("");
                      setManageCategoryDraft("all");
                      setManageStatusDraft("all");
                      setManageSortDraft("newest");
                    } else {
                      setSearchTerm("");
                      setFilterCategory("all");
                      setFilterLocation("all");
                      setMarketSort("newest");
                      setSearchDraft("");
                      setFilterCategoryDraft("all");
                      setFilterLocationDraft("all");
                      setMarketSortDraft("newest");
                    }
                  }}
                >
                  Clear Filters
                </button>
              ) : null}
          <p className="muted">{visibleProducts.length} result(s) found.</p>
        </div>
      </div>

      {showPostForm ? (
        <div className="card marketplace-post-card">
          <div className="marketplace-post-head">
            <h3>Post a Product</h3>
            <p className="muted">Sell any product by sharing details and your contact availability.</p>
          </div>
          {isRestricted ? <p className="feedback error">{restrictionMessage}</p> : null}
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Product Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Welding Machine" required />
            </label>
                <label>
                  Category
                  <input
                    value={category}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCategory(value);
                      setCategoryTouched(Boolean(value.trim()));
                    }}
                    placeholder="e.g. Tools, Electronics"
                    required
                  />
                </label>
            <label>
              Specification
              <input
                value={specification}
                onChange={(event) => setSpecification(event.target.value)}
                placeholder="Model, size, or key specs"
              />
            </label>
            <label>
              Price (PHP)
              <input
                type="number"
                min="1"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="e.g. 1500"
                required
              />
            </label>
            <label>
              Stocks
              <input
                type="number"
                min="0"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                placeholder="e.g. 10"
                required
              />
            </label>
            <label>
              Location
              <input
                value={location}
                onChange={(event) => {
                  setLocation(event.target.value);
                  setLocationTouched(true);
                }}
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
                placeholder="Condition, inclusions, or preferred contact time"
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
              <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={handleSelectPhoto} hidden />
            {photoPreviews.length ? (
              <div className="marketplace-photo-preview-list">
                {photoPreviews.map((preview, index) => (
                  <div className="marketplace-photo-preview" key={`${preview}-${index}`}>
                    <img src={preview} alt="Selected product" />
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
              {createMutation.isPending ? "Posting..." : "Post Product"}
            </button>
          </form>
          {formError ? <p className="feedback error">{formError}</p> : null}
        </div>
      ) : null}

      {productsQuery.isError ? <p className="feedback error">{productsQuery.error?.message || "Unable to load products."}</p> : null}
      {!productsQuery.isLoading && visibleProducts.length === 0 && loadedProducts.length === 0 ? (
        <EmptyState title="No products yet" description="Be the first to list an item for sale." />
      ) : null}
      {!productsQuery.isLoading && visibleProducts.length === 0 && loadedProducts.length > 0 ? (
        <EmptyState title="No matches found" description="Try a different keyword or clear the filters." />
      ) : null}

      <div className="stack marketplace-list">
        {visibleProducts.map((product) => {
          const seller = readSingle(product.seller);
          const sellerName = fullName(seller) || "Seller";
          const sellerProfilePath = seller?.id ? `/profiles/${seller.id}` : "";
          const isOwner = user?.id === product.seller_id;
          const isEditing = editingId === product.id;
          const mainPhoto = product.photo_url || product.photos?.[0]?.photo_url || "";
          const extraPhotos = (product.photos || []).filter((photo) => photo.photo_url !== mainPhoto);
          const photoList = [mainPhoto, ...extraPhotos.map((photo) => photo.photo_url)].filter(Boolean);
          const hasMedia = Boolean(mainPhoto || extraPhotos.length);
          const isSoldOut = product.sold_out || product.stock === 0;
          if (showMyListings && isOwner) {
            return (
              <article className="card inventory-card" key={product.id}>
                <div className="inventory-main">
                  {mainPhoto ? (
                    <button
                      className="inventory-thumb"
                      type="button"
                      onClick={() => openLightbox(photoList, 0)}
                      aria-label="View product photo"
                    >
                      <img src={mainPhoto} alt={product.name} loading="lazy" />
                    </button>
                  ) : (
                    <div className="inventory-thumb inventory-thumb-empty">
                      <span>No photo</span>
                    </div>
                  )}
                  <div className="inventory-info">
                    <p className="eyebrow">Listing</p>
                    <h3>{product.name}</h3>
                    <p className="marketplace-price">PHP {Number(product.price_php || 0).toLocaleString()}</p>
                    <div className="inventory-meta">
                      <span>
                        <strong>Category:</strong> {product.category || "Not provided"}
                      </span>
                      <span>
                        <strong>Stocks:</strong> {product.stock != null ? product.stock : "Not provided"}
                      </span>
                      <span>
                        <strong>Location:</strong> {product.location || "Not provided"}
                      </span>
                      {product.map_url ? (
                        <span>
                          <strong>Map:</strong>{" "}
                          <a href={product.map_url} target="_blank" rel="noreferrer">
                            View on Google Maps
                          </a>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="inventory-status">
                  <span className={`pill ${isSoldOut ? "cancelled" : "marketplace"}`}>
                    {isSoldOut ? "Sold Out" : "Active"}
                  </span>
                  <p className="inventory-date">Posted {new Date(product.created_at).toLocaleString()}</p>
                </div>
                </div>
                <div className="inventory-actions">
                  <p className="inventory-date">Posted {new Date(product.created_at).toLocaleString()}</p>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => (isEditing ? setEditingId("") : startEditing(product))}
                    disabled={updateMutation.isPending}
                  >
                    {isEditing ? "Cancel Edit" : "Edit Listing"}
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={deletingId === product.id}
                    onClick={() => handleRequestDelete(product)}
                  >
                    {deletingId === product.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
                {confirmingDeleteId === product.id ? (
                  <div className="delete-confirm">
                    <p>Delete this product listing? This cannot be undone.</p>
                    <div className="delete-confirm-actions">
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={deletingId === product.id}
                        onClick={() => handleConfirmDelete(product)}
                      >
                        {deletingId === product.id ? "Deleting..." : "Confirm Delete"}
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
                      handleSaveEdit(product);
                    }}
                  >
                    <label>
                      Product Name
                      <input
                        value={editValues.name}
                        onChange={(event) => setEditValues((prev) => ({ ...prev, name: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      Category
                      <input
                        value={editValues.category}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEditValues((prev) => ({ ...prev, category: value }));
                          setEditCategoryTouched(Boolean(value.trim()));
                        }}
                        required
                      />
                    </label>
                    <label>
                      Specification
                      <input
                        value={editValues.specification}
                        onChange={(event) => setEditValues((prev) => ({ ...prev, specification: event.target.value }))}
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
                      Stocks
                      <input
                        type="number"
                        min="0"
                        value={editValues.stock}
                        onChange={(event) => setEditValues((prev) => ({ ...prev, stock: event.target.value }))}
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
                    <div className="map-pin-row">
                      <p className="map-pin-label">Pin Location (Google Maps)</p>
                      <div className="map-pin-actions">
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => {
                            const query = editValues.location.trim();
                            const target = query
                              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
                              : "https://www.google.com/maps";
                            window.open(target, "_blank", "noopener,noreferrer");
                          }}
                        >
                          Open Google Maps
                        </button>
                        {editValues.mapUrl.trim() ? (
                          <a className="btn btn-secondary" href={editValues.mapUrl.trim()} target="_blank" rel="noreferrer">
                            View Pinned
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <label>
                      Google Maps Link (Optional)
                      <input
                        value={editValues.mapUrl}
                        onChange={(event) => setEditValues((prev) => ({ ...prev, mapUrl: event.target.value }))}
                        placeholder="Paste Google Maps link here"
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
                    <div className="marketplace-photo-upload">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => editPhotoInputRef.current?.click()}
                        disabled={updateMutation.isPending}
                      >
                        {editPhotoPreviews.length || editValues.photoUrl ? "Add More Photos" : "Add Photo"} (
                        {(product.photos?.length || 0) + (editPhotoPreviews.length || 0)}/{maxPhotos})
                      </button>
                      <input
                        ref={editPhotoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) =>
                          handleSelectEditPhoto(
                            event,
                            (product.photos?.length || 0) + (editPhotoPreviews.length || 0)
                          )
                        }
                        hidden
                      />
                      {product.photos?.length ? (
                        <div className="marketplace-photo-preview-list">
                          {product.photos.map((photo) => (
                            <div className="marketplace-photo-preview" key={photo.id}>
                              <img src={photo.photo_url} alt="Existing product" />
                              <button
                                className="btn btn-danger"
                                type="button"
                                onClick={() => handleDeleteExistingPhoto(product, photo)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {editPhotoPreviews.length ? (
                        <div className="marketplace-photo-preview-list">
                          {editPhotoPreviews.map((preview, index) => (
                            <div className="marketplace-photo-preview" key={`${preview}-${index}`}>
                              <img src={preview} alt="Selected product" />
                              <button className="btn btn-danger" type="button" onClick={() => handleRemoveEditPhoto(index)}>
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                  </form>
                ) : null}
                {isEditing && editError ? <p className="feedback error">{editError}</p> : null}
              </article>
            );
          }
          return (
            <article className="card marketplace-card" key={product.id}>
              <div className={`marketplace-card-layout ${hasMedia ? "" : "marketplace-card-layout--no-media"}`}>
                {hasMedia ? (
                  <div className="marketplace-card-media">
                    {mainPhoto ? (
                      <div className="marketplace-photo">
                        <button
                          className="marketplace-photo-button"
                          type="button"
                          onClick={() => openLightbox(photoList, 0)}
                          aria-label="View product photo"
                        >
                          <img src={mainPhoto} alt={product.name} loading="lazy" />
                        </button>
                      </div>
                    ) : null}
                    {extraPhotos.length ? (
                      <div className="marketplace-photo-grid">
                        {extraPhotos.map((photo, index) => (
                          <button
                            key={photo.id}
                            className="marketplace-photo-thumb"
                            type="button"
                            onClick={() => openLightbox(photoList, index + 1)}
                            aria-label="View product photo"
                          >
                            <img src={photo.photo_url} alt={`${product.name} photo`} loading="lazy" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="marketplace-card-content">
                  <div className="marketplace-card-header">
                    <div>
                      <p className="eyebrow">For Sale</p>
                      <h3>{product.name}</h3>
                      <p className="marketplace-price">PHP {Number(product.price_php || 0).toLocaleString()}</p>
                    </div>
                    <span className={`pill ${isSoldOut ? "cancelled" : "marketplace"}`}>
                      {isSoldOut ? "Sold Out" : "Marketplace"}
                    </span>
                  </div>
                  <div className="marketplace-meta marketplace-meta-compact">
                    <p>
                      <strong>Category:</strong> {product.category || "Not provided"}
                    </p>
                    <p>
                      <strong>Specification:</strong> {product.specification || "Not provided"}
                    </p>
                    <p>
                      <strong>Stocks:</strong> {product.stock != null ? product.stock : "Not provided"}
                    </p>
                    <p>
                      <strong>Location:</strong> {product.location || "Not provided"}
                    </p>
                    {product.map_url ? (
                      <p>
                        <strong>Map:</strong>{" "}
                        <a href={product.map_url} target="_blank" rel="noreferrer">
                          View on Google Maps
                        </a>
                      </p>
                    ) : null}
                    <p>
                      <strong>Notes:</strong> {product.notes || "No notes"}
                    </p>
                  </div>

                  <div className="marketplace-card-bottom">
                    <div className="marketplace-seller">
                      {sellerProfilePath ? (
                        <Link
                          className="marketplace-seller-avatar"
                          to={sellerProfilePath}
                          aria-label={`View ${sellerName} profile`}
                        >
                          {seller?.avatar_url ? (
                            <img src={seller.avatar_url} alt={sellerName} />
                          ) : (
                            <span className="marketplace-seller-fallback">{getInitials(sellerName)}</span>
                          )}
                        </Link>
                      ) : seller?.avatar_url ? (
                        <img className="marketplace-seller-avatar" src={seller.avatar_url} alt={sellerName} />
                      ) : (
                        <span className="marketplace-seller-fallback">{getInitials(sellerName)}</span>
                      )}
                      <div>
                        <p className="marketplace-seller-label">Seller</p>
                        {sellerProfilePath ? (
                          <Link className="marketplace-seller-name" to={sellerProfilePath}>
                            {sellerName}
                          </Link>
                        ) : (
                          <p className="marketplace-seller-name">{sellerName}</p>
                        )}
                        <p className="marketplace-seller-rating">{formatRating(seller)}</p>
                      </div>
                    </div>

                    <div className="marketplace-actions">
                      {isOwner ? (
                        <>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => (isEditing ? setEditingId("") : startEditing(product))}
                            disabled={updateMutation.isPending}
                          >
                            {isEditing ? "Cancel Edit" : "Edit Listing"}
                          </button>
                          <button
                            className="btn btn-danger"
                            type="button"
                            disabled={deletingId === product.id}
                            onClick={() => handleRequestDelete(product)}
                          >
                            {deletingId === product.id ? "Deleting..." : "Delete"}
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="marketplace-buy">
                            <label>
                              Quantity
                              <input
                                type="number"
                                min="1"
                                max={product.stock ?? undefined}
                                value={isSoldOut ? 0 : buyQuantities[product.id] ?? 1}
                                onChange={(event) => {
                                  setBuyQuantities((prev) => ({ ...prev, [product.id]: event.target.value }));
                                  if (confirmingOrderId === product.id) {
                                    setConfirmingOrderId("");
                                  }
                                }}
                                disabled={isSoldOut || buyingId === product.id}
                              />
                            </label>
                            <button
                              className="btn btn-primary"
                              type="button"
                              disabled={isSoldOut || buyingId === product.id}
                              onClick={() => handlePlaceOrder(product)}
                            >
                              {buyingId === product.id ? "Buying..." : "Buy Product"}
                            </button>
                          </div>
                          {confirmingOrderId === product.id ? (
                            <div className="marketplace-confirm">
                              <p>
                                Confirm purchase of <strong>{confirmingQuantity}</strong> item(s) from{" "}
                                <strong>{product.name}</strong>?
                              </p>
                              <div className="marketplace-confirm-actions">
                                <button
                                  className="btn btn-primary"
                                  type="button"
                                  onClick={() => handleConfirmOrder(product)}
                                  disabled={buyingId === product.id}
                                >
                                  {buyingId === product.id ? "Buying..." : "Confirm Purchase"}
                                </button>
                                <button className="btn btn-secondary" type="button" onClick={() => setConfirmingOrderId("")}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div className="marketplace-message-row">
                            <button
                              className="btn btn-secondary"
                              type="button"
                              disabled={openingId === product.id}
                              onClick={() => handleMessageSeller(product)}
                            >
                              {openingId === product.id ? "Opening Chat..." : "Message Seller"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {buyErrors[product.id] ? <p className="feedback error">{buyErrors[product.id]}</p> : null}
                  {isOwner && confirmingDeleteId === product.id ? (
                    <div className="delete-confirm">
                      <p>Delete this product listing? This cannot be undone.</p>
                      <div className="delete-confirm-actions">
                        <button
                          className="btn btn-danger"
                          type="button"
                          disabled={deletingId === product.id}
                          onClick={() => handleConfirmDelete(product)}
                        >
                          {deletingId === product.id ? "Deleting..." : "Confirm Delete"}
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => setConfirmingDeleteId("")}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <p className="muted marketplace-posted">Posted {new Date(product.created_at).toLocaleString()}</p>
                </div>
              </div>
              {isEditing ? (
                <form
                  className="form-grid marketplace-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSaveEdit(product);
                  }}
                >
                  <label>
                    Product Name
                    <input
                      value={editValues.name}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Category
                    <input
                      value={editValues.category}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEditValues((prev) => ({ ...prev, category: value }));
                        setEditCategoryTouched(Boolean(value.trim()));
                      }}
                      required
                    />
                  </label>
                  <label>
                    Specification
                    <input
                      value={editValues.specification}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, specification: event.target.value }))}
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
                    Stocks
                    <input
                      type="number"
                      min="0"
                      value={editValues.stock}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, stock: event.target.value }))}
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
                  <div className="map-pin-row">
                    <p className="map-pin-label">Pin Location (Google Maps)</p>
                    <div className="map-pin-actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => {
                          const query = editValues.location.trim();
                          const target = query
                            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
                            : "https://www.google.com/maps";
                          window.open(target, "_blank", "noopener,noreferrer");
                        }}
                      >
                        Open Google Maps
                      </button>
                      {editValues.mapUrl.trim() ? (
                        <a className="btn btn-secondary" href={editValues.mapUrl.trim()} target="_blank" rel="noreferrer">
                          View Pinned
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <label>
                    Google Maps Link (Optional)
                    <input
                      value={editValues.mapUrl}
                      onChange={(event) => setEditValues((prev) => ({ ...prev, mapUrl: event.target.value }))}
                      placeholder="Paste Google Maps link here"
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
                  <div className="marketplace-photo-upload">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => editPhotoInputRef.current?.click()}
                      disabled={updateMutation.isPending}
                    >
                      {editPhotoPreviews.length || editValues.photoUrl ? "Add More Photos" : "Add Photo"} (
                      {(product.photos?.length || 0) + (editPhotoPreviews.length || 0)}/{maxPhotos})
                    </button>
                    <input
                      ref={editPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) =>
                        handleSelectEditPhoto(
                          event,
                          (product.photos?.length || 0) + (editPhotoPreviews.length || 0)
                        )
                      }
                      hidden
                    />
                    {product.photos?.length ? (
                      <div className="marketplace-photo-preview-list">
                        {product.photos.map((photo) => (
                          <div className="marketplace-photo-preview" key={photo.id}>
                            <img src={photo.photo_url} alt="Existing product" />
                            <button
                              className="btn btn-danger"
                              type="button"
                              onClick={() => handleDeleteExistingPhoto(product, photo)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {editPhotoPreviews.length ? (
                      <div className="marketplace-photo-preview-list">
                        {editPhotoPreviews.map((preview, index) => (
                          <div className="marketplace-photo-preview" key={`${preview}-${index}`}>
                            <img src={preview} alt="Selected product" />
                            <button className="btn btn-danger" type="button" onClick={() => handleRemoveEditPhoto(index)}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </form>
              ) : null}
              {isEditing && editError ? <p className="feedback error">{editError}</p> : null}
              <p className="muted">Posted {new Date(product.created_at).toLocaleString()}</p>
            </article>
          );
        })}
      </div>
      {loadedProducts.length > 0 ? (
        <div className="list-load-more">
          {productsQuery.hasNextPage ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => productsQuery.fetchNextPage()}
              disabled={productsQuery.isFetchingNextPage}
            >
              {productsQuery.isFetchingNextPage ? "Loading older products..." : "Load More"}
            </button>
          ) : (
            <p className="muted">No older products left.</p>
          )}
        </div>
      ) : null}
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
                ‹
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
                ›
              </button>
              <div className="photo-lightbox-counter">
                {lightboxIndex + 1} / {lightboxPhotos.length}
              </div>
            </>
          ) : null}
          <img
            src={lightboxPhotos[lightboxIndex]}
            alt="Product zoomed"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}
