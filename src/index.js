const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Disposition"
};

const MAX_DOWNLOAD_BYTES = 650 * 1024 * 1024;

const ENGINES = [
  { name: "engine-1", host: "prexzyapis.com/download/instagram", status: "active" },
  { name: "engine-2", host: "cobaltapi.cjs.nz", status: "active" },
  { name: "engine-3", host: "prexzyapis.com/download/aio", status: "active" },
  { name: "fallback", host: "p.savenow.to", status: "standby" }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function sanitizeFilename(name) {
  if (!name || typeof name !== "string") return "instagram_media";
  return name.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim().slice(0, 100);
}

function formatBytesNumber(bytes) {
  if (!bytes || bytes <= 0) return null;
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${units[i]}`;
}

function cleanMediaUrl(u) {
  if (!u || typeof u !== "string") return null;
  return u
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractUrl(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return `https://www.instagram.com/reel/${trimmed}/`;
  }
  const match = trimmed.match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?instagram\.com\/[^\s]+/i);
  return match ? match[0] : null;
}

function extractShortcode(targetUrl) {
  if (!targetUrl || typeof targetUrl !== "string") return "instagram_media";
  const match = targetUrl.match(/\/(?:p|reel|tv|stories\/[^/]+)\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : "instagram_media";
}

async function probeContentLength(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.instagram.com/"
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    const cl = res.headers.get("content-length");
    if (cl && Number(cl) > 0) return Number(cl);
  } catch {}
  return null;
}

async function fetchPrexzyInstagram(targetUrl) {
  try {
    const endpoint = `https://prexzyapis.com/download/instagram?url=${encodeURIComponent(targetUrl)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || !d.status) return null;

    const medias = Array.isArray(d.media) ? d.media : [];
    const videoItem = medias.find(m => m.type === "video");
    const imageItems = medias.filter(m => m.type === "image");

    return {
      status: "active",
      host: "prexzyapis.com/download/instagram",
      type: d.type || (videoItem ? "video" : (imageItems.length ? "image" : "unknown")),
      video_url: cleanMediaUrl(videoItem?.url),
      images: imageItems.map(i => cleanMediaUrl(i.url)).filter(Boolean),
      likes: typeof d.likes === "number" ? d.likes : null,
      comments: typeof d.comments === "number" ? d.comments : null,
      width: videoItem?.width || null,
      height: videoItem?.height || null
    };
  } catch {
    return null;
  }
}

async function fetchCobaltInstagram(targetUrl) {
  const instances = [
    "https://cobaltapi.cjs.nz/",
    "https://cobalt.kwiatekm.tokyo/"
  ];

  for (const inst of instances) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(inst, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0"
        },
        body: JSON.stringify({ url: targetUrl }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const d = await res.json();
      const directUrl = cleanMediaUrl(d.url);
      if (directUrl) {
        return {
          status: "active",
          host: new URL(inst).hostname,
          url: directUrl,
          filename: d.filename || null
        };
      }
    } catch {}
  }
  return null;
}

async function fetchPrexzyAio(targetUrl) {
  try {
    const endpoint = `https://prexzyapis.com/download/aio?url=${encodeURIComponent(targetUrl)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || !d.data) return null;

    const data = d.data;
    const medias = Array.isArray(data.medias) ? data.medias : [];
    const videoItem = medias.find(m => m.type === "video");
    const audioItem = medias.find(m => m.type === "audio");
    const imageItems = medias.filter(m => m.type === "image");

    return {
      status: "active",
      host: "prexzyapis.com/download/aio",
      title: data.title || "",
      duration: data.duration ? Math.round(data.duration / 1000) : 0,
      video_url: cleanMediaUrl(videoItem?.url),
      thumbnail: cleanMediaUrl(videoItem?.thumbnail || data.thumbnail),
      audio_url: cleanMediaUrl(audioItem?.url),
      audio_quality: audioItem?.quality || "74kbps",
      images: imageItems.map(i => cleanMediaUrl(i.url)).filter(Boolean)
    };
  } catch {
    return null;
  }
}

