/** YouTube link helpers (client-safe). Wall videos are YouTube only (docs/legacy/03 §5.4.2). */

/** Parses YouTube links (watch, youtu.be, embed, shorts, live, nocookie) → id and start second. */
export function parseYouTube(input: string): { id: string; start?: number } | null {
  const value = input.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = match?.[2] ?? null;
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const t = url.searchParams.get("t") ?? url.searchParams.get("start");
  const start = t ? parseStart(t) : undefined;
  return start ? { id, start } : { id };
}

function parseStart(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) return undefined;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds || undefined;
}


/** Privacy-enhanced embed URL (the old site used youtube-nocookie too). */
export function youTubeEmbedUrl(video: { id: string; start?: number }) {
  const params = new URLSearchParams({ autoplay: "1", rel: "0", modestbranding: "1" });
  if (video.start) params.set("start", String(video.start));
  return `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
}

export const youTubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youTubeWatchUrl = (video: { id: string; start?: number }) =>
  `https://www.youtube.com/watch?v=${video.id}${video.start ? `&t=${video.start}s` : ""}`;
