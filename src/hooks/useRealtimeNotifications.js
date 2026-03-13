import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export function useRealtimeNotifications(userId, onInsert) {
  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`
        },
        (payload) => onInsert?.(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onInsert]);
}