async function scrapeInstagram(canonicalUrl, origin) {
  const [e1Res, e2Res, e3Res] = await Promise.allSettled([
    fetchPrexzyInstagram(canonicalUrl),
    fetchCobaltInstagram(canonicalUrl),
    fetchPrexzyAio(canonicalUrl)
  ]);

  const e1 = e1Res.status === "fulfilled" ? e1Res.value : null;
  const e2 = e2Res.status === "fulfilled" ? e2Res.value : null;
  const e3 = e3Res.status === "fulfilled" ? e3Res.value : null;

  if (!e1 && !e2 && !e3) {
    throw new Error("Unable to retrieve Instagram media from available engines");
  }

  const shortcode = extractShortcode(canonicalUrl);
  const primaryVideoUrl = e1?.video_url || e2?.url || e3?.video_url || null;
  const primaryAudioUrl = e3?.audio_url || null;
  const thumbnail = e3?.thumbnail || null;

  const images = [
    ...(e1?.images || []),
    ...(e3?.images || [])
  ].filter((v, i, a) => a.indexOf(v) === i);

  const isVideo = Boolean(primaryVideoUrl);
  const postType = isVideo ? "video" : (images.length ? "image" : "unknown");

  const [videoBytes, audioBytes] = await Promise.all([
    probeContentLength(primaryVideoUrl),
    probeContentLength(primaryAudioUrl)
  ]);

  const videoDownloadUrl = primaryVideoUrl
    ? `${origin}/api/download?url=${encodeURIComponent(primaryVideoUrl)}&filename=${encodeURIComponent(`instagram_${shortcode}.mp4`)}`
    : null;

  const videoStreamUrl = primaryVideoUrl
    ? `${origin}/api/stream?url=${encodeURIComponent(primaryVideoUrl)}`
    : null;

  const audioDownloadUrl = primaryAudioUrl
    ? `${origin}/api/download?url=${encodeURIComponent(primaryAudioUrl)}&filename=${encodeURIComponent(`instagram_audio_${shortcode}.mp3`)}`
    : null;

  const audioStreamUrl = primaryAudioUrl
    ? `${origin}/api/stream?url=${encodeURIComponent(primaryAudioUrl)}`
    : null;

  return {
    engine: e1 ? "engine-1 (prexzy-instagram)" : (e2 ? "engine-2 (cobalt-edge)" : "engine-3 (prexzy-aio)"),
    id: shortcode,
    type: postType,
    title: e3?.title || `Instagram ${postType}`,
    duration: e3?.duration || 0,
    thumbnail,
    stats: {
      likes: e1?.likes || 0,
      comments: e1?.comments || 0
    },
    max_download_size: MAX_DOWNLOAD_BYTES,
    max_download_size_formatted: "650 MB",
    engines: {
      active: e1 ? "engine-1" : (e2 ? "engine-2" : "engine-3"),
      engine_1: "prexzyapis.com/download/instagram",
      engine_2: "cobaltapi.cjs.nz",
      engine_3: "prexzyapis.com/download/aio",
      fallback: "p.savenow.to"
    },
    sources: {
      prexzy_instagram: e1 ? {
        status: "active",
        host: "prexzyapis.com/download/instagram",
        type: e1.type,
        video_url: e1.video_url,
        images_count: e1.images?.length || 0,
        likes: e1.likes,
        comments: e1.comments
      } : { status: "offline", host: "prexzyapis.com/download/instagram" },
      cobalt_edge: e2 ? {
        status: "active",
        host: e2.host,
        url: e2.url,
        filename: e2.filename
      } : { status: "offline", host: "cobaltapi.cjs.nz" },
      prexzy_aio: e3 ? {
        status: "active",
        host: "prexzyapis.com/download/aio",
        title: e3.title,
        duration: e3.duration,
        video_url: e3.video_url,
        audio_url: e3.audio_url,
        images_count: e3.images?.length || 0
      } : { status: "offline", host: "prexzyapis.com/download/aio" }
    },
    media: {
      video: isVideo ? {
        quality: "HD",
        size: videoBytes,
        size_formatted: formatBytesNumber(videoBytes),
        download_allowed: videoBytes ? videoBytes <= MAX_DOWNLOAD_BYTES : true,
        url: primaryVideoUrl,
        download_url: videoDownloadUrl,
        stream_url: videoStreamUrl
      } : null,
      audio: primaryAudioUrl ? {
        format: "m4a",
        quality: e3?.audio_quality || "74kbps",
        size: audioBytes,
        size_formatted: formatBytesNumber(audioBytes),
        download_allowed: audioBytes ? audioBytes <= MAX_DOWNLOAD_BYTES : true,
        url: primaryAudioUrl,
        download_url: audioDownloadUrl,
        stream_url: audioStreamUrl
      } : null,
      images: images.map(imgUrl => ({
        url: imgUrl,
        download_url: `${origin}/api/download?url=${encodeURIComponent(imgUrl)}&filename=${encodeURIComponent(`instagram_${shortcode}.jpg`)}`
      }))
    }
  };
}

