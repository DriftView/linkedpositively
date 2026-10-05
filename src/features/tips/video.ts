/**
 * Video links on tips (legacy video_embed_field: YouTube and Vimeo). Returns
 * a privacy-friendly embed URL, or null for links we can't embed.
 */
export type VideoEmbed = { provider: "youtube" | "vimeo"; id: string; embedUrl: string; thumbnailUrl: string | null };

export function videoEmbed(url: string | null | undefined): VideoEmbed | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\.|^m\./, "");

  let youtubeId: string | null = null;
  if (host === "youtu.be") youtubeId = parsed.pathname.slice(1).split("/")[0] || null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") youtubeId = parsed.searchParams.get("v");
    else {
      const match = parsed.pathname.match(/^\/(?:embed|shorts|v|live)\/([^/?#]+)/);
      youtubeId = match?.[1] ?? null;
    }
  }
  if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) {
    return {
      provider: "youtube",
      id: youtubeId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`,
      thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const match = parsed.pathname.match(/(?:\/video)?\/(\d{5,12})/);
    if (match) {
      return { provider: "vimeo", id: match[1], embedUrl: `https://player.vimeo.com/video/${match[1]}?dnt=1`, thumbnailUrl: null };
    }
  }
  return null;
}
