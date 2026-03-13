import { supabase } from "../../lib/supabaseClient";

export async function listMarketplaceProducts() {
  const { data, error } = await supabase
    .from("marketplace_products")
    .select(
      "id, seller_id, name, category, specification, price_php, stock, sold_out, location, map_url, notes, photo_url, created_at, seller:seller_id(id, firstname, surname, avatar_url, rating_avg, rating_count, seller_rating_avg, seller_rating_count), photos:marketplace_product_photos(id, photo_url, created_at)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createMarketplaceProduct({
  sellerId,
  name,
  category,
  specification,
  pricePhp,
  stock,
  sold_out,
  location,
  mapUrl,
  notes,
  photoUrl
}) {
  const { data, error } = await supabase
    .from("marketplace_products")
    .insert({
      seller_id: sellerId,
      name,
      category,
      specification,
      price_php: pricePhp,
      stock,
      sold_out: sold_out ?? stock === 0,
      location,
      map_url: mapUrl || null,
      notes,
      photo_url: photoUrl || null
    })
    .select(
      "id, seller_id, name, category, specification, price_php, stock, sold_out, location, map_url, notes, photo_url, created_at, seller:seller_id(id, firstname, surname, avatar_url, rating_avg, rating_count, seller_rating_avg, seller_rating_count), photos:marketplace_product_photos(id, photo_url, created_at)"
    )
    .single();
  if (error) throw error;
  return data;
}

export async function updateMarketplaceProduct({ productId, updates }) {
  const { data, error } = await supabase
    .from("marketplace_products")
    .update(updates)
    .eq("id", productId)
    .select(
      "id, seller_id, name, category, specification, price_php, stock, sold_out, location, map_url, notes, photo_url, created_at, seller:seller_id(id, firstname, surname, avatar_url, rating_avg, rating_count, seller_rating_avg, seller_rating_count), photos:marketplace_product_photos(id, photo_url, created_at)"
    )
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMarketplaceProduct(productId) {
  const { error } = await supabase.from("marketplace_products").delete().eq("id", productId);
  if (error) throw error;
  return true;
}

export async function uploadMarketplaceProductPhoto(userId, file) {
  const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `public/${userId}/product-${Date.now()}.${fileExt}`;
  const bucket = "marketplace-photos";

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: false });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl }
  } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrl;
}

export async function addMarketplaceProductPhotos({ productId, sellerId, photoUrls }) {
  if (!photoUrls?.length) return [];
  const { data, error } = await supabase
    .from("marketplace_product_photos")
    .insert(
      photoUrls.map((url) => ({
        product_id: productId,
        seller_id: sellerId,
        photo_url: url
      }))
    )
    .select("id, product_id, photo_url, created_at");
  if (error) throw error;
  return data || [];
}

export async function deleteMarketplaceProductPhoto(photoId) {
  const { error } = await supabase.from("marketplace_product_photos").delete().eq("id", photoId);
  if (error) throw error;
  return true;
}

export async function placeMarketplaceOrder({ productId, quantity }) {
  const { data, error } = await supabase.rpc("place_marketplace_order", {
    p_product_id: productId,
    p_quantity: quantity
  });
  if (error) throw error;
  return data;
}

export async function getMarketplaceOrder({ productId, buyerId }) {
  const { data, error } = await supabase
    .from("marketplace_orders")
    .select("id, product_id, buyer_id, seller_id, quantity, created_at")
    .eq("product_id", productId)
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getMarketplaceReceipt({ productId, buyerId }) {
  const { data, error } = await supabase
    .from("marketplace_receipts")
    .select("id, product_id, buyer_id, seller_id, received_at")
    .eq("product_id", productId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function markMarketplaceReceived(productId) {
  const { data, error } = await supabase.rpc("mark_marketplace_received", {
    p_product_id: productId
  });
  if (error) throw error;
  return data;
}

export async function getMyMarketplaceReview({ productId, buyerId }) {
  const { data, error } = await supabase
    .from("marketplace_reviews")
    .select("id, product_id, buyer_id, seller_id, stars, comment, created_at")
    .eq("product_id", productId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function submitMarketplaceReview({ productId, stars, comment }) {
  const { data, error } = await supabase.rpc("submit_marketplace_review", {
    p_product_id: productId,
    p_stars: stars,
    p_comment: comment || null
  });
  if (error) throw error;
  return data;
}