async function pipeStream(targetUrl, request, filename, asAttachment) {
  const upstreamHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://www.instagram.com/"
  };

  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders["Range"] = range;
  }

  const upstream = await fetch(targetUrl, {
    method: "GET",
    headers: upstreamHeaders
  });

  const contentLength = upstream.headers.get("content-length");
  if (asAttachment && contentLength && Number(contentLength) > MAX_DOWNLOAD_BYTES) {
    return json({
      status: "error",
      code: 413,
      message: "File size exceeds the 650 MB download limit",
      file_size: Number(contentLength),
      file_size_formatted: formatBytesNumber(Number(contentLength)),
      max_download_size: MAX_DOWNLOAD_BYTES,
      max_download_size_formatted: "650 MB"
    }, 413);
  }

  const responseHeaders = new Headers(CORS_HEADERS);
  const isAudioFile = filename.endsWith(".mp3") || filename.endsWith(".m4a");
  const isImageFile = filename.endsWith(".jpg") || filename.endsWith(".jpeg") || filename.endsWith(".png") || filename.endsWith(".webp");
  const fallbackType = isAudioFile ? (filename.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4") : (isImageFile ? "image/jpeg" : "video/mp4");

  const contentType = upstream.headers.get("content-type") || fallbackType;
  responseHeaders.set("Content-Type", contentType);

  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  const contentRange = upstream.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) responseHeaders.set("Accept-Ranges", acceptRanges);

  responseHeaders.set(
    "Content-Disposition",
    asAttachment ? `attachment; filename="${filename}"` : "inline"
  );
  responseHeaders.set("Cache-Control", "public, max-age=86400");

  let body = upstream.body;
  if (asAttachment) {
    let bytesTransferred = 0;
    const limiter = new TransformStream({
      transform(chunk, controller) {
        bytesTransferred += chunk.length;
        if (bytesTransferred > MAX_DOWNLOAD_BYTES) {
          controller.error(new Error("File size exceeds 650 MB limit"));
        } else {
          controller.enqueue(chunk);
        }
      }
    });
    body = body.pipeThrough(limiter);
  }

  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

function isDirectMediaUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (/\.(mp4|m4a|mp3|jpg|jpeg|png|webp|webm)(\?|$)/i.test(urlStr) || /\.(mp4|m4a|mp3|jpg|jpeg|png|webp|webm)$/i.test(pathname)) {
      return true;
    }
    if (host.includes("cdninstagram.com") || host.includes("fbcdn.net") || host.includes("akamaihd.net")) {
      return true;
    }
    if (parsed.searchParams.has("bytestart") || parsed.searchParams.has("efg") || parsed.searchParams.has("_nc_ht") || parsed.searchParams.has("_nc_cat") || parsed.searchParams.has("oh")) {
      return true;
    }
    if (/^\/(?:p|reel|reels|tv|stories|share)\//i.test(pathname)) {
      return false;
    }
    return host !== "instagram.com" && host !== "www.instagram.com";
  } catch {
    return false;
  }
}

