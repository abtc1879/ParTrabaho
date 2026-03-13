import { supabase } from "./supabaseClient";

export const DEFAULT_LOGO_URL = "/brand/partrabaho-mark-4096.png";

export async function getAppSettings() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("id, logo_url, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function uploadAppLogo({ userId, file }) {
  if (!userId) throw new Error("Missing user id for logo upload.");
  if (!file) throw new Error("Logo file is required.");

  const fileExt = (file.name.split(".").pop() || "png").toLowerCase();
  const filePath = `public/branding/app-logo-${Date.now()}.${fileExt}`;
  const bucket = "app-assets";

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: false });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrl;
}

export async function updateAppLogo({ userId, logoUrl }) {
  if (!userId) throw new Error("Missing user id for logo update.");
  if (!logoUrl) throw new Error("Logo URL is required.");

  const { data, error } = await supabase
    .from("app_settings")
    .upsert({
      id: 1,
      logo_url: logoUrl,
      updated_by: userId
    })
    .select("id, logo_url, updated_at, updated_by")
    .single();
  if (error) throw error;
  return data;
}
