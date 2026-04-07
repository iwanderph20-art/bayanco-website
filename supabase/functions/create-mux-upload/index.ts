// ============================================================
// create-mux-upload — Supabase Edge Function
// Creates a Mux Direct Upload URL so the browser can PUT
// the video file directly to Mux without touching our servers.
// Returns: { upload_url, upload_id }
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const MUX_TOKEN_ID     = Deno.env.get("MUX_TOKEN_ID");
    const MUX_TOKEN_SECRET = Deno.env.get("MUX_TOKEN_SECRET");

    if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
      return new Response(
        JSON.stringify({ error: "Mux credentials not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { campaign_id, file_name } = await req.json();

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "campaign_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Mux Direct Upload
    const credentials = btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`);

    const muxRes = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: {
        Authorization:  `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Allow upload from any origin (we validate on our end)
        cors_origin: "*",
        // Settings for the asset Mux creates after upload
        new_asset_settings: {
          playback_policy: ["public"],
          // Store our metadata in the passthrough field
          passthrough: JSON.stringify({ campaign_id, file_name: file_name ?? "upload" }),
          // Generate a thumbnail at 2 seconds
          mp4_support: "none",
        },
        // Timeout for the upload URL (24 hours)
        timeout: 3600,
      }),
    });

    if (!muxRes.ok) {
      const err = await muxRes.text();
      throw new Error(`Mux API error: ${err}`);
    }

    const muxData = await muxRes.json();
    const upload = muxData.data;

    return new Response(
      JSON.stringify({
        upload_url: upload.url,
        upload_id:  upload.id,
        // asset_id is null here; it becomes available after the upload finishes
        // and Mux sends a webhook (see mux-webhook function)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("create-mux-upload error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
