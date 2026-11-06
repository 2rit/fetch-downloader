# FETCH — Universal Media Downloader

Production-oriented full-stack media downloader. Ready to run.

## Engines

- **yt-dlp** (2026.10.26) + **Deno** JS runtime — full YouTube formats, Twitter/X, Reddit, Vimeo, etc.
- **gallery-dl** (1.32.19) — Pinterest, Imgur, DeviantArt, and other galleries
- **Cobalt** — optional, requires your own self-hosted instance (`COBALT_API_URL`)

## Quick Start

```bash
# Install Deno first: curl -fsSL https://deno.land/install.sh | sh
export PATH="$HOME/.deno/bin:$PATH"

cd backend
pip install -r requirements.txt
python main.py
```

Open http://localhost:8000

## Docker

```bash
docker compose up --build
```

## Features

- Smart engine routing by domain
- Real thumbnail + format selection
- SSRF protection (private IPs blocked)
- Light / Dark theme
- Download history
- Responsive (mobile / tablet / desktop)

## Platform Support

| Platform | Engine | Status |
|----------|--------|--------|
| YouTube | yt-dlp + Deno | Full formats |
| Twitter/X, Reddit, Vimeo | yt-dlp | Public posts |
| Pinterest, Imgur | gallery-dl | Supported |
| TikTok / Instagram / Facebook | yt-dlp | Limited (often needs auth) |
| Cobalt platforms | Cobalt | Requires self-hosted instance |

## Limitations

- Cobalt requires your own instance
- Instagram/Facebook frequently require login
- Large files may hit timeout limits
- No pause/resume

## Security

- Blocks private/internal IPs
- No cookie stealing
- No DRM/paywall bypass

Source code is in this repository.
