import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const AuthContext = createContext(null);

function formatRestrictionMessage(profile) {
  if (!profile) return "";
  if (profile.blocked_listed) {
    return "Your account is blocked listed due to repeated offenses.";
  }

  if (profile.suspended_until) {
    const suspendedUntil = new Date(profile.suspended_until);
    if (!Number.isNaN(suspendedUntil.getTime()) && suspendedUntil.getTime() > Date.now()) {
      return `Your account is suspended until ${suspendedUntil.toLocaleString()}.`;
    }
  }

  return "";
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profileState, setProfileState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function getProfileState(userId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("blocked_listed, suspended_until, is_admin")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        // During migration rollout, columns may not exist yet.
        return null;
      }

      return data || null;
    }

    async function applySession(nextSession) {
      if (!mounted) return;
      if (!nextSession?.user?.id) {
        setSession(nextSession ?? null);
        setProfileState(null);
        setLoading(false);
        return;
      }

      const profile = await getProfileState(nextSession.user.id);

      if (!mounted) return;

      setSession(nextSession ?? null);
      setProfileState(profile);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAdmin: !!profileState?.is_admin,
      isRestricted: !!formatRestrictionMessage(profileState),
      restrictionMessage: formatRestrictionMessage(profileState),
      profileState
    }),
    [session, loading, profileState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
