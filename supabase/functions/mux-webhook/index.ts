// ============================================================
// mux-webhook — Supabase Edge Function
// Receives Mux webhook events and updates campaign_media
// when a video asset becomes ready.
//
// Mux Dashboard setup: Webhooks → add endpoint:
//   https://<your-project>.supabase.co/functions/v1/mux-webhook
// Subscribe to events: video.asset.ready, video.asset.errored
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // Optional: verify Mux webhook signature
    // const sig = req.headers.get("mux-signature");
    // Verify with MUX_WEBHOOK_SECRET if set

    const event = await req.json();

    if (!["video.asset.ready", "video.asset.errored"].includes(event.type)) {
      return new Response("ignored", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const asset = event.data;
    const passthrough = JSON.parse(asset.passthrough ?? "{}");
    const { campaign_id, file_name } = passthrough;

    if (!campaign_id) {
      return new Response("no campaign_id in passthrough", { status: 200 });
    }

    if (event.type === "video.asset.ready") {
      const playbackId = asset.playback_ids?.[0]?.id;

      // Upsert media record
      await supabase.from("campaign_media").upsert(
        {
          campaign_id,
          media_type:       "video",
          mux_asset_id:     asset.id,
          mux_playback_id:  playbackId,
          mux_status:       "ready",
          public_url:       playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : null,
          thumbnail_url:    playbackId ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=2` : null,
          file_name:        file_name ?? "video",
          mime_type:        "video/mp4",
          upload_complete:  true,
        },
        { onConflict: "mux_asset_id" }
      );

      // Also push to campaigns.media_urls JSON array
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("media_urls")
        .eq("id", campaign_id)
        .single();

      if (campaign) {
        const existing: any[] = campaign.media_urls ?? [];
        const updated = [
          ...existing.filter((m: any) => m.mux_asset_id !== asset.id),
          {
            type:           "video",
            mux_asset_id:   asset.id,
            mux_playback_id: playbackId,
            url:            `https://stream.mux.com/${playbackId}.m3u8`,
            thumbnail_url:  `https://image.mux.com/${playbackId}/thumbnail.jpg?time=2`,
          },
        ];
        await supabase
          .from("campaigns")
          .update({ media_urls: updated })
          .eq("id", campaign_id);
      }
    } else {
      // video.asset.errored
      await supabase
        .from("campaign_media")
        .update({ mux_status: "errored" })
        .eq("mux_asset_id", asset.id);
    }

    return new Response("ok", { status: 200 });
  } catch (err: any) {
    console.error("mux-webhook error:", err);
    return new Response("error", { status: 500 });
  }
});
