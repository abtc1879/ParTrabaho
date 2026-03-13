import { supabase } from "../../lib/supabaseClient";

export async function signInWithEmail({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail({ email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function signInWithPhone(phone) {
  const { data, error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
  return data;
}

export async function signInWithFacebook() {
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "facebook",
    options: {
      redirectTo,
      scopes: "email public_profile"
    }
  });
  if (error) throw error;
  return data;
}

export async function logLoginAttempt({ attemptedEmail, success, failureMessage = null }) {
  const userAgent = typeof window !== "undefined" ? window.navigator?.userAgent || null : null;
  const normalizedEmail = String(attemptedEmail || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return null;
  }
  const payload = {
    p_attempted_email: normalizedEmail,
    p_success: !!success,
    p_failure_message: failureMessage,
    p_user_agent: userAgent
  };

  const { data, error } = await supabase.rpc("log_login_attempt", payload);
  if (!error) return data;

  // Fallback path when RPC is unavailable or schema cache is stale.
  const { data: inserted, error: insertError } = await supabase
    .from("login_attempt_logs")
    .insert({
      attempted_email: normalizedEmail,
      success: !!success,
      failure_message: success ? null : failureMessage || null,
      user_agent: userAgent
    })
    .select("id")
    .single();

  if (insertError) throw error;
  return inserted?.id || null;
}

export async function submitLoginRecoveryRequest({ requesterName, requesterEmail, requesterPhone, reasonDetails }) {
  const normalizedEmail = String(requesterEmail || "").trim().toLowerCase();
  const payload = {
    p_requester_name: requesterName,
    p_requester_email: normalizedEmail,
    p_requester_phone: requesterPhone,
    p_reason_details: reasonDetails
  };

  const { data, error } = await supabase.rpc("submit_login_recovery_request", payload);
  if (!error) return data;

  const message = String(error.message || "").toLowerCase();
  const missingFunction =
    message.includes("could not find the function") ||
    message.includes("schema cache") ||
    message.includes("submit_login_recovery_request");

  if (!missingFunction) throw error;

  // Fallback path if RPC is not available yet in PostgREST schema cache.
  const { data: inserted, error: insertError } = await supabase
    .from("login_recovery_requests")
    .insert({
      requester_name: requesterName,
      requester_email: normalizedEmail,
      requester_phone: requesterPhone,
      reason_details: reasonDetails,
      status: "pending"
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted?.id || null;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resendSignupConfirmation(email) {
  const { data, error } = await supabase.auth.resend({
    type: "signup",
    email
  });
  if (error) throw error;
  return data;
}
