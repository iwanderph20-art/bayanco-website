// ============================================================
// media-upload.js — BayanCo client-side media pipeline
//
// Handles:
//  • Image compression (Canvas API — no extra dependencies)
//  • File-type and size validation
//  • Supabase Storage upload for images + documents
//  • Mux direct-upload for videos (via Edge Function)
//  • Progress callbacks for UI feedback
// ============================================================

/* global BAYANCO_CONFIG */

// ── Config (set via window.BAYANCO_CONFIG before loading this file) ──
const getConfig = () => window.BAYANCO_CONFIG || {};

const ALLOWED = {
  image:    { types: ["image/jpeg","image/png","image/webp","image/gif"], maxMB: 10 },
  video:    { types: ["video/mp4","video/quicktime","video/x-msvideo","video/webm"], maxMB: 500 },
  document: { types: ["application/pdf","image/jpeg","image/png"], maxMB: 10 },
};

// ── Validation ────────────────────────────────────────────────
function validateFile(file, kind) {
  const rule = ALLOWED[kind];
  if (!rule) throw new Error(`Unknown file kind: ${kind}`);

  if (!rule.types.includes(file.type)) {
    throw new Error(
      `Invalid file type "${file.type}". Allowed for ${kind}: ${rule.types.join(", ")}`
    );
  }

  const maxBytes = rule.maxMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File too large (${(file.size/1024/1024).toFixed(1)} MB). Max: ${rule.maxMB} MB`);
  }
}

// ── Image compression using Canvas API ───────────────────────
// Reduces an uploaded image to ≤1280 px wide at 80 % JPEG quality.
// A 10 MB DSLR photo typically becomes < 400 KB.
async function compressImage(file, maxWidth = 1280, quality = 0.80) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(blobUrl);

      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width  = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Image compression failed"));
          const out = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            { type: "image/jpeg", lastModified: Date.now() }
          );
          console.log(`[BayanCo] Compressed ${file.name}: ${(file.size/1024).toFixed(0)} KB → ${(out.size/1024).toFixed(0)} KB`);
          resolve(out);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("Could not read image file"));
    };

    img.src = blobUrl;
  });
}

// ── Upload image to Supabase Storage ─────────────────────────
// Returns { type, url, thumbnail_url, file_name, file_size }
async function uploadImage(file, campaignId, onProgress) {
  validateFile(file, "image");

  onProgress?.({ stage: "compressing", pct: 10, msg: "Compressing image…" });
  const compressed = await compressImage(file);

  onProgress?.({ stage: "uploading", pct: 30, msg: "Uploading image…" });

  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const path = `${campaignId}/${Date.now()}-${uid()}.jpg`;

  const res = await fetch(`${supabaseUrl}/storage/v1/object/campaign-media/${path}`, {
    method:  "POST",
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "false",
    },
    body: compressed,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Image upload failed");
  }

  onProgress?.({ stage: "done", pct: 100, msg: "Image uploaded!" });

  const publicUrl    = `${supabaseUrl}/storage/v1/object/public/campaign-media/${path}`;
  // Supabase image transform — serves a 400 × 400 crop for thumbnails
  const thumbnailUrl = `${supabaseUrl}/storage/v1/render/image/public/campaign-media/${path}?width=400&height=400&resize=cover&quality=75`;

  return {
    type:          "image",
    url:           publicUrl,
    thumbnail_url: thumbnailUrl,
    storage_path:  `campaign-media/${path}`,
    file_name:     file.name,
    file_size:     compressed.size,
    mime_type:     "image/jpeg",
    upload_complete: true,
  };
}

// ── Upload document to Supabase Storage ──────────────────────
// Stored in a PRIVATE bucket; access via signed URLs.
async function uploadDocument(file, campaignId, onProgress) {
  validateFile(file, "document");

  onProgress?.({ stage: "uploading", pct: 30, msg: "Uploading document…" });

  const { supabaseUrl, supabaseAnonKey } = getConfig();
  const ext  = file.name.split(".").pop();
  const path = `${campaignId}/docs/${Date.now()}-${uid()}.${ext}`;

  const res = await fetch(`${supabaseUrl}/storage/v1/object/campaign-docs/${path}`, {
    method:  "POST",
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!res.ok) throw new Error("Document upload failed");

  onProgress?.({ stage: "done", pct: 100, msg: "Document uploaded!" });

  return {
    type:          "document",
    storage_path:  `campaign-docs/${path}`,
    file_name:     file.name,
    file_size:     file.size,
    mime_type:     file.type,
    upload_complete: true,
  };
}

// ── Upload video via Mux direct-upload ───────────────────────
// 1. Get a one-time PUT URL from our Edge Function
// 2. PUT the file directly to Mux (no size limit beyond Mux's own)
// 3. Mux processes asynchronously; mux-webhook updates DB when ready
async function uploadVideo(file, campaignId, onProgress) {
  validateFile(file, "video");

  onProgress?.({ stage: "preparing", pct: 5, msg: "Preparing video upload…" });

  const { functionsUrl } = getConfig();

  // Step 1: get Mux upload URL
  const urlRes = await fetch(`${functionsUrl}/create-mux-upload`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ campaign_id: campaignId, file_name: file.name }),
  });

  if (!urlRes.ok) throw new Error("Could not create video upload URL");
  const { upload_url, upload_id } = await urlRes.json();

  onProgress?.({ stage: "uploading", pct: 10, msg: "Uploading video to Mux…" });

  // Step 2: PUT directly to Mux with XHR for progress
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round(10 + (e.loaded / e.total) * 80);
        onProgress?.({ stage: "uploading", pct, msg: `Uploading video… ${pct}%` });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(null);
      else reject(new Error(`Mux upload HTTP ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Video upload network error")));

    xhr.open("PUT", upload_url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });

  onProgress?.({ stage: "processing", pct: 95, msg: "Video uploaded — Mux is processing…" });

  // The DB will be updated by the mux-webhook function when Mux finishes
  return {
    type:           "video",
    mux_upload_id:  upload_id,
    mux_status:     "processing",
    file_name:      file.name,
    file_size:      file.size,
    mime_type:      file.type,
    upload_complete: false, // becomes true via webhook
  };
}

// ── Helpers ───────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Public API ────────────────────────────────────────────────
window.BayanCoUpload = {
  uploadImage,
  uploadDocument,
  uploadVideo,
  compressImage,
  validateFile,
};
