import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export function useRealtimeChat(conversationId, onInsert) {
  useEffect(() => {
    if (!conversationId) return undefined;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => onInsert?.(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, onInsert]);
}