async function handleProxy(request, asAttachment) {
  const reqUrl = new URL(request.url);
  const rawUrl = reqUrl.searchParams.get("url");
  const rawId = reqUrl.searchParams.get("id");
  const customFilename = reqUrl.searchParams.get("filename") || reqUrl.searchParams.get("amp;filename");

  const targetUrl = cleanMediaUrl(rawUrl) || (rawId ? `https://www.instagram.com/reel/${rawId}/` : null);
  if (!targetUrl) {
    return json({ status: "error", message: "Missing 'url' or 'id' query parameter" }, 400);
  }

  try {
    const isDirect = isDirectMediaUrl(targetUrl);

    if (isDirect) {
      const parsed = new URL(targetUrl);
      const isAudio = parsed.pathname.endsWith(".m4a") || parsed.pathname.endsWith(".mp3") || (customFilename && (customFilename.endsWith(".m4a") || customFilename.endsWith(".mp3")));
      const isImg = parsed.pathname.endsWith(".jpg") || parsed.pathname.endsWith(".jpeg") || parsed.pathname.endsWith(".png") || parsed.pathname.endsWith(".webp");
      const defaultName = isAudio ? "instagram_audio.m4a" : (isImg ? "instagram_image.jpg" : "instagram_video.mp4");
      const filename = sanitizeFilename(customFilename || defaultName);
      return await pipeStream(targetUrl, request, filename, asAttachment);
    }

    const data = await scrapeInstagram(targetUrl, reqUrl.origin);
    const streamUrl = data.media?.video?.url || data.media?.images?.[0]?.url || data.media?.audio?.url;

    if (!streamUrl) {
      return json({ status: "error", message: "Could not resolve stream URL for requested post" }, 404);
    }

    const filename = sanitizeFilename(customFilename || `instagram_${data.id || "media"}.mp4`);
    return await pipeStream(streamUrl, request, filename, asAttachment);
  } catch (err) {
    return json({ status: "error", message: `Proxy error: ${err.message}` }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    const url = new URL(request.url);
    const origin = url.origin;
    const path = url.pathname;

    if (path === "/" || path === "/api") {
      return json({
        status: "online",
        service: "Instagram Video, Reels & Photos Scraper API",
        version: "1.0.0",
        limits: {
          max_download_size: MAX_DOWNLOAD_BYTES,
          max_download_size_formatted: "650 MB"
        },
        engines: ENGINES,
        endpoints: {
          scrape: {
            method: ["GET", "POST"],
            path: "/api/scrape",
            params: {
              url: "Instagram reel / post / stories URL or shortcode"
            },
            example: `${origin}/api/scrape?url=https://www.instagram.com/reel/Dbn-XJhk0_-/`
          },
          download: {
            method: "GET",
            path: "/api/download",
            params: {
              url: "Direct stream URL or Instagram post URL",
              filename: "Optional custom output filename"
            },
            notes: "Files larger than 650 MB cannot be downloaded via proxy",
            example: `${origin}/api/download?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FDbn-XJhk0_-%2F`
          },
          stream: {
            method: "GET",
            path: "/api/stream",
            params: {
              url: "Direct stream URL"
            },
            example: `${origin}/api/stream?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FDbn-XJhk0_-%2F`
          },
          health: {
            method: "GET",
            path: "/health"
          }
        }
      });
    }

    if (path === "/health") {
      return json({ status: "ok", timestamp: new Date().toISOString() });
    }

    if (path === "/api/download" || path === "/download") {
      return handleProxy(request, true);
    }

    if (path === "/api/stream" || path === "/stream") {
      return handleProxy(request, false);
    }

    if (["/api/scrape", "/scrape", "/api/video", "/api/info"].includes(path)) {
      let rawInput = null;

      if (request.method === "GET") {
        rawInput = url.searchParams.get("url") || url.searchParams.get("id");
      } else if (request.method === "POST") {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            const body = await request.json();
            rawInput = body.url || body.id || body.link;
          } catch {
            return json({ status: "error", message: "Invalid JSON body" }, 400);
          }
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          const form = await request.formData();
          rawInput = form.get("url") || form.get("id") || form.get("link");
        }
      } else {
        return json({ status: "error", message: "Method not allowed" }, 405);
      }

      const extracted = extractUrl(rawInput);
      if (!extracted) {
        return json({
          status: "error",
          message: "A valid Instagram URL, reel link, or post shortcode is required"
        }, 400);
      }

      try {
        const data = await scrapeInstagram(extracted, origin);
        return json({
          status: "success",
          code: 200,
          data
        });
      } catch (err) {
        return json({
          status: "error",
          code: 500,
          message: err.message
        }, 500);
      }
    }

    return json({ status: "error", message: "Not found" }, 404);
  }
};
