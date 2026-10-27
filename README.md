<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/your-username/instagram-scraper-api">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" />
  </a>
</p>

<h1 align="center">📸 Instagram Reels, Video & Photos Scraper API</h1>

<p align="center">
  <strong>High-performance, serverless Instagram Reels, Video, Photo, and Stories scraper and downloader API designed for Cloudflare Workers.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Runtime-V8_Worker_Isolate-3178C6?style=for-the-badge&logo=javascript&logoColor=white" alt="V8 Engine" />
  <img src="https://img.shields.io/badge/Max_Download-650_MB_Cap-E50914?style=for-the-badge" alt="650 MB Limit" />
  <img src="https://img.shields.io/badge/CORS-Universal_(*)-success?style=for-the-badge" alt="CORS" />
  <img src="https://img.shields.io/badge/Dependencies-Zero_npm-black?style=for-the-badge" alt="Zero Dependencies" />
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture & 3-Engine Waterfall](#-architecture--3-engine-waterfall)
- [Supported Instagram Link Formats](#-supported-instagram-link-formats)
- [650 MB Download Limit & Rate Protection](#-650-mb-download-limit--rate-protection)
- [Raw File Size Reporting](#-raw-file-size-reporting)
- [API Endpoints Reference](#-api-endpoints-reference)
  - [1. Service Health & Status](#1-service-health--status)
  - [2. Scrape Instagram Reels, Videos & Photos](#2-scrape-instagram-reels-videos--photos)
  - [3. Direct Download with Custom Filename](#3-direct-download-with-custom-filename)
  - [4. Dynamic Media Stream Proxy (Range Seeking)](#4-dynamic-media-stream-proxy-range-seeking)
- [JSON Response Schema](#-json-response-schema)
- [Deployment Guide](#-deployment-guide)
  - [Option 1: One-Click Deploy Button](#option-1-one-click-deploy-button)
  - [Option 2: Cloudflare Dashboard (Web UI)](#option-2-cloudflare-dashboard-web-ui)
  - [Option 3: Wrangler CLI](#option-3-wrangler-cli)
- [Client Integration Examples](#-client-integration-examples)
  - [cURL](#curl)
  - [JavaScript / TypeScript (Browser & Node.js)](#javascript--typescript)
  - [Python](#python)
- [Configuration (`wrangler.toml`)](#-configuration-wranglertoml)
- [License & Disclaimer](#-license--disclaimer)

---

## 🌟 Overview

The **Instagram Reels, Video & Photos Scraper API** is an edge-native REST API built for Cloudflare Workers. It extracts high-definition (HD 1080p/720p) MP4 video streams, high-resolution photos, separate background audio tracks, exact file sizes in raw bytes and formatted strings, and engagement statistics (likes, comments) from public Instagram Reels, posts, and carousels.

---

## ✨ Key Features

- **3 Independent Third-Party Scraping Engines:** Parallel multi-engine architecture querying Prexzy Instagram, Cobalt Edge, and Prexzy AIO with automatic failover.
- **HD Video & Audio Stream Extraction:** Extracts high-definition progressive video streams directly from Instagram CDN (`*.cdninstagram.com` / `*.fbcdn.net`) along with separate M4A audio tracks.
- **Photo Posts & Carousels Support:** Fully supports single images and multi-photo carousel posts, returning high-resolution image arrays with direct download links.
- **Raw File Size Data:** Returns both raw integer bytes (`size`) and human-readable formatted sizes (`size_formatted`) for every available media stream.
- **650 MB Download Protection:** Enforces a strict `650 MB` limit on proxy downloads to prevent Worker memory exhaustion and timeouts.
- **Bypasses Instagram Hotlink Restrictions:** Built-in `/api/download` proxy injects official `Referer: https://www.instagram.com/` and mobile `User-Agent` headers to guarantee non-expiring downloads.
- **Direct Edge Streaming (`/api/stream`):** Implements `Accept-Ranges: bytes` and `206 Partial Content` for HTML5 video player embedding and seeking.
- **Universal CORS:** Standard CORS headers enabled on all responses for seamless client-side frontend and bot integration.
- **Zero Runtime Dependencies:** Requires zero external npm packages and runs purely within the standard V8 Worker isolate.

---

## 🏗 Architecture & 3-Engine Waterfall

```text
                                Client Request
                                      │
         ┌────────────────────────────┴────────────────────────────┐
         │                                                         │
    /api/scrape                                           /api/download / /api/stream
  (Extract Metadata)                                    (Dynamic Streaming & Proxy)
         │                                                         │
         ▼                                                         ▼
  Shortcode Extractor:                                    Content-Length Inspection:
  Parses /reel/, /p/, /tv/                                ├── If Size > 650 MB -> HTTP 413
         │                                                └── If Size <= 650 MB -> Stream directly
         ▼                                                         │
  Multi-Engine Parallel Query:                                     ▼
  ├── Engine 1: prexzyapis.com/download/instagram         - Bypasses CDN 403 Forbidden
  ├── Engine 2: cobaltapi.cjs.nz                          - Content-Disposition: attachment
  ├── Engine 3: prexzyapis.com/download/aio               - Supports 206 Partial Content (Seeking)
  └── Standby: p.savenow.to
```

| Engine | Source / Host | Purpose | Status |
|:---|:---|:---|:---|
| **Engine 1** | `prexzyapis.com/download/instagram` | Dedicated Instagram Reel & Post extractor with likes, comments, and HD stream | Primary |
| **Engine 2** | `cobaltapi.cjs.nz` | Unrestricted mirror engine returning direct `cdninstagram.com` MP4 stream | Primary |
| **Engine 3** | `prexzyapis.com/download/aio` | Multi-quality stream engine returning video, thumbnail frame, and separate audio | Primary |
| **Fallback** | `p.savenow.to` | Progressive conversion failover engine | Standby |

---

## 🔗 Supported Instagram Link Formats

- **Instagram Reels:** `https://www.instagram.com/reel/Dbn-XJhk0_-/`
- **Instagram Posts:** `https://www.instagram.com/p/Dbn-XJhk0_-/`
- **Instagram TV (IGTV):** `https://www.instagram.com/tv/Dbn-XJhk0_-/`
- **Shortcodes:** `Dbn-XJhk0_-`

---

## 🛡 650 MB Download Limit & Rate Protection

To guarantee stable streaming, protect Worker memory, and adhere to Cloudflare Worker limits, the API enforces a strict **650 MB (`681,574,400` bytes)** maximum download cap:

1. **Header-Level Rejection:** If upstream `Content-Length` exceeds `681,574,400` bytes, the Worker immediately terminates the connection and returns **HTTP 413 (Payload Too Large)** without consuming Worker bandwidth.
2. **Chunk-Level Stream Guard:** For streams without a `Content-Length` header or chunked transfers, an internal `TransformStream` counts bytes transmitted in real-time. If the stream reaches 650 MB, it safely cuts the connection.
3. **Scrape Response Flagging:** Every media item in `/api/scrape` includes `download_allowed: true/false`, indicating whether the format fits within the 650 MB limit.

### HTTP 413 Error Response Example:
```json
{
  "status": "error",
  "code": 413,
  "message": "File size exceeds the 650 MB download limit",
  "file_size": 734003200,
  "file_size_formatted": "700 MB",
  "max_download_size": 681574400,
  "max_download_size_formatted": "650 MB"
}
```

---

## 📊 Raw File Size Reporting

Every media format exposes its exact byte count alongside its human-readable representation:

- `size`: Unsigned integer representing exact bytes (e.g. `5691930`)
- `size_formatted`: Formatted string (e.g. `"5.43 MB"`, `"295.57 KB"`)
- `download_allowed`: Boolean indicating whether file size is `<= 650 MB`

---

## 📡 API Endpoints Reference

Base URL: `https://<your-worker-name>.<your-subdomain>.workers.dev`

---

### 1. Service Health & Status

Returns server status, engine statuses, and download limit configurations.

- **Method:** `GET`
- **Path:** `/` or `/api` or `/health`

```bash
curl "https://your-worker.workers.dev/health"
```

```json
{
  "status": "ok",
  "timestamp": "2026-10-26T12:00:00.000Z"
}
```

---

### 2. Scrape Instagram Reels, Videos & Photos

Extracts video/image URLs, audio track, author metrics, and file size details.

- **Method:** `GET` or `POST`
- **Path:** `/api/scrape` *(Aliases: `/scrape`, `/api/video`, `/api/info`)*

#### Query Parameters:

| Parameter | Type | Required | Description |
|:---|:---|:---|:---|
| `url` / `id` | string | Yes | Instagram reel URL, post URL, or shortcode |

#### Example Request:

```bash
curl "https://your-worker.workers.dev/api/scrape?url=https://www.instagram.com/reel/Dbn-XJhk0_-/"
```

#### JSON Response Schema:

```json
{
  "status": "success",
  "code": 200,
  "data": {
    "engine": "engine-1 (prexzy-instagram)",
    "id": "Dbn-XJhk0_-",
    "type": "video",
    "title": "Instagram video",
    "duration": 32,
    "thumbnail": "https://instagram.fdad3-8.fna.fbcdn.net/v/t51.82787-15/...",
    "stats": {
      "likes": 264522,
      "comments": 2706
    },
    "max_download_size": 681574400,
    "max_download_size_formatted": "650 MB",
    "engines": {
      "active": "engine-1",
      "engine_1": "prexzyapis.com/download/instagram",
      "engine_2": "cobaltapi.cjs.nz",
      "engine_3": "prexzyapis.com/download/aio",
      "fallback": "p.savenow.to"
    },
    "sources": {
      "prexzy_instagram": {
        "status": "active",
        "host": "prexzyapis.com/download/instagram",
        "type": "reel",
        "video_url": "https://instagram.fcai19-12.fna.fbcdn.net/...",
        "images_count": 0,
        "likes": 264522,
        "comments": 2706
      },
      "cobalt_edge": {
        "status": "active",
        "host": "cobaltapi.cjs.nz",
        "url": "https://scontent-syd2-1.cdninstagram.com/...",
        "filename": "instagram_Dbn-XJhk0_-.mp4"
      },
      "prexzy_aio": {
        "status": "active",
        "host": "prexzyapis.com/download/aio",
        "title": "",
        "duration": 32,
        "video_url": "https://instagram.fhan5-9.fna.fbcdn.net/...",
        "audio_url": "https://instagram.fhan5-6.fna.fbcdn.net/...",
        "images_count": 0
      }
    },
    "media": {
      "video": {
        "quality": "HD",
        "size": 5691930,
        "size_formatted": "5.43 MB",
        "download_allowed": true,
        "url": "https://instagram.fcai19-12.fna.fbcdn.net/...",
        "download_url": "https://your-worker.workers.dev/api/download?url=https%3A%2F%2Finstagram.fcai19-12.fna.fbcdn.net%2F...&filename=instagram_Dbn-XJhk0_-.mp4",
        "stream_url": "https://your-worker.workers.dev/api/stream?url=https%3A%2F%2Finstagram.fcai19-12.fna.fbcdn.net%2F..."
      },
      "audio": {
        "format": "m4a",
        "quality": "74kbps",
        "size": 302668,
        "size_formatted": "295.57 KB",
        "download_allowed": true,
        "url": "https://instagram.fhan5-6.fna.fbcdn.net/...",
        "download_url": "https://your-worker.workers.dev/api/download?url=https%3A%2F%2Finstagram.fhan5-6.fna.fbcdn.net%2F...&filename=instagram_audio_Dbn-XJhk0_-.mp3",
        "stream_url": "https://your-worker.workers.dev/api/stream?url=https%3A%2F%2Finstagram.fhan5-6.fna.fbcdn.net%2F..."
      },
      "images": []
    }
  }
}
```

---

### 3. Direct Download with Custom Filename

Triggers direct browser download (`Content-Disposition: attachment`). Resolves the stream dynamically and enforces the 650 MB limit.

- **Method:** `GET`
- **Path:** `/api/download` *(Alias: `/download`)*

#### Query Parameters:

| Parameter | Type | Required | Description |
|:---|:---|:---|:---|
| `url` | string | Yes | Direct media stream URL or Instagram post URL |
| `filename` | string | No | Custom file name (e.g. `MyReel.mp4` or `Audio.mp3`) |

#### Examples:

```bash
# Download Instagram Reel Video
curl -L -O "https://your-worker.workers.dev/api/download?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FDbn-XJhk0_-%2F"
```

---

### 4. Dynamic Media Stream Proxy (Range Seeking)

Streams video with `Content-Disposition: inline` and full `Accept-Ranges: bytes` support. Ideal for HTML5 `<video>` player embedding, mobile apps, and seeking.

- **Method:** `GET`
- **Path:** `/api/stream` *(Alias: `/stream`)*

```html
<!-- HTML5 Video Embedding with Seeking -->
<video controls width="100%" height="auto" src="https://your-worker.workers.dev/api/stream?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FDbn-XJhk0_-%2F"></video>
```

---

## 🚀 Deployment Guide

### Option 1: One-Click Deploy Button

Click the banner below to fork and deploy directly to your Cloudflare account in seconds:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-username/instagram-scraper-api)

---

### Option 2: Cloudflare Dashboard (Web UI)

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Compute (Workers) -> Workers & Pages**.
3. Click **Create Application** -> **Create Worker**.
4. Choose a name (e.g., `instagram-scraper-api`) and click **Deploy**.
5. Once created, click **Edit code** in the top-right corner.
6. Paste the entire contents of [`src/index.js`](./src/index.js) into the code editor.
7. Click **Deploy**. Your API is live worldwide instantly!

---

### Option 3: Wrangler CLI

Ensure you have [Node.js](https://nodejs.org/) installed, then run:

```bash
# Clone the repository
git clone https://github.com/your-username/instagram-scraper-api.git
cd instagram-scraper-api

# Install Wrangler globally or locally
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login

# Deploy directly to Cloudflare Workers
wrangler deploy
```

---

## 💻 Client Integration Examples

### cURL

```bash
# Scrape Instagram reel
curl -s "https://your-worker.workers.dev/api/scrape?url=https://www.instagram.com/reel/Dbn-XJhk0_-/" | jq .
```

### JavaScript / TypeScript

```javascript
async function getInstagramMedia(igUrl) {
  const endpoint = `https://your-worker.workers.dev/api/scrape?url=${encodeURIComponent(igUrl)}`;
  const res = await fetch(endpoint);
  const data = await res.json();
  
  if (data.status === "success") {
    console.log("Post ID:", data.data.id);
    console.log("HD Video Download:", data.data.media.video?.download_url);
    console.log("Audio Download:", data.data.media.audio?.download_url);
    console.log("File Size:", data.data.media.video?.size_formatted);
  }
}
```

### Python

```python
import requests

def scrape_instagram(url: str):
    api_url = "https://your-worker.workers.dev/api/scrape"
    response = requests.get(api_url, params={"url": url})
    data = response.json()
    
    if data.get("status") == "success":
        media = data["data"]["media"]
        print(f"ID: {data['data']['id']}")
        if media.get("video"):
            print(f"Video Download: {media['video']['download_url']}")
            print(f"Size: {media['video']['size_formatted']}")
        return data["data"]
    return None
```

---

## ⚙ Configuration (`wrangler.toml`)

Your `wrangler.toml` file should look like this:

```toml
name = "instagram-scraper-api"
main = "src/index.js"
compatibility_date = "2024-03-20"
```

---

## 📜 License & Disclaimer

This project is licensed under the MIT License.

*Disclaimer: This project is intended for educational, testing, and personal backup purposes. Please respect Instagram's Terms of Service and content creators' intellectual property rights.*
