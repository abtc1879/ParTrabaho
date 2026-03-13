export function formatAddress(profile, fallback = "") {
  if (!profile) return fallback;
  const parts = [profile.barangay, profile.city_municipality, profile.province]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(", ");
  const legacy = String(profile.address || "").trim();
  return legacy || fallback;
}

export function splitLegacyAddress(address) {
  const raw = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (raw.length >= 3) {
    return {
      barangay: raw[0],
      city_municipality: raw[1],
      province: raw.slice(2).join(", ")
    };
  }
  if (raw.length === 2) {
    return {
      barangay: raw[0],
      city_municipality: raw[1],
      province: ""
    };
  }
  if (raw.length === 1) {
    return {
      barangay: raw[0],
      city_municipality: "",
      province: ""
    };
  }
  return {
    barangay: "",
    city_municipality: "",
    province: ""
  };
}
