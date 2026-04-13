import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  deleteNotifications,
  getConversationIdByJob,
  getAccommodationReservationById,
  getRentalReservationById,
  listNotifications,
  markNotificationRead,
  openDirectOfferConversation,
  submitReportAppealFromNotification
} from "../api";
import { NotificationItem } from "../components/NotificationItem";
import { useAuth } from "../../auth/AuthContext";
import { useRealtimeNotifications } from "../../../hooks/useRealtimeNotifications";
import { EmptyState } from "../../../components/common/EmptyState";
import { acceptApplicant, declineApplicant } from "../../applications/api";
import { openAccommodationConversation, openMarketplaceConversation, openRentalConversation } from "../../chat/api";

const NOTIFICATIONS_PAGE_SIZE = 40;

export function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectAllRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteError, setDeleteError] = useState("");

  const notificationsQuery = useInfiniteQuery({
    queryKey: ["notifications", user?.id, "infinite"],
    queryFn: ({ pageParam = 1 }) => listNotifications(user.id, { page: pageParam, pageSize: NOTIFICATIONS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!Array.isArray(lastPage) || lastPage.length < NOTIFICATIONS_PAGE_SIZE) return undefined;
      return allPages.length + 1;
    },
    enabled: !!user?.id
  });

  const loadedNotifications = useMemo(
    () => notificationsQuery.data?.pages?.flatMap((page) => page || []) || [],
    [notificationsQuery.data]
  );

  const sortedNotifications = useMemo(() => {
    const items = loadedNotifications;
    return [...items].sort((a, b) => {
      if (a.is_read === b.is_read) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return a.is_read ? 1 : -1;
    });
  }, [loadedNotifications]);

  const allNotificationIds = useMemo(() => sortedNotifications.map((item) => item.id), [sortedNotifications]);
  const allSelected = allNotificationIds.length > 0 && selectedIds.size === allNotificationIds.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  useEffect(() => {
    if (!allNotificationIds.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(allNotificationIds);
      const next = new Set();
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
      });
      return next;
    });
  }, [allNotificationIds]);

  useRealtimeNotifications(user?.id, () => {
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  });

  const deleteMutation = useMutation({
    mutationFn: ({ userId, notificationIds }) => deleteNotifications({ userId, notificationIds }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["unread-notification-count", user?.id] })
      ]);
    }
  });

  function handleToggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(allNotificationIds));
  }

  async function handleDeleteSelected() {
    if (!selectedIds.size || deleteMutation.isPending) return;
    if (!user?.id) {
      setDeleteError("Unable to delete notifications without a signed-in user.");
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedIds.size} selected notification(s)?`);
    if (!confirmed) return;
    setDeleteError("");
    try {
      await deleteMutation.mutateAsync({ userId: user.id, notificationIds: Array.from(selectedIds) });
      setSelectedIds(new Set());
    } catch (error) {
      setDeleteError(error?.message || "Unable to delete notifications right now.");
    }
  }

  async function onAcceptApplication(applicationId, notificationId) {
    await acceptApplicant(applicationId);
    await markNotificationRead(notificationId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["unread-notification-count", user?.id] })
    ]);
  }

  async function onDeclineApplication(applicationId, notificationId) {
    await declineApplicant(applicationId);
    await markNotificationRead(notificationId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["unread-notification-count", user?.id] })
    ]);
  }

  async function onOpenNotificationChat(notification) {
    const data = notification?.data || {};
    const jobId = typeof data.job_id === "string" ? data.job_id : "";
    const clientId = typeof data.client_id === "string" ? data.client_id : "";
    const productId = typeof data.product_id === "string" ? data.product_id : "";
    const buyerId = typeof data.buyer_id === "string" ? data.buyer_id : "";
    const rentalId = typeof data.rental_id === "string" ? data.rental_id : "";
    const reservationId = typeof data.reservation_id === "string" ? data.reservation_id : "";
    const accommodationId = typeof data.accommodation_id === "string" ? data.accommodation_id : "";

    const isDirectOffer = notification?.type === "job_match" && data.offer_type === "direct";
    const isRentalNotification = notification?.type === "rental_reservation" || notification?.type === "rental_update";
    const isAccommodationNotification =
      notification?.type === "accommodation_reservation" || notification?.type === "accommodation_update";

    let rentalConversationId = "";
    if (isRentalNotification && rentalId) {
      const reservation = reservationId ? await getRentalReservationById(reservationId) : null;
      const ownerId = reservation?.owner_id || "";
      const renterId = reservation?.renter_id || "";
      if (ownerId && renterId) {
        rentalConversationId = await openRentalConversation({
          rentalId,
          ownerId,
          renterId
        });
      }
    }

    let accommodationConversationId = "";
    if (isAccommodationNotification && accommodationId) {
      const reservation = reservationId ? await getAccommodationReservationById(reservationId) : null;
      const ownerId = reservation?.owner_id || "";
      const guestId = reservation?.guest_id || "";
      if (ownerId && guestId) {
        accommodationConversationId = await openAccommodationConversation({
          accommodationId,
          ownerId,
          guestId
        });
      }
    }

    const conversationId =
      isAccommodationNotification && accommodationConversationId
        ? accommodationConversationId
        : isRentalNotification && rentalConversationId
        ? rentalConversationId
        : notification?.type === "marketplace_update" && productId && buyerId
        ? await openMarketplaceConversation({
            productId,
            sellerId: user.id,
            buyerId
          })
        : isDirectOffer
          ? await openDirectOfferConversation({
              jobId,
              clientId,
              freelancerId: user.id
            })
          : await getConversationIdByJob(jobId);

    navigate(conversationId ? `/chat/${conversationId}` : "/chat");

    if (!notification.is_read) {
      await markNotificationRead(notification.id);
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["unread-notification-count", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] })
    ]);
  }

  async function onSubmitReportAppeal({ reportId, reasonDetails, notificationId }) {
    await submitReportAppealFromNotification({ reportId, reasonDetails });
    if (notificationId) {
      await markNotificationRead(notificationId);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["unread-notification-count", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["my-support-requests", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["reports-against-user", user?.id] })
    ]);
  }

  return (
    <section className="page">
      <h2>Notifications</h2>
      {sortedNotifications.length > 0 ? (
        <div className="card notification-toolbar">
          <label className="notification-select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={handleToggleSelectAll}
              aria-label="Select all notifications"
            />
            <span>Select all</span>
          </label>
          <span className="muted">{selectedIds.size} selected</span>
          <div className="notification-toolbar-actions">
            <button
              className="btn btn-danger"
              type="button"
              onClick={handleDeleteSelected}
              disabled={!selectedIds.size || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Selected"}
            </button>
            {selectedIds.size ? (
              <button className="btn btn-secondary" type="button" onClick={() => setSelectedIds(new Set())}>
                Clear Selection
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {deleteError ? <p className="feedback error">{deleteError}</p> : null}
      {!notificationsQuery.isLoading && sortedNotifications.length === 0 ? (
        <EmptyState title="No notifications yet" description="Updates for applications, matches, and acceptance appear here." />
      ) : null}
      <div className="stack">
        {sortedNotifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onAcceptApplication={onAcceptApplication}
            onDeclineApplication={onDeclineApplication}
            onOpenNotificationChat={onOpenNotificationChat}
            onSubmitReportAppeal={onSubmitReportAppeal}
            isSelected={selectedIds.has(notification.id)}
            onToggleSelect={handleToggleSelect}
          />
        ))}
      </div>
      {sortedNotifications.length > 0 ? (
        <div className="list-load-more">
          {notificationsQuery.hasNextPage ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => notificationsQuery.fetchNextPage()}
              disabled={notificationsQuery.isFetchingNextPage}
            >
              {notificationsQuery.isFetchingNextPage ? "Loading older notifications..." : "Load More"}
            </button>
          ) : (
            <p className="muted">No older notifications left.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
