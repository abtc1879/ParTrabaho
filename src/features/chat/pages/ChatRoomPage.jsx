import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteConversation,
  getConversationById,
  getMyReportAgainstUserForJob,
  getJobCompletion,
  listMessages,
  listMyJobReviews,
  markConversationMessagesRead,
  markJobFinished,
  respondDirectOffer,
  updateDirectOffer,
  sendMessage,
  uploadChatImage,
  submitUserReport,
  submitJobReview
} from "../api";
import { useAuth } from "../../auth/AuthContext";
import { MessageBubble } from "../components/MessageBubble";
import { useRealtimeChat } from "../../../hooks/useRealtimeChat";
import {
  getMarketplaceOrder,
  getMarketplaceReceipt,
  getMyMarketplaceReview,
  markMarketplaceReceived,
  placeMarketplaceOrder,
  submitMarketplaceReview
} from "../../marketplace/api";
import {
  createRentalReservation,
  getMyRentalReview,
  getRentalReservation,
  markRentalReservationDone,
  ownerUpdateRentalReservation,
  ownerMarkRentalDone,
  ownerMarkRentalRented,
  renterCancelRentalReservation,
  renterUpdateRentalReservation,
  submitRentalReview
} from "../../rentals/api";
import {
  createAccommodationReservation,
  getAccommodationReservation,
  guestCancelAccommodationReservation,
  ownerCancelAccommodationReservation,
  ownerAcceptAccommodationReservation,
  ownerCheckinAccommodationReservation,
  markAccommodationCheckedOut,
  getMyAccommodationReview,
  submitAccommodationReview
} from "../../accommodation/api";

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
    .split(/\n|[\u2022\u25AA\u25A0\u25A1\u2714\u2713]+/g)
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

