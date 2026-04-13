import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteConversations, getConversationById, listConversations, listMessages } from "../api";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../../components/common/EmptyState";

function readSingle(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getFullName(profile) {
  if (!profile) return "";
  return [profile.firstname, profile.surname].filter(Boolean).join(" ").trim();
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function getRoleRating(profile, roleLabel) {
  if (!profile) return "No ratings yet";
  const isApplicant = roleLabel === "Applicant";
  const avg = Number(isApplicant ? profile.freelancer_rating_avg : profile.client_rating_avg);
  const count = Number(isApplicant ? profile.freelancer_rating_count : profile.client_rating_count);

  if (count > 0) return `\u2605 ${avg.toFixed(1)} (${count})`;

  const fallbackAvg = Number(profile.rating_avg || 0);
  const fallbackCount = Number(profile.rating_count || 0);
  if (fallbackCount > 0) return `\u2605 ${fallbackAvg.toFixed(1)} (${fallbackCount})`;

  return "No ratings yet";
}

function getGenericRating(profile) {
  if (!profile) return "No ratings yet";
  const avg = Number(profile.rating_avg || 0);
  const count = Number(profile.rating_count || 0);
  if (count > 0) return `\u2605 ${avg.toFixed(1)} (${count})`;
  return "No ratings yet";
}

const CHAT_LIST_PAGE_SIZE = 30;

export function ChatListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectAllRef = useRef(null);
  const prefetchedIdsRef = useRef(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteError, setDeleteError] = useState("");
  const conversationsQuery = useInfiniteQuery({
    queryKey: ["conversations", user?.id, "infinite"],
    queryFn: ({ pageParam = 1 }) => listConversations(user.id, { page: pageParam, pageSize: CHAT_LIST_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!Array.isArray(lastPage) || lastPage.length < CHAT_LIST_PAGE_SIZE) return undefined;
      return allPages.length + 1;
    },
    enabled: !!user?.id
  });

  const conversations = useMemo(
    () => conversationsQuery.data?.pages?.flatMap((page) => page || []) || [],
    [conversationsQuery.data]
  );
  const conversationIds = useMemo(() => conversations.map((item) => item.id), [conversations]);
  const allSelected = conversationIds.length > 0 && selectedIds.size === conversationIds.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  useEffect(() => {
    if (!conversationIds.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(conversationIds);
      const next = new Set();
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
      });
      return next;
    });
  }, [conversationIds]);

  const deleteMutation = useMutation({
    mutationFn: ({ conversationIds: ids }) => deleteConversations({ userId: user?.id, conversationIds: ids }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["unread-chat-count", user?.id] })
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
    setSelectedIds(new Set(conversationIds));
  }

  async function handleDeleteSelected() {
    if (!selectedIds.size || deleteMutation.isPending) return;
    const confirmed = window.confirm(`Delete ${selectedIds.size} selected chat(s)?`);
    if (!confirmed) return;
    setDeleteError("");
    try {
      await deleteMutation.mutateAsync({ conversationIds: Array.from(selectedIds) });
      setSelectedIds(new Set());
    } catch (error) {
      setDeleteError(error?.message || "Unable to delete chats right now.");
    }
  }

  function prefetchConversation(conversationId) {
    if (!conversationId) return;
    if (prefetchedIdsRef.current.has(conversationId)) {
      import("./ChatRoomPage");
      return;
    }
    prefetchedIdsRef.current.add(conversationId);
    Promise.all([getConversationById(conversationId), listMessages(conversationId)])
      .then(([conversation, messages]) => {
        queryClient.setQueryData(["conversation", conversationId], conversation);
        queryClient.setQueryData(["messages", conversationId], messages);
      })
      .catch(() => {
        prefetchedIdsRef.current.delete(conversationId);
      });
    import("./ChatRoomPage");
  }

  return (
    <section className="page chat-list-screen">
      <h2>Chat</h2>
      {conversations.length > 0 ? (
        <div className="card notification-toolbar">
          <label className="notification-select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={handleToggleSelectAll}
              aria-label="Select all chats"
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
      {!conversationsQuery.isLoading && conversations.length === 0 ? (
        <EmptyState title="No chats yet" description="Chat opens after a job application is accepted or a marketplace inquiry starts." />
      ) : null}
      <div className="stack">
        {conversations.map((conversation) => (
          <article
            className="card chat-list-card"
            key={conversation.id}
            role="link"
            tabIndex={0}
            onMouseEnter={() => prefetchConversation(conversation.id)}
            onFocus={() => prefetchConversation(conversation.id)}
            onClick={(event) => {
              if (event.target.closest("a,button,input,textarea,select,label")) return;
              navigate(`/chat/${conversation.id}`);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                if (event.target.closest("a,button,input,textarea,select,label")) return;
                event.preventDefault();
                navigate(`/chat/${conversation.id}`);
              }
            }}
            aria-label={`Open chat for ${
              readSingle(conversation.accommodation)?.title ||
              readSingle(conversation.rental)?.title ||
              readSingle(conversation.product)?.name ||
              readSingle(conversation.job)?.title ||
              "conversation"
            }`}
          >
            {(() => {
              const job = readSingle(conversation.job);
              const product = readSingle(conversation.product);
              const rental = readSingle(conversation.rental);
              const accommodation = readSingle(conversation.accommodation);
              const isMarketplace = !!product?.id;
              const isRental = !!rental?.id;
              const isAccommodation = !!accommodation?.id;
              const clientProfile = readSingle(conversation.client_profile);
              const freelancerProfile = readSingle(conversation.freelancer_profile);
              const amClient = conversation.client_id === user?.id;
              const otherProfile = amClient ? freelancerProfile : clientProfile;
              const otherLabel = isMarketplace
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
              const otherName = getFullName(otherProfile) || otherLabel;
              const ratingText =
                isMarketplace || isRental || isAccommodation
                  ? getGenericRating(otherProfile)
                  : getRoleRating(otherProfile, otherLabel);
              const profilePath = otherProfile?.id ? `/profiles/${otherProfile.id}` : "";
              const avatarNode = profilePath ? (
                <Link
                  className="chat-list-avatar-link"
                  to={profilePath}
                  aria-label={`View ${otherName} profile`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {otherProfile?.avatar_url ? (
                    <img className="chat-list-avatar" src={otherProfile.avatar_url} alt={otherName} />
                  ) : (
                    <span className="chat-list-avatar-fallback">{getInitials(otherName)}</span>
                  )}
                </Link>
              ) : otherProfile?.avatar_url ? (
                <img className="chat-list-avatar" src={otherProfile.avatar_url} alt={otherName} />
              ) : (
                <span className="chat-list-avatar-fallback">{getInitials(otherName)}</span>
              );

              return (
                <>
                  <div className="chat-list-title">
                    <label className="notification-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(conversation.id)}
                        onChange={() => handleToggleSelect(conversation.id)}
                        aria-label="Select chat"
                      />
                    </label>
                    <div className="job-row">
                      <h3>{accommodation?.title || rental?.title || product?.name || job?.title || "Conversation"}</h3>
                      {job?.status ? (
                        <span className={`pill ${job.status}`}>{job.status}</span>
                      ) : isMarketplace ? (
                        <span className="pill marketplace">Marketplace</span>
                      ) : isRental ? (
                        <span className="pill marketplace">Rental</span>
                      ) : isAccommodation ? (
                        <span className="pill marketplace">Accommodation</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="chat-list-participant">
                    <div className="chat-list-participant-body">
                      <p className="chat-participant-line">{otherLabel}</p>
                      <div className="chat-participant-identity">
                        {avatarNode}
                        {profilePath ? (
                          <Link
                            className="chat-participant-name"
                            to={profilePath}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {otherName}
                          </Link>
                        ) : (
                          <p className="chat-participant-name">{otherName}</p>
                        )}
                      </div>
                      <p className="chat-participant-rating">{ratingText}</p>
                    </div>
                  </div>

                  <p className="muted">Started {new Date(conversation.created_at).toLocaleString()}</p>
                </>
              );
            })()}
          </article>
        ))}
      </div>
      {conversations.length > 0 ? (
        <div className="list-load-more">
          {conversationsQuery.hasNextPage ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => conversationsQuery.fetchNextPage()}
              disabled={conversationsQuery.isFetchingNextPage}
            >
              {conversationsQuery.isFetchingNextPage ? "Loading older chats..." : "Load More"}
            </button>
          ) : (
            <p className="muted">No older chats left.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