export function ChatRoomPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoUploadUrl, setPhotoUploadUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [reportReason, setReportReason] = useState("poor_work");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");
  const [offerEditOpen, setOfferEditOpen] = useState(false);
  const [offerEditDescription, setOfferEditDescription] = useState("");
  const [offerEditSalary, setOfferEditSalary] = useState("");
  const [offerEditError, setOfferEditError] = useState("");
  const [offerEditSuccess, setOfferEditSuccess] = useState("");
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [marketReviewStars, setMarketReviewStars] = useState(5);
  const [marketReviewComment, setMarketReviewComment] = useState("");
  const [buyQuantity, setBuyQuantity] = useState("1");
  const [buyError, setBuyError] = useState("");
  const [buySuccess, setBuySuccess] = useState("");
  const [rentalDays, setRentalDays] = useState("1");
  const [includeDriver, setIncludeDriver] = useState(false);
  const [reservationError, setReservationError] = useState("");
  const [reservationSuccess, setReservationSuccess] = useState("");
  const [rentalReviewStars, setRentalReviewStars] = useState(5);
  const [rentalReviewComment, setRentalReviewComment] = useState("");
  const [selectedRoomRateId, setSelectedRoomRateId] = useState("");
  const [roomReservationError, setRoomReservationError] = useState("");
  const [roomReservationSuccess, setRoomReservationSuccess] = useState("");
  const [accommodationReviewStars, setAccommodationReviewStars] = useState(5);
  const [accommodationReviewComment, setAccommodationReviewComment] = useState("");
  const threadEndRef = useRef(null);
  const photoInputRef = useRef(null);

  const conversationQuery = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => getConversationById(conversationId),
    enabled: !!conversationId
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => listMessages(conversationId),
    enabled: !!conversationId
  });

  const jobId = conversationQuery.data?.job_id;
  const productId = conversationQuery.data?.product_id;
  const rentalId = conversationQuery.data?.rental_id;
  const accommodationId = conversationQuery.data?.accommodation_id;

  const conversation = conversationQuery.data;
  const job = readSingle(conversation?.job);
  const product = readSingle(conversation?.product);
  const rental = readSingle(conversation?.rental);
  const accommodation = readSingle(conversation?.accommodation);
  const rentalCategory = (rental?.category || "").trim();
  const isCarRental = rentalCategory.toLowerCase() === "car";
  const reserveLabel = rentalCategory ? `Reserve ${rentalCategory}` : "Reserve Rental";
  const accommodationDescription = useMemo(
    () => getDescriptionParts(accommodation?.description),
    [accommodation?.description]
  );
  const accommodationNotes = String(accommodation?.notes || "").trim();
  const accommodationMapUrl = String(accommodation?.map_url || "").trim();
  const accommodationCategoryLabel = (accommodation?.category || "").trim();
  const isRoomReservationCategory = ["hotel", "inn", "lodge"].includes(accommodationCategoryLabel.toLowerCase());
  const accommodationExtraPhotos = useMemo(() => {
    const mainPhoto = accommodation?.photo_url || "";
    const photos = Array.isArray(accommodation?.photos) ? accommodation.photos : [];
    const seen = new Set();
    const result = [];
    for (const photo of photos) {
      if (!photo?.photo_url) continue;
      if (photo.photo_url === mainPhoto) continue;
      if (seen.has(photo.photo_url)) continue;
      seen.add(photo.photo_url);
      result.push(photo);
    }
    return result;
  }, [accommodation?.photo_url, accommodation?.photos]);
  const accommodationRoomRates = useMemo(() => {
    const rates = Array.isArray(accommodation?.room_rates) ? [...accommodation.room_rates] : [];
    return rates.sort((a, b) => String(a?.classification || "").localeCompare(String(b?.classification || "")));
  }, [accommodation?.room_rates]);
  const selectedRoomRate = useMemo(
    () => accommodationRoomRates.find((rate) => rate.id === selectedRoomRateId) || null,
    [accommodationRoomRates, selectedRoomRateId]
  );
  const clientProfile = readSingle(conversation?.client_profile);
  const freelancerProfile = readSingle(conversation?.freelancer_profile);

  const isMarketplace = !!product?.id || !!productId;
  const isRental = !!rental?.id || !!rentalId;
  const isAccommodation = !!accommodation?.id || !!accommodationId;
  const amClient = !!user?.id && conversation?.client_id === user.id;
  const amBuyer = isMarketplace && !!user?.id && conversation?.freelancer_id === user.id;
  const amSeller = isMarketplace && !!user?.id && conversation?.client_id === user.id;
  const amOwner = isRental && !!user?.id && conversation?.client_id === user.id;
  const amRenter = isRental && !!user?.id && conversation?.freelancer_id === user.id;
  const otherProfile = amClient ? freelancerProfile : clientProfile;
  const otherRoleLabel = isMarketplace
    ? amClient
      ? "Buyer"
      : "Seller"
    : isRental
      ? amClient
        ? "Renter"
        : "Owner"
      : isAccommodation
        ? amClient
          ? "Guest"
          : "Host"
        : amClient
          ? "Applicant"
          : "Client";
  const otherName = fullName(otherProfile) || otherRoleLabel;
  const otherProfilePath = otherProfile?.id ? `/profiles/${otherProfile.id}` : "";

  const renterId = conversation?.freelancer_id;

  const chatAuxQuery = useQuery({
    queryKey: [
      "chat-room-aux",
      conversationId,
      user?.id,
      jobId,
      productId,
      rentalId,
      accommodationId,
      conversation?.client_id,
      conversation?.freelancer_id,
      otherProfile?.id,
      amClient,
      amBuyer,
      amSeller,
      amOwner,
      amRenter
    ],
    enabled: !!conversationId && !!conversation && !!user?.id,
    queryFn: async () => {
      const [
        completion,
        myReviews,
        existingReport,
        marketplaceReceipt,
        marketplaceOrder,
        marketplaceReview,
        rentalReservation,
        accommodationReservation
      ] = await Promise.all([
        jobId ? getJobCompletion(jobId) : Promise.resolve(null),
        jobId
          ? listMyJobReviews({
              jobId,
              reviewerId: user.id
            })
          : Promise.resolve([]),
        jobId && otherProfile?.id
          ? getMyReportAgainstUserForJob({
              jobId,
              reporterId: user.id,
              reportedUserId: otherProfile.id
            })
          : Promise.resolve(null),
        productId && conversation?.freelancer_id && (amBuyer || amSeller)
          ? getMarketplaceReceipt({
              productId,
              buyerId: conversation.freelancer_id
            })
          : Promise.resolve(null),
        productId && amBuyer
          ? getMarketplaceOrder({
              productId,
              buyerId: user.id
            })
          : Promise.resolve(null),
        productId && amBuyer
          ? getMyMarketplaceReview({
              productId,
              buyerId: user.id
            })
          : Promise.resolve(null),
        rentalId && renterId && (amOwner || amRenter)
          ? getRentalReservation({
              rentalId,
              renterId
            })
          : Promise.resolve(null),
        accommodationId && renterId && isAccommodation
          ? getAccommodationReservation({
              accommodationId,
              guestId: renterId
            })
          : Promise.resolve(null)
      ]);

      const [rentalReview, accommodationReview] = await Promise.all([
        rentalReservation?.id && amRenter
          ? getMyRentalReview({
              reservationId: rentalReservation.id,
              reviewerId: user.id
            })
          : Promise.resolve(null),
        accommodation?.id && !amClient && accommodationReservation?.status === "completed"
          ? getMyAccommodationReview({
              accommodationId: accommodation.id,
              reviewerId: user.id
            })
          : Promise.resolve(null)
      ]);

      return {
        completion,
        myReviews,
        existingReport,
        marketplaceReceipt,
        marketplaceOrder,
        marketplaceReview,
        rentalReservation,
        accommodationReservation,
        rentalReview,
        accommodationReview
      };
    }
  });

  const completionQuery = {
    data: chatAuxQuery.data?.completion,
    isError: chatAuxQuery.isError,
    error: chatAuxQuery.error
  };
  const myReviewsQuery = { data: chatAuxQuery.data?.myReviews || [] };
  const existingReportQuery = {
    data: chatAuxQuery.data?.existingReport,
    isLoading: chatAuxQuery.isLoading,
    isError: chatAuxQuery.isError,
    error: chatAuxQuery.error
  };
  const marketplaceReceiptQuery = { data: chatAuxQuery.data?.marketplaceReceipt };
  const marketplaceOrderQuery = { data: chatAuxQuery.data?.marketplaceOrder };
  const marketplaceReviewQuery = { data: chatAuxQuery.data?.marketplaceReview };
  const rentalReservationQuery = {
    data: chatAuxQuery.data?.rentalReservation,
    isLoading: chatAuxQuery.isLoading && !!rentalId && !!renterId && (amOwner || amRenter),
    isError: chatAuxQuery.isError,
    error: chatAuxQuery.error
  };
  const accommodationReservationQuery = { data: chatAuxQuery.data?.accommodationReservation };
  const rentalReviewQuery = { data: chatAuxQuery.data?.rentalReview };
  const accommodationReviewQuery = { data: chatAuxQuery.data?.accommodationReview };

  const myMarkedDone = useMemo(() => {
    if (!completionQuery.data) return false;
    return amClient ? completionQuery.data.client_marked_done : completionQuery.data.freelancer_marked_done;
  }, [completionQuery.data, amClient]);

  const otherMarkedDone = useMemo(() => {
    if (!completionQuery.data) return false;
    return amClient ? completionQuery.data.freelancer_marked_done : completionQuery.data.client_marked_done;
  }, [completionQuery.data, amClient]);

  const bothMarkedDone = !!completionQuery.data?.client_marked_done && !!completionQuery.data?.freelancer_marked_done;
  const jobInProgress = job?.status === "in_progress" || job?.status === "assigned";
  const isDirectOffer = !!job?.is_direct_offer;
  const canRespondDirectOffer = isDirectOffer && !amClient && job?.status === "open";
  const canEditDirectOffer = isDirectOffer && amClient && job?.status === "open";
  const canMarkFinished = !!jobId && jobInProgress && !myMarkedDone;
  const existingReport = existingReportQuery.data;
  const hasExistingReport = !!existingReport?.id;
  const reportPendingAdminApproval = existingReport?.status === "submitted";

  const existingReview = (myReviewsQuery.data || []).find((review) => review.reviewee_id === otherProfile?.id);

  const rentalReservation = rentalReservationQuery.data;
  const reservationStatus = rentalReservation?.status || "";
  const accommodationReservation = accommodationReservationQuery.data;
  const accommodationReservationStatus = accommodationReservation?.status || "";
  const hasReviewedAccommodationStay = !!accommodationReservation?.last_reviewed_at;
  const canCancelAccommodationReservation =
    !!accommodationReservation && ["pending", "accepted"].includes(accommodationReservationStatus);
  const canAcceptAccommodationReservation = accommodationReservationStatus === "pending";
  const canCheckinAccommodationReservation = accommodationReservationStatus === "accepted";
  const canCheckoutAccommodationReservation = accommodationReservationStatus === "checked_in";
  const showHostAccommodationActions =
    amClient &&
    !!accommodationReservation &&
    (canAcceptAccommodationReservation ||
      canCheckinAccommodationReservation ||
      canCheckoutAccommodationReservation ||
      canCancelAccommodationReservation);
  const showGuestAccommodationActions =
    !amClient &&
    !!accommodationReservation &&
    (canCancelAccommodationReservation ||
      canCheckoutAccommodationReservation ||
      accommodationReservationStatus === "pending");
  const canRequestAccommodationReservation =
    !accommodationReservation ||
    accommodationReservationStatus === "cancelled" ||
    (accommodationReservationStatus === "completed" && hasReviewedAccommodationStay);
  const reservedRoomRate = accommodationReservation?.room_rate_id
    ? accommodationRoomRates.find((rate) => rate.id === accommodationReservation.room_rate_id) || null
    : null;

  useEffect(() => {
    if (!accommodationRoomRates.length) {
      setSelectedRoomRateId("");
      return;
    }
    if (accommodationReservation?.room_rate_id) {
      setSelectedRoomRateId(accommodationReservation.room_rate_id);
      return;
    }
    if (!selectedRoomRateId || !accommodationRoomRates.some((rate) => rate.id === selectedRoomRateId)) {
      setSelectedRoomRateId(accommodationRoomRates[0].id);
    }
  }, [accommodationRoomRates, accommodationReservation?.room_rate_id, selectedRoomRateId]);

  useRealtimeChat(conversationId, (message) => {
    queryClient.setQueryData(["messages", conversationId], (current = []) => {
      if (current.some((item) => item.id === message.id)) return current;
      return [...current, message];
    });
    queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
  });

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    markConversationMessagesRead(conversationId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["unread-chat-count", user.id] });
      })
      .catch(() => {
        // If RPC is not deployed yet, avoid breaking chat UI.
      });
  }, [conversationId, user?.id, messagesQuery.data?.length, queryClient]);

  useEffect(() => {
    if (!threadEndRef.current) return;
    threadEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesQuery.data?.length]);

  useEffect(() => {
    if (!photoFile) return undefined;
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photoFile]);

  useEffect(() => {
    if (!isDirectOffer) return;
    setOfferEditDescription(job?.description || "");
    setOfferEditSalary(job?.salary_php != null ? String(job.salary_php) : "");
  }, [isDirectOffer, job?.description, job?.salary_php]);

  useEffect(() => {
    if (!reportPendingAdminApproval) return;
    setReportFormOpen(false);
  }, [reportPendingAdminApproval]);

  useEffect(() => {
    setBuyQuantity("1");
    setBuyError("");
    setBuySuccess("");
  }, [productId]);

  useEffect(() => {
    if (!isRental) return;
    const reservation = rentalReservationQuery.data;
    setRentalDays(reservation?.days != null ? String(reservation.days) : "1");
    setIncludeDriver(!!reservation?.include_driver);
  }, [isRental, rentalReservationQuery.data?.id, rentalReservationQuery.data?.days, rentalReservationQuery.data?.include_driver]);

  const markFinishedMutation = useMutation({
    mutationFn: () => markJobFinished(jobId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["job-completion", jobId] }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["job", jobId] })
      ]);
    }
  });

  const directOfferResponseMutation = useMutation({
    mutationFn: (action) =>
      respondDirectOffer({
        jobId,
        action
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["job", jobId] }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    }
  });

  const editOfferMutation = useMutation({
    mutationFn: ({ description, salaryPhp }) =>
      updateDirectOffer({
        jobId,
        description,
        salaryPhp
      }),
    onSuccess: async () => {
      setOfferEditError("");
      setOfferEditOpen(false);
      setOfferEditSuccess("Offer updated. The freelancer has been notified.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["job", jobId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setOfferEditError(error?.message || "Unable to update the offer right now.");
    }
  });

  const reviewMutation = useMutation({
    mutationFn: ({ stars, comment }) =>
      submitJobReview({
        jobId,
        revieweeId: otherProfile.id,
        stars,
        comment
      }),
    onSuccess: async () => {
      setReviewComment("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-job-reviews", jobId, user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["profile", otherProfile?.id] }),
        queryClient.invalidateQueries({ queryKey: ["public-profile", otherProfile?.id] })
      ]);
    }
  });

  const reportMutation = useMutation({
    mutationFn: ({ reportedUserId, jobId: targetJobId, reasonType, reasonDetails }) =>
      submitUserReport({
        reportedUserId,
        jobId: targetJobId,
        reasonType,
        reasonDetails
      }),
    onSuccess: async () => {
      setReportSuccess("Report submitted. Admin will review, and the reported user has been notified.");
      setReportFormOpen(false);
      setReportReason("poor_work");
      setReportDetails("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile", otherProfile?.id] }),
        queryClient.invalidateQueries({ queryKey: ["existing-user-report", jobId, user?.id, otherProfile?.id] })
      ]);
    }
  });

  const markReceivedMutation = useMutation({
    mutationFn: () => markMarketplaceReceived(productId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketplace-receipt", productId, conversation?.freelancer_id] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    }
  });

  const marketplaceReviewMutation = useMutation({
    mutationFn: ({ stars, comment }) =>
      submitMarketplaceReview({
        productId,
        stars,
        comment
      }),
    onSuccess: async () => {
      setMarketReviewComment("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketplace-review", productId, user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["profile", otherProfile?.id] }),
        queryClient.invalidateQueries({ queryKey: ["public-profile", otherProfile?.id] })
      ]);
    }
  });

  const placeOrderMutation = useMutation({
    mutationFn: ({ quantity }) =>
      placeMarketplaceOrder({
        productId,
        quantity
      }),
    onSuccess: async () => {
      setBuyQuantity("1");
      setBuySuccess("Order placed. The seller has been notified.");
      setBuyError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-products"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-order", productId, user?.id] })
      ]);
    },
    onError: (error) => {
      setBuyError(error?.message || "Unable to place the order right now.");
    }
  });

  const createReservationMutation = useMutation({
    mutationFn: ({ days, includeDriver }) =>
      createRentalReservation({
        rentalId,
        days,
        includeDriver
      }),
    onSuccess: async () => {
      setReservationError("");
      setReservationSuccess("Reservation sent. The owner has been notified.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-reservation", rentalId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["rental-listings"] })
      ]);
    },
    onError: (error) => {
      setReservationSuccess("");
      setReservationError(error?.message || "Unable to send reservation right now.");
    }
  });

  const renterUpdateReservationMutation = useMutation({
    mutationFn: ({ reservationId, days, includeDriver }) =>
      renterUpdateRentalReservation({
        reservationId,
        days,
        includeDriver
      }),
    onSuccess: async () => {
      setReservationError("");
      setReservationSuccess("Reservation updated. The owner has been notified.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-reservation", rentalId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["rental-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setReservationSuccess("");
      setReservationError(error?.message || "Unable to update reservation right now.");
    }
  });

  const ownerDecisionMutation = useMutation({
    mutationFn: ({ reservationId, decision }) =>
      ownerUpdateRentalReservation({
        reservationId,
        decision
      }),
    onSuccess: async (_data, variables) => {
      setReservationError("");
      setReservationSuccess(variables?.decision === "accept" ? "Reservation accepted." : "Reservation cancelled.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-reservation", rentalId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["rental-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setReservationSuccess("");
      setReservationError(error?.message || "Unable to update reservation right now.");
    }
  });

  const renterCancelMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      renterCancelRentalReservation({
        reservationId
      }),
    onSuccess: async () => {
      setReservationError("");
      setReservationSuccess("Reservation cancelled.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-reservation", rentalId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["rental-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setReservationSuccess("");
      setReservationError(error?.message || "Unable to cancel reservation right now.");
    }
  });

  const markRentalRentedMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      ownerMarkRentalRented({
        reservationId
      }),
    onSuccess: async () => {
      setReservationError("");
      setReservationSuccess("Rental marked as already rented.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-reservation", rentalId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["rental-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setReservationSuccess("");
      setReservationError(error?.message || "Unable to mark as rented right now.");
    }
  });

  const ownerMarkDoneMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      ownerMarkRentalDone({
        reservationId
      }),
    onSuccess: async () => {
      setReservationError("");
      setReservationSuccess("Marked as completed.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-reservation", rentalId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["rental-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setReservationSuccess("");
      setReservationError(error?.message || "Unable to mark completed right now.");
    }
  });

  const markRentalDoneMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      markRentalReservationDone({
        reservationId
      }),
    onSuccess: async () => {
      setReservationError("");
      setReservationSuccess("Marked as completed. You can now leave a rating.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-reservation", rentalId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["rental-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setReservationSuccess("");
      setReservationError(error?.message || "Unable to mark completed right now.");
    }
  });

  const rentalReviewMutation = useMutation({
    mutationFn: ({ reservationId, stars, comment }) =>
      submitRentalReview({
        reservationId,
        stars,
        comment
      }),
    onSuccess: async () => {
      setRentalReviewComment("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-review", rentalReservationQuery.data?.id, user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["profile", conversation?.client_id] }),
        queryClient.invalidateQueries({ queryKey: ["public-profile", conversation?.client_id] })
      ]);
    }
  });

  const createAccommodationReservationMutation = useMutation({
    mutationFn: ({ accommodationId, roomRateId }) =>
      createAccommodationReservation({
        accommodationId,
        roomRateId
      }),
    onSuccess: async () => {
      setRoomReservationError("");
      setRoomReservationSuccess("Reservation request sent.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accommodation-reservation", accommodationId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setRoomReservationSuccess("");
      setRoomReservationError(error?.message || "Unable to send reservation right now.");
    }
  });

  const cancelAccommodationReservationMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      guestCancelAccommodationReservation({
        reservationId
      }),
    onSuccess: async () => {
      setRoomReservationError("");
      setRoomReservationSuccess("Reservation cancelled.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accommodation-reservation", accommodationId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setRoomReservationSuccess("");
      setRoomReservationError(error?.message || "Unable to cancel reservation right now.");
    }
  });

  const ownerCancelAccommodationReservationMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      ownerCancelAccommodationReservation({
        reservationId
      }),
    onSuccess: async () => {
      setRoomReservationError("");
      setRoomReservationSuccess("Reservation cancelled.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accommodation-reservation", accommodationId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setRoomReservationSuccess("");
      setRoomReservationError(error?.message || "Unable to cancel reservation right now.");
    }
  });

  const ownerAcceptAccommodationReservationMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      ownerAcceptAccommodationReservation({
        reservationId
      }),
    onSuccess: async () => {
      setRoomReservationError("");
      setRoomReservationSuccess("Reservation accepted.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accommodation-reservation", accommodationId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setRoomReservationSuccess("");
      setRoomReservationError(error?.message || "Unable to accept reservation right now.");
    }
  });

  const ownerCheckinAccommodationReservationMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      ownerCheckinAccommodationReservation({
        reservationId
      }),
    onSuccess: async () => {
      setRoomReservationError("");
      setRoomReservationSuccess("Guest checked in.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accommodation-reservation", accommodationId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setRoomReservationSuccess("");
      setRoomReservationError(error?.message || "Unable to check in guest right now.");
    }
  });

  const checkOutAccommodationReservationMutation = useMutation({
    mutationFn: ({ reservationId }) =>
      markAccommodationCheckedOut({
        reservationId
      }),
    onSuccess: async () => {
      setRoomReservationError("");
      setRoomReservationSuccess("Guest checked out.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accommodation-reservation", accommodationId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] })
      ]);
    },
    onError: (error) => {
      setRoomReservationSuccess("");
      setRoomReservationError(error?.message || "Unable to check out right now.");
    }
  });

  const accommodationReviewMutation = useMutation({
    mutationFn: ({ reservationId, stars, comment }) =>
      submitAccommodationReview({
        reservationId,
        stars,
        comment
      }),
    onSuccess: async () => {
      setAccommodationReviewComment("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accommodation-reservation", accommodationId, renterId] }),
        queryClient.invalidateQueries({ queryKey: ["accommodation-review", accommodation?.id, user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["profile", conversation?.client_id] }),
        queryClient.invalidateQueries({ queryKey: ["public-profile", conversation?.client_id] })
      ]);
    }
  });

  const sendMutation = useMutation({
    mutationFn: (body) =>
      sendMessage({
        conversationId,
        senderId: user.id,
        body
      }),
    onMutate: async (body) => {
      setSendError("");
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage = {
        id: optimisticId,
        conversation_id: conversationId,
        sender_id: user.id,
        body,
        created_at: new Date().toISOString()
      };

      queryClient.setQueryData(["messages", conversationId], (current = []) => [...current, optimisticMessage]);
      return { optimisticId };
    },
    onSuccess: (savedMessage, _body, context) => {
      queryClient.setQueryData(["messages", conversationId], (current = []) =>
        current.map((message) => (message.id === context?.optimisticId ? savedMessage : message))
      );
    },
    onError: (error, _body, context) => {
      queryClient.setQueryData(["messages", conversationId], (current = []) =>
        current.filter((message) => message.id !== context?.optimisticId)
      );
      setSendError(error?.message || "Failed to send message.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["unread-chat-count", user?.id] });
    }
  });

  const deleteConversationMutation = useMutation({
    mutationFn: () => deleteConversation(conversationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["unread-chat-count", user?.id] })
      ]);
      navigate("/chat", { replace: true });
    }
  });

  const sendDisabled =
    sendMutation.isPending || isUploading || (!text.trim() && !photoFile && !photoUploadUrl);

  async function handleSend(event) {
    event.preventDefault();
    if (!conversationId || !user?.id) return;
    const bodyText = text.trim();
    if (!bodyText && !photoFile && !photoUploadUrl) return;
    setSendError("");
    setUploadError("");
    let finalBody = bodyText;
    let imageUrl = photoUploadUrl;
    if (!imageUrl && photoFile) {
      try {
        setIsUploading(true);
        imageUrl = await uploadChatImage({
          userId: user.id,
          conversationId,
          file: photoFile
        });
        setPhotoUploadUrl(imageUrl);
      } catch (error) {
        setUploadError(error?.message || "Failed to upload image.");
        setIsUploading(false);
        return;
      }
    }
    if (imageUrl) {
      finalBody = finalBody ? `${finalBody}\n${imageUrl}` : imageUrl;
    }
    try {
      await sendMutation.mutateAsync(finalBody);
      setText("");
      setPhotoFile(null);
      setPhotoPreview("");
      setPhotoUploadUrl("");
    } catch {
      // Error message is already handled by onError state.
    } finally {
      setIsUploading(false);
    }
  }

  async function handleReserveAccommodationRoom() {
    if (!conversationId || !user?.id) return;
    if (!selectedRoomRate) {
      setRoomReservationSuccess("");
      setRoomReservationError("Please select a room classification first.");
      return;
    }
    setRoomReservationError("");
    setRoomReservationSuccess("");
    createAccommodationReservationMutation.mutate({
      accommodationId,
      roomRateId: selectedRoomRate.id
    });
  }

  async function handleCancelAccommodationReservation() {
    if (!conversationId || !user?.id) return;
    const reservationId = accommodationReservation?.id;
    if (!reservationId) {
      setRoomReservationSuccess("");
      setRoomReservationError("No reservation to cancel.");
      return;
    }
    cancelAccommodationReservationMutation.mutate({ reservationId });
  }

  async function handleOwnerCancelAccommodationReservation() {
    if (!conversationId || !user?.id) return;
    const reservationId = accommodationReservation?.id;
    if (!reservationId) {
      setRoomReservationSuccess("");
      setRoomReservationError("No reservation to cancel.");
      return;
    }
    ownerCancelAccommodationReservationMutation.mutate({ reservationId });
  }

  async function handleOwnerAcceptAccommodationReservation() {
    if (!conversationId || !user?.id) return;
    const reservationId = accommodationReservation?.id;
    if (!reservationId) {
      setRoomReservationSuccess("");
      setRoomReservationError("No reservation to accept.");
      return;
    }
    ownerAcceptAccommodationReservationMutation.mutate({ reservationId });
  }

  async function handleOwnerCheckinAccommodationReservation() {
    if (!conversationId || !user?.id) return;
    const reservationId = accommodationReservation?.id;
    if (!reservationId) {
      setRoomReservationSuccess("");
      setRoomReservationError("No reservation to check in.");
      return;
    }
    ownerCheckinAccommodationReservationMutation.mutate({ reservationId });
  }

  async function handleAccommodationCheckOut() {
    if (!conversationId || !user?.id) return;
    const reservationId = accommodationReservation?.id;
    if (!reservationId) {
      setRoomReservationSuccess("");
      setRoomReservationError("No reservation to check out.");
      return;
    }
    checkOutAccommodationReservationMutation.mutate({ reservationId });
  }

  async function handleSubmitAccommodationReview(event) {
    event.preventDefault();
    const reservationId = accommodationReservation?.id;
    if (!reservationId) {
      setRoomReservationError("Reservation not found.");
      return;
    }
    await accommodationReviewMutation.mutateAsync({
      reservationId,
      stars: accommodationReviewStars,
      comment: accommodationReviewComment.trim()
    });
  }

  function handlePhotoSelect(event) {
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
    setPhotoFile(file);
    setPhotoUploadUrl("");
  }

  function handleRemovePhoto() {
    setPhotoFile(null);
    setPhotoPreview("");
    setPhotoUploadUrl("");
    setUploadError("");
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }

  async function handleSubmitReview(event) {
    event.preventDefault();
    if (!otherProfile?.id) return;
    try {
      await reviewMutation.mutateAsync({
        stars: reviewStars,
        comment: reviewComment.trim()
      });
    } catch {
      // Error state is handled by mutation.
    }
  }

  async function handleSubmitMarketplaceReview(event) {
    event.preventDefault();
    if (!productId || !amBuyer) return;
    try {
      await marketplaceReviewMutation.mutateAsync({
        stars: marketReviewStars,
        comment: marketReviewComment.trim()
      });
    } catch {
      // Error state handled by mutation.
    }
  }

  function handlePlaceOrder() {
    if (!productId || !amBuyer || placeOrderMutation.isPending) return;
    const quantity = Number(buyQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setBuyError("Quantity must be at least 1.");
      return;
    }
    if (product?.stock != null && quantity > product.stock) {
      setBuyError("Quantity exceeds available stock.");
      return;
    }
    setBuyError("");
    setBuySuccess("");
    placeOrderMutation.mutate({ quantity });
  }

  function handleSubmitReservation(event) {
    event.preventDefault();
    if (!rentalId || !amRenter) return;
    const daysValue = isCarRental ? Number(rentalDays) : 1;
    if (isCarRental && (!Number.isFinite(daysValue) || daysValue < 1)) {
      setReservationError("Days must be at least 1.");
      return;
    }
    setReservationError("");
    setReservationSuccess("");
    const reservation = rentalReservationQuery.data;
    const reservationId = reservation?.id;
    const includeDriverValue = isCarRental ? includeDriver : false;
    if (reservationId) {
      if (reservation?.status !== "cancelled") {
        setReservationError("You can only edit the reservation after it has been cancelled.");
        return;
      }
      renterUpdateReservationMutation.mutate({
        reservationId,
        days: daysValue,
        includeDriver: includeDriverValue
      });
      return;
    }
    createReservationMutation.mutate({
      days: daysValue,
      includeDriver: includeDriverValue
    });
  }

  function handleOwnerDecision(decision) {
    const reservationId = rentalReservationQuery.data?.id;
    if (!reservationId || !amOwner) return;
    setReservationError("");
    setReservationSuccess("");
    ownerDecisionMutation.mutate({ reservationId, decision });
  }

  function handleMarkRentalDone() {
    const reservationId = rentalReservationQuery.data?.id;
    if (!reservationId || !amRenter) return;
    setReservationError("");
    setReservationSuccess("");
    markRentalDoneMutation.mutate({ reservationId });
  }

  function handleCancelReservation() {
    const reservationId = rentalReservationQuery.data?.id;
    if (!reservationId || !amRenter) return;
    const confirmed = window.confirm("Cancel this reservation?");
    if (!confirmed) return;
    setReservationError("");
    setReservationSuccess("");
    renterCancelMutation.mutate({ reservationId });
  }

  function handleMarkRentalRented() {
    const reservationId = rentalReservationQuery.data?.id;
    if (!reservationId || !amOwner) return;
    const confirmed = window.confirm("Mark this rental as already rented?");
    if (!confirmed) return;
    setReservationError("");
    setReservationSuccess("");
    markRentalRentedMutation.mutate({ reservationId });
  }

  function handleOwnerMarkRentalDone() {
    const reservationId = rentalReservationQuery.data?.id;
    if (!reservationId || !amOwner) return;
    const confirmed = window.confirm("Mark this rental as completed?");
    if (!confirmed) return;
    setReservationError("");
    setReservationSuccess("");
    ownerMarkDoneMutation.mutate({ reservationId });
  }

  async function handleSubmitRentalReview(event) {
    event.preventDefault();
    const reservationId = rentalReservationQuery.data?.id;
    if (!reservationId || !amRenter) return;
    try {
      await rentalReviewMutation.mutateAsync({
        reservationId,
        stars: rentalReviewStars,
        comment: rentalReviewComment.trim()
      });
    } catch {
      // Error state handled by mutation.
    }
  }

  async function handleDeleteConversation() {
    if (!conversationId) return;
    const confirmed = window.confirm("Delete this chat conversation? This will remove all messages in this chat.");
    if (!confirmed) return;
    try {
      await deleteConversationMutation.mutateAsync();
    } catch {
      // Error state is handled by mutation.
    }
  }

  return (
    <section className="page chat-page chat-room-screen">
      <div className="card chat-hero">
        <div>
          <p className="eyebrow">
            {isMarketplace ? "Marketplace Chat" : isRental ? "Rental Chat" : isAccommodation ? "Accommodation Chat" : "Realtime Chat"}
          </p>
          <h2>{accommodation?.title || rental?.title || product?.name || job?.title || "Conversation"}</h2>
          <div className="chat-counterparty">
            {otherProfilePath ? (
              <Link className="chat-counterparty-avatar-link" to={otherProfilePath} aria-label={`View ${otherName} profile`}>
                {otherProfile?.avatar_url ? (
                  <img className="chat-counterparty-avatar" src={otherProfile.avatar_url} alt={otherName} />
                ) : (
                  <span className="chat-counterparty-avatar-fallback">{getInitials(otherName)}</span>
                )}
              </Link>
            ) : otherProfile?.avatar_url ? (
              <img className="chat-counterparty-avatar" src={otherProfile.avatar_url} alt={otherName} />
            ) : (
              <span className="chat-counterparty-avatar-fallback">{getInitials(otherName)}</span>
            )}
            <div className="chat-counterparty-text">
              <p className="muted chat-counterparty-role">{otherRoleLabel}</p>
              {otherProfilePath ? (
                <Link className="chat-counterparty-name" to={otherProfilePath}>
                  {otherName}
                </Link>
              ) : (
                <p className="chat-counterparty-name">{otherName}</p>
              )}
            </div>
          </div>
          {isMarketplace ? (
            <>
              <p className="chat-offer-line">
                <strong>Price:</strong> PHP {Number(product?.price_php || 0).toLocaleString()}
              </p>
          <p className="chat-offer-line">
            <strong>Location:</strong> {product?.location || "Not provided"}
          </p>
          {product?.map_url ? (
            <p className="chat-offer-line">
              <strong>Map:</strong>{" "}
              <a href={product.map_url} target="_blank" rel="noreferrer">
                View on Google Maps
              </a>
            </p>
          ) : null}
            </>
          ) : null}
          {isDirectOffer ? (
            <>
              <p className="chat-offer-line">
                <strong>Offer Description:</strong> {job?.description || "No description provided."}
              </p>
              <p className="chat-offer-line">
                <strong>Salary Offer:</strong> PHP {Number(job?.salary_php || 0).toLocaleString()}
              </p>
              {canEditDirectOffer ? (
                <div className="chat-offer-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      setOfferEditSuccess("");
                      setOfferEditError("");
                      setOfferEditOpen((prev) => !prev);
                    }}
                  >
                    {offerEditOpen ? "Cancel Edit" : "Edit Offer"}
                  </button>
                </div>
              ) : null}
              {offerEditOpen && canEditDirectOffer ? (
                <form
                  className="form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setOfferEditSuccess("");
                    setOfferEditError("");
                    const salaryPhp = Number(offerEditSalary);
                    if (!jobId) {
                      setOfferEditError("Offer cannot be updated yet. Please reload the chat.");
                      return;
                    }
                    if (!offerEditDescription.trim()) {
                      setOfferEditError("Offer description is required.");
                      return;
                    }
                    if (!Number.isFinite(salaryPhp) || salaryPhp <= 0) {
                      setOfferEditError("Salary must be a number greater than zero.");
                      return;
                    }
                    if (
                      offerEditDescription.trim() === (job?.description || "") &&
                      salaryPhp === Number(job?.salary_php || 0)
                    ) {
                      setOfferEditError("No changes to save.");
                      return;
                    }
                    editOfferMutation.mutate({
                      description: offerEditDescription.trim(),
                      salaryPhp
                    });
                  }}
                >
                  <label>
                    Offer Description
                    <textarea
                      rows={3}
                      value={offerEditDescription}
                      onChange={(event) => setOfferEditDescription(event.target.value)}
                      placeholder="Describe the work to be done"
                      required
                    />
                  </label>
                  <label>
                    Salary Offer (PHP)
                    <input
                      type="number"
                      min="1"
                      value={offerEditSalary}
                      onChange={(event) => setOfferEditSalary(event.target.value)}
                      placeholder="e.g. 800"
                      required
                    />
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={editOfferMutation.isPending}>
                    {editOfferMutation.isPending ? "Updating..." : "Update Offer"}
                  </button>
                </form>
              ) : null}
              {offerEditError ? <p className="feedback error">{offerEditError}</p> : null}
              {offerEditSuccess ? <p className="feedback success">{offerEditSuccess}</p> : null}
            </>
          ) : null}
        </div>
        <div className="chat-hero-badges">
          <span className={`chat-status-pill pill ${job?.status || "open"}`}>{job?.status || "open"}</span>
          <button
            className="btn btn-danger chat-delete-btn"
            type="button"
            onClick={handleDeleteConversation}
            disabled={deleteConversationMutation.isPending || !conversationId}
          >
            {deleteConversationMutation.isPending ? "Deleting..." : "Delete Chat"}
          </button>
        </div>
      </div>
      {deleteConversationMutation.isError ? <p className="feedback error">{deleteConversationMutation.error.message}</p> : null}

      {isMarketplace ? (
        <div className="card chat-product-details">
          <h3>Product Details</h3>
          {conversationQuery.isError ? <p className="feedback error">{conversationQuery.error.message}</p> : null}
          {product?.photo_url ? <img className="chat-product-photo" src={product.photo_url} alt={product?.name || "Product"} /> : null}
          <p className="chat-offer-line">
            <strong>Category:</strong> {product?.category || "Not provided"}
          </p>
          <p className="chat-offer-line">
            <strong>Stock:</strong> {product?.stock != null ? product.stock : "Not provided"}
          </p>
          {product?.sold_out ? <p className="feedback error">Sold out</p> : null}
          <p className="chat-offer-line">
            <strong>Specification:</strong> {product?.specification || "No specification provided."}
          </p>
          <p className="chat-offer-line">
            <strong>Notes:</strong> {product?.notes || "No notes provided."}
          </p>
          {amBuyer ? (
            <div className="chat-product-actions">
              <div className="chat-product-purchase">
                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max={product?.stock ?? undefined}
                    value={buyQuantity}
                    onChange={(event) => {
                      setBuyQuantity(event.target.value);
                      if (buyError) setBuyError("");
                      if (buySuccess) setBuySuccess("");
                    }}
                    disabled={product?.sold_out || product?.stock === 0 || placeOrderMutation.isPending}
                  />
                </label>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={product?.sold_out || product?.stock === 0 || placeOrderMutation.isPending}
                >
                  {placeOrderMutation.isPending ? "Buying..." : "Buy Product"}
                </button>
              </div>
              {buyError ? <p className="feedback error">{buyError}</p> : null}
              {buySuccess ? <p className="feedback success">{buySuccess}</p> : null}
              {marketplaceOrderQuery.data ? (
                <>
                  {marketplaceReceiptQuery.data ? (
                    <p className="feedback success">You marked this product as received.</p>
                  ) : (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => markReceivedMutation.mutate()}
                      disabled={markReceivedMutation.isPending}
                    >
                      {markReceivedMutation.isPending ? "Updating..." : "Mark Product Received"}
                    </button>
                  )}
                  {markReceivedMutation.isError ? (
                    <p className="feedback error">{markReceivedMutation.error.message}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : amSeller && marketplaceReceiptQuery.data ? (
            <p className="feedback success">Buyer marked this product as received.</p>
          ) : null}
          {amBuyer && marketplaceReceiptQuery.data ? (
            <div className="chat-review-box">
              <h4>Rate Seller</h4>
              {marketplaceReviewQuery.data ? (
                <p className="muted">
                  You already rated {otherName}: {marketplaceReviewQuery.data.stars}/5
                </p>
              ) : (
                <form className="form-grid" onSubmit={handleSubmitMarketplaceReview}>
                  <label>
                    Stars
                    <div className="review-stars-input" role="radiogroup" aria-label="Select rating">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`review-star-btn ${value <= marketReviewStars ? "active" : ""}`}
                          onClick={() => setMarketReviewStars(value)}
                          role="radio"
                          aria-checked={marketReviewStars === value}
                          aria-label={`${value} star${value > 1 ? "s" : ""}`}
                          title={`${value} star${value > 1 ? "s" : ""}`}
                        >
                          {"\u2605"}
                        </button>
                      ))}
                      <span className="review-stars-value">{marketReviewStars}/5</span>
                    </div>
                  </label>
                  <label>
                    Review (optional)
                    <textarea
                      rows={3}
                      value={marketReviewComment}
                      onChange={(event) => setMarketReviewComment(event.target.value)}
                      placeholder={`Share feedback for ${otherName}`}
                    />
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={marketplaceReviewMutation.isPending}>
                    {marketplaceReviewMutation.isPending ? "Submitting..." : "Submit Rating"}
                  </button>
                </form>
              )}
              {marketplaceReviewMutation.isError ? <p className="feedback error">{marketplaceReviewMutation.error.message}</p> : null}
            </div>
          ) : null}
        </div>
      ) : isRental ? (
        <div className="card chat-product-details">
          <h3>Rental Details</h3>
          {conversationQuery.isError ? <p className="feedback error">{conversationQuery.error.message}</p> : null}
          {rental?.photo_url ? <img className="chat-product-photo" src={rental.photo_url} alt={rental?.title || "Rental"} /> : null}
          <p className="chat-offer-line">
            <strong>Category:</strong> {rental?.category || "Not provided"}
          </p>
          <p className="chat-offer-line">
            <strong>Location:</strong> {rental?.location || "Not provided"}
          </p>
          {rental?.map_url ? (
            <p className="chat-offer-line">
              <strong>Map:</strong>{" "}
              <a href={rental.map_url} target="_blank" rel="noreferrer">
                View on Google Maps
              </a>
            </p>
          ) : null}
          <p className="chat-offer-line">
            <strong>Description:</strong> {rental?.description || "No description provided."}
          </p>
          <p className="chat-offer-line">
            <strong>Notes:</strong> {rental?.notes || "No notes provided."}
          </p>
          <p className="chat-offer-line">
            <strong>Price:</strong> PHP {Number(rental?.price_php || 0).toLocaleString()}
          </p>
          <p className="chat-offer-line">
            <strong>Status:</strong> {rental?.is_rented ? "Already Rented" : rental?.is_reserved ? "Reserved" : "Available"}
          </p>
          {amOwner || amRenter ? (
            <div className="chat-reservation-box">
              <h4>Reservation</h4>
              {rentalReservationQuery.isLoading ? <p className="muted">Loading reservation details...</p> : null}
              {rentalReservationQuery.isError ? (
                <p className="feedback error">{rentalReservationQuery.error.message}</p>
              ) : null}
              {rentalReservation ? (
                <div className="reservation-summary">
                  <p className="muted">
                    Status:{" "}
                    <strong>
                      {reservationStatus === "pending"
                        ? "Pending approval"
                        : reservationStatus === "accepted"
                          ? "Accepted"
                          : reservationStatus === "cancelled"
                            ? "Cancelled"
                            : reservationStatus === "completed"
                              ? "Completed"
                              : "Unknown"}
                    </strong>
                  </p>
                  {isCarRental ? (
                    <>
                      <p className="muted">Days: {rentalReservation.days}</p>
                      <p className="muted">Driver: {rentalReservation.include_driver ? "Included" : "Not included"}</p>
                    </>
                  ) : null}
                </div>
              ) : null}

              {amRenter && !rentalReservation && rental?.is_reserved ? (
                <p className="muted">This rental is already reserved.</p>
              ) : null}

              {amRenter && !rentalReservation && !rental?.is_reserved ? (
                <form className="form-grid reservation-form" onSubmit={handleSubmitReservation}>
                  {isCarRental ? (
                    <>
                      <label>
                        Days
                        <select value={rentalDays} onChange={(event) => setRentalDays(event.target.value)}>
                          {Array.from({ length: 30 }, (_value, index) => {
                            const daysValue = index + 1;
                            return (
                              <option key={daysValue} value={daysValue}>
                                {daysValue} day{daysValue > 1 ? "s" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <label className="reservation-checkbox">
                        <input
                          type="checkbox"
                          checked={includeDriver}
                          onChange={(event) => setIncludeDriver(event.target.checked)}
                        />
                        <span>Include driver</span>
                      </label>
                    </>
                  ) : null}
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={createReservationMutation.isPending || renterUpdateReservationMutation.isPending}
                  >
                    {createReservationMutation.isPending ? "Sending..." : reserveLabel}
                  </button>
                </form>
              ) : null}

              {amRenter && reservationStatus === "pending" ? (
                <div className="reservation-actions">
                  <p className="muted">Waiting for the owner to review your reservation.</p>
                  {!rental?.is_rented ? (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={handleCancelReservation}
                      disabled={renterCancelMutation.isPending}
                    >
                      {renterCancelMutation.isPending ? "Cancelling..." : "Cancel Reservation"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {amRenter && reservationStatus === "cancelled" ? (
                <form className="form-grid reservation-form" onSubmit={handleSubmitReservation}>
                  <p className="muted">The owner cancelled the reservation. You can edit and resend.</p>
                  {isCarRental ? (
                    <>
                      <label>
                        Days
                        <select value={rentalDays} onChange={(event) => setRentalDays(event.target.value)}>
                          {Array.from({ length: 30 }, (_value, index) => {
                            const daysValue = index + 1;
                            return (
                              <option key={daysValue} value={daysValue}>
                                {daysValue} day{daysValue > 1 ? "s" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <label className="reservation-checkbox">
                        <input
                          type="checkbox"
                          checked={includeDriver}
                          onChange={(event) => setIncludeDriver(event.target.checked)}
                        />
                        <span>Include driver</span>
                      </label>
                    </>
                  ) : null}
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={renterUpdateReservationMutation.isPending}
                  >
                    {renterUpdateReservationMutation.isPending ? "Updating..." : reserveLabel}
                  </button>
                </form>
              ) : null}

              {amRenter && reservationStatus === "accepted" ? (
                <div className="reservation-actions">
                  {!rental?.is_rented ? (
                    <p className="feedback success">Reservation accepted. The car is reserved for you.</p>
                  ) : null}
                  {!rental?.is_rented ? (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={handleCancelReservation}
                      disabled={renterCancelMutation.isPending}
                    >
                      {renterCancelMutation.isPending ? "Cancelling..." : "Cancel Reservation"}
                    </button>
                  ) : null}
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleMarkRentalDone}
                    disabled={markRentalDoneMutation.isPending}
                  >
                    {markRentalDoneMutation.isPending ? "Updating..." : "Mark Rental Done"}
                  </button>
                </div>
              ) : null}

              {amRenter && reservationStatus === "completed" ? (
                <div className="chat-review-box">
                  <h4>Rate Owner</h4>
                  {rental?.is_rented ? <p className="muted">The owner marked this rental as already rented. Please leave your review.</p> : null}
                  {rentalReviewQuery.data ? (
                    <p className="muted">
                      You already rated the owner: {rentalReviewQuery.data.stars}/5
                    </p>
                  ) : (
                    <form className="form-grid" onSubmit={handleSubmitRentalReview}>
                      <label>
                        Stars
                        <div className="review-stars-input" role="radiogroup" aria-label="Select rating">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              className={`review-star-btn ${value <= rentalReviewStars ? "active" : ""}`}
                              onClick={() => setRentalReviewStars(value)}
                              role="radio"
                              aria-checked={rentalReviewStars === value}
                              aria-label={`${value} star${value > 1 ? "s" : ""}`}
                              title={`${value} star${value > 1 ? "s" : ""}`}
                            >
                              {"\u2605"}
                            </button>
                          ))}
                          <span className="review-stars-value">{rentalReviewStars}/5</span>
                        </div>
                      </label>
                      <label>
                        Review (optional)
                        <textarea
                          rows={3}
                          value={rentalReviewComment}
                          onChange={(event) => setRentalReviewComment(event.target.value)}
                          placeholder="Share feedback about the owner"
                        />
                      </label>
                      <button className="btn btn-primary" type="submit" disabled={rentalReviewMutation.isPending}>
                        {rentalReviewMutation.isPending ? "Submitting..." : "Submit Rating"}
                      </button>
                    </form>
                  )}
                  {rentalReviewMutation.isError ? <p className="feedback error">{rentalReviewMutation.error.message}</p> : null}
                </div>
              ) : null}

              {amOwner && reservationStatus === "pending" ? (
                <div className="reservation-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => handleOwnerDecision("accept")}
                    disabled={ownerDecisionMutation.isPending}
                  >
                    {ownerDecisionMutation.isPending ? "Updating..." : "Accept Reservation"}
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => handleOwnerDecision("cancel")}
                    disabled={ownerDecisionMutation.isPending}
                  >
                    {ownerDecisionMutation.isPending ? "Updating..." : "Cancel Reservation"}
                  </button>
                </div>
              ) : null}

              {amOwner && reservationStatus === "accepted" ? (
                <div className="reservation-actions">
                  {!rental?.is_rented ? <p className="muted">Reservation accepted. You can cancel if needed.</p> : null}
                  {!rental?.is_rented ? (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => handleOwnerDecision("cancel")}
                      disabled={ownerDecisionMutation.isPending}
                    >
                      {ownerDecisionMutation.isPending ? "Updating..." : "Cancel Reservation"}
                    </button>
                  ) : null}
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleOwnerMarkRentalDone}
                    disabled={ownerMarkDoneMutation.isPending}
                  >
                    {ownerMarkDoneMutation.isPending ? "Updating..." : "Mark Rental Done"}
                  </button>
                  {!rental?.is_rented ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={handleMarkRentalRented}
                      disabled={markRentalRentedMutation.isPending}
                    >
                      {markRentalRentedMutation.isPending ? "Updating..." : "Mark as Rented"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {amOwner && !rentalReservation ? <p className="muted">No reservation requests yet.</p> : null}

              {reservationError ? <p className="feedback error">{reservationError}</p> : null}
              {reservationSuccess ? <p className="feedback success">{reservationSuccess}</p> : null}
            </div>
          ) : null}
        </div>
      ) : isAccommodation ? (
        <div className="card chat-product-details">
          <h3>Accommodation Details</h3>
          {conversationQuery.isError ? <p className="feedback error">{conversationQuery.error.message}</p> : null}
          {accommodation?.photo_url ? (
            <img className="chat-product-photo" src={accommodation.photo_url} alt={accommodation?.title || "Accommodation"} />
          ) : null}
          {accommodationExtraPhotos.length ? (
            <div className="rental-photo-strip" aria-label="More accommodation photos">
              {accommodationExtraPhotos.map((photo) => (
                <a
                  className="marketplace-photo-thumb"
                  href={photo.photo_url}
                  target="_blank"
                  rel="noreferrer"
                  key={photo.id || photo.photo_url}
                >
                  <img src={photo.photo_url} alt={`${accommodation?.title || "Accommodation"} photo`} loading="lazy" />
                </a>
              ))}
            </div>
          ) : null}
          <p className="chat-offer-line">
            <strong>Category:</strong> {accommodation?.category || "Not provided"}
          </p>
          <p className="chat-offer-line">
            <strong>Location:</strong> {accommodation?.location || "Not provided"}
          </p>
          {accommodation?.room_rates?.length && isRoomReservationCategory ? (
            <div className="chat-offer-line">
              <strong>Room Rates:</strong>
              <ul className="marketplace-desc-list">
                {accommodation.room_rates.map((rate) => (
                  <li key={rate.id}>
                    {rate.classification}: PHP {Number(rate.price_php || 0).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {accommodationReservation ? (
            <p className="chat-offer-line">
              <strong>Selected Room:</strong>{" "}
              {reservedRoomRate
                ? `${reservedRoomRate.classification} (PHP ${Number(reservedRoomRate.price_php || 0).toLocaleString()})`
                : "Room selection not available"}
              {accommodationReservationStatus ? ` • Status: ${accommodationReservationStatus}` : ""}
            </p>
          ) : null}
          {showHostAccommodationActions ? (
            <div className="chat-offer-line">
              <strong>Host Actions:</strong>
              <div className="form-grid reservation-form">
                {canAcceptAccommodationReservation ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleOwnerAcceptAccommodationReservation}
                    disabled={ownerAcceptAccommodationReservationMutation.isPending}
                  >
                    {ownerAcceptAccommodationReservationMutation.isPending ? "Updating..." : "Accept Reservation"}
                  </button>
                ) : null}
                {canCheckinAccommodationReservation ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleOwnerCheckinAccommodationReservation}
                    disabled={ownerCheckinAccommodationReservationMutation.isPending}
                  >
                    {ownerCheckinAccommodationReservationMutation.isPending ? "Updating..." : "Guest Checked In"}
                  </button>
                ) : null}
                {canCheckoutAccommodationReservation ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleAccommodationCheckOut}
                    disabled={checkOutAccommodationReservationMutation.isPending}
                  >
                    {checkOutAccommodationReservationMutation.isPending ? "Updating..." : "Check Out"}
                  </button>
                ) : null}
                {canCancelAccommodationReservation ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={handleOwnerCancelAccommodationReservation}
                    disabled={ownerCancelAccommodationReservationMutation.isPending}
                  >
                    {ownerCancelAccommodationReservationMutation.isPending ? "Cancelling..." : "Cancel Reservation"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {!amClient && accommodationRoomRates.length && canRequestAccommodationReservation && isRoomReservationCategory ? (
            <div className="chat-offer-line">
              <strong>Reserve a Room:</strong>
              <div className="form-grid reservation-form">
                <label className="field">
                  <span>Room Classification</span>
                  <select
                    value={selectedRoomRateId}
                    onChange={(event) => setSelectedRoomRateId(event.target.value)}
                  >
                    {accommodationRoomRates.map((rate) => {
                      const priceValue = Number(rate.price_php || 0);
                      const priceLabel = Number.isFinite(priceValue) ? priceValue.toLocaleString() : "0";
                      return (
                        <option key={rate.id} value={rate.id}>
                          {rate.classification} (PHP {priceLabel})
                        </option>
                      );
                    })}
                  </select>
                </label>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleReserveAccommodationRoom}
                  disabled={
                    createAccommodationReservationMutation.isPending ||
                    !selectedRoomRateId ||
                    !canRequestAccommodationReservation
                  }
                >
                  {createAccommodationReservationMutation.isPending ? "Sending..." : "Reserve Room"}
                </button>
                {canCancelAccommodationReservation ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={handleCancelAccommodationReservation}
                    disabled={cancelAccommodationReservationMutation.isPending}
                  >
                    {cancelAccommodationReservationMutation.isPending ? "Cancelling..." : "Cancel Reservation"}
                  </button>
                ) : null}
              </div>
              {accommodationReservation ? (
                <p className="muted">Status: {accommodationReservationStatus || "pending"}</p>
              ) : null}
              {roomReservationError ? <p className="feedback error">{roomReservationError}</p> : null}
              {roomReservationSuccess ? <p className="feedback success">{roomReservationSuccess}</p> : null}
            </div>
          ) : null}
          {showGuestAccommodationActions ? (
            <div className="chat-offer-line">
              <strong>Guest Actions:</strong>
              <div className="form-grid reservation-form">
                {canCancelAccommodationReservation ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={handleCancelAccommodationReservation}
                    disabled={cancelAccommodationReservationMutation.isPending}
                  >
                    {cancelAccommodationReservationMutation.isPending ? "Cancelling..." : "Cancel Reservation"}
                  </button>
                ) : null}
                {canCheckoutAccommodationReservation ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleAccommodationCheckOut}
                    disabled={checkOutAccommodationReservationMutation.isPending}
                  >
                    {checkOutAccommodationReservationMutation.isPending ? "Updating..." : "Check Out"}
                  </button>
                ) : null}
              </div>
              {accommodationReservationStatus === "pending" ? (
                <p className="muted">Waiting for the host to accept your reservation.</p>
              ) : null}
              {roomReservationError ? <p className="feedback error">{roomReservationError}</p> : null}
              {roomReservationSuccess ? <p className="feedback success">{roomReservationSuccess}</p> : null}
            </div>
          ) : null}
          {!amClient && accommodationReservationStatus === "completed" ? (
            <div className="chat-review-box">
              <h4>Rate Accommodation</h4>
              {hasReviewedAccommodationStay ? (
                <p className="muted">
                  You already rated this stay
                  {accommodationReviewQuery.data ? `: ${accommodationReviewQuery.data.stars}/5` : "."}
                </p>
              ) : (
                <form className="form-grid" onSubmit={handleSubmitAccommodationReview}>
                  <label>
                    Stars
                    <div className="review-stars-input" role="radiogroup" aria-label="Select rating">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`review-star-btn ${value <= accommodationReviewStars ? "active" : ""}`}
                          onClick={() => setAccommodationReviewStars(value)}
                          role="radio"
                          aria-checked={accommodationReviewStars === value}
                          aria-label={`${value} star${value > 1 ? "s" : ""}`}
                          title={`${value} star${value > 1 ? "s" : ""}`}
                        >
                          {"\u2605"}
                        </button>
                      ))}
                      <span className="review-stars-value">{accommodationReviewStars}/5</span>
                    </div>
                  </label>
                  <label>
                    Review (optional)
                    <textarea
                      rows={3}
                      value={accommodationReviewComment}
                      onChange={(event) => setAccommodationReviewComment(event.target.value)}
                      placeholder="Share feedback about the accommodation"
                    />
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={accommodationReviewMutation.isPending}>
                    {accommodationReviewMutation.isPending ? "Submitting..." : "Submit Rating"}
                  </button>
                </form>
              )}
              {accommodationReviewMutation.isError ? (
                <p className="feedback error">{accommodationReviewMutation.error.message}</p>
              ) : null}
            </div>
          ) : null}
          <div className="chat-offer-line">
            <strong>Description:</strong>
            {accommodationDescription ? (
              <div className="marketplace-desc">
                {accommodationDescription.intro ? (
                  <p className="marketplace-desc-text">{accommodationDescription.intro}</p>
                ) : null}
                {accommodationDescription.items.length ? (
                  <ul className="marketplace-desc-list">
                    {accommodationDescription.items.map((item, index) => (
                      <li key={`accommodation-desc-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <span className="muted">No description provided.</span>
            )}
          </div>
          {accommodationNotes ? (
            <p className="chat-offer-line">
              <strong>Notes:</strong> {accommodationNotes}
            </p>
          ) : null}
          {accommodationMapUrl ? (
            <p className="chat-offer-line">
              <strong>Map:</strong>{" "}
              <a href={accommodationMapUrl} target="_blank" rel="noreferrer">
                View on Google Maps
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="card chat-job-flow">
          <h3>Job Progress</h3>
          {conversationQuery.isError ? <p className="feedback error">{conversationQuery.error.message}</p> : null}
          {completionQuery.isError ? <p className="feedback error">{completionQuery.error.message}</p> : null}
          {canRespondDirectOffer ? (
            <div className="chat-offer-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => directOfferResponseMutation.mutate("accept")}
                disabled={directOfferResponseMutation.isPending}
              >
                {directOfferResponseMutation.isPending ? "Updating..." : "Accept Offer"}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => directOfferResponseMutation.mutate("decline")}
                disabled={directOfferResponseMutation.isPending}
              >
                {directOfferResponseMutation.isPending ? "Updating..." : "Decline Offer"}
              </button>
            </div>
          ) : null}
          {job?.status === "cancelled" && isDirectOffer ? <p className="muted">This direct offer was declined/cancelled.</p> : null}
          {directOfferResponseMutation.isError ? <p className="feedback error">{directOfferResponseMutation.error.message}</p> : null}
          {jobId && otherProfile?.id ? (
            <div className="chat-report-box">
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  if (hasExistingReport) return;
                  setReportSuccess("");
                  setReportFormOpen((prev) => !prev);
                }}
                disabled={reportMutation.isPending || hasExistingReport || existingReportQuery.isLoading}
              >
                {existingReportQuery.isLoading
                  ? "Checking Report Status..."
                  : reportPendingAdminApproval
                    ? `${otherRoleLabel} Already Reported`
                    : hasExistingReport
                      ? `Report Already Reviewed`
                      : reportFormOpen
                        ? "Cancel Report"
                        : `Report ${otherRoleLabel}`}
              </button>
              {reportPendingAdminApproval ? (
                <p className="feedback">You already reported this user. Pending admin approval.</p>
              ) : null}
              {hasExistingReport && !reportPendingAdminApproval ? (
                <p className="muted">
                  You already submitted a report for this user on this job. Status: <strong>{existingReport.status}</strong>.
                </p>
              ) : null}
              {!hasExistingReport && reportFormOpen ? (
                <form
                  className="form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!reportDetails.trim()) return;
                    reportMutation.mutate({
                      reportedUserId: otherProfile.id,
                      jobId,
                      reasonType: reportReason,
                      reasonDetails: reportDetails.trim()
                    });
                  }}
                >
                  <label>
                    Report Reason
                    <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                      <option value="poor_work">Poor work quality</option>
                      <option value="salary_issue">Wrong salary / not paid right</option>
                      <option value="no_show">No show / did not finish</option>
                      <option value="fraud">Fraud / scam</option>
                      <option value="abuse">Abusive behavior</option>
                      <option value="other">Other reason</option>
                    </select>
                  </label>
                  <label>
                    Details
                    <textarea
                      rows={3}
                      value={reportDetails}
                      onChange={(event) => setReportDetails(event.target.value)}
                      placeholder="Explain what happened"
                      required
                    />
                  </label>
                  <button className="btn btn-danger" type="submit" disabled={reportMutation.isPending || !reportDetails.trim()}>
                    {reportMutation.isPending ? "Submitting Report..." : "Submit Report"}
                  </button>
                </form>
              ) : null}
              {reportSuccess ? <p className="feedback success">{reportSuccess}</p> : null}
              {reportMutation.isError ? <p className="feedback error">{reportMutation.error.message}</p> : null}
            </div>
          ) : null}
          {canMarkFinished ? (
            <button className="btn btn-primary" type="button" onClick={() => markFinishedMutation.mutate()} disabled={markFinishedMutation.isPending}>
              {markFinishedMutation.isPending ? "Updating..." : "Mark Job Finished"}
            </button>
          ) : null}
          {myMarkedDone && !bothMarkedDone ? (
            <p className="muted">You marked this as finished. Waiting for {otherRoleLabel.toLowerCase()} confirmation.</p>
          ) : null}
          {otherMarkedDone && !myMarkedDone ? <p className="muted">{otherRoleLabel} marked this as finished.</p> : null}
          {bothMarkedDone ? <p className="feedback success">Both sides marked finished. You can now submit rating.</p> : null}
          {markFinishedMutation.isError ? <p className="feedback error">{markFinishedMutation.error.message}</p> : null}

          {bothMarkedDone && otherProfile?.id ? (
            <div className="chat-review-box">
              <h4>Rate {otherRoleLabel}</h4>
              {existingReview ? (
                <p className="muted">
                  You already rated {otherName}: {existingReview.stars}/5
                </p>
              ) : (
                <form className="form-grid" onSubmit={handleSubmitReview}>
                  <label>
                    Stars
                    <div className="review-stars-input" role="radiogroup" aria-label="Select rating">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`review-star-btn ${value <= reviewStars ? "active" : ""}`}
                          onClick={() => setReviewStars(value)}
                          role="radio"
                          aria-checked={reviewStars === value}
                          aria-label={`${value} star${value > 1 ? "s" : ""}`}
                          title={`${value} star${value > 1 ? "s" : ""}`}
                        >
                          {"\u2605"}
                        </button>
                      ))}
                      <span className="review-stars-value">{reviewStars}/5</span>
                    </div>
                  </label>
                  <label>
                    Review (optional)
                    <textarea
                      rows={3}
                      value={reviewComment}
                      onChange={(event) => setReviewComment(event.target.value)}
                      placeholder={`Share feedback for ${otherName}`}
                    />
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={reviewMutation.isPending}>
                    {reviewMutation.isPending ? "Submitting..." : "Submit Rating"}
                  </button>
                </form>
              )}
              {reviewMutation.isError ? <p className="feedback error">{reviewMutation.error.message}</p> : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="card chat-thread">
        {messagesQuery.isError ? <p className="feedback error">{messagesQuery.error.message}</p> : null}
        {!messagesQuery.isLoading && !messagesQuery.isError && messagesQuery.data?.length === 0 ? (
          <p className="muted text-center">No messages yet. Start the conversation.</p>
        ) : null}
        {messagesQuery.data?.map((message) => (
          <MessageBubble key={message.id} message={message} mine={message.sender_id === user?.id} />
        ))}
        <div ref={threadEndRef} />
      </div>

      <form className="chat-input" onSubmit={handleSend}>
        <div className="chat-input-main">
          <div className="chat-input-row">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type a message or paste a link..."
              disabled={sendMutation.isPending || isUploading}
            />
            <button
              className="btn btn-secondary chat-attach-btn"
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={sendMutation.isPending || isUploading}
            >
              Add Photo
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
          </div>
          {photoPreview ? (
            <div className="chat-photo-preview">
              <img src={photoPreview} alt="Selected upload" />
              <div className="chat-photo-meta">
                <p className="muted">Ready to send photo</p>
                <button
                  className="btn btn-danger chat-photo-remove"
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={sendMutation.isPending || isUploading}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
          {uploadError ? <p className="feedback error">{uploadError}</p> : null}
        </div>
        <button className="btn btn-primary" type="submit" disabled={sendDisabled}>
          {sendMutation.isPending || isUploading ? "Sending..." : "Send"}
        </button>
      </form>
      {sendError ? <p className="feedback error">{sendError}</p> : null}
    </section>
  );
}
