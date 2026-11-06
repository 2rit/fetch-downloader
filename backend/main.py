"""
FETCH Backend — Universal Media Downloader
FastAPI + yt-dlp (with Deno) + gallery-dl (+ optional Cobalt)
"""
import os
import re
import json
import uuid
import asyncio
import ipaddress
import urllib.parse
import subprocess
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

import httpx
import yt_dlp
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", "./downloads"))
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", "500")) * 1024 * 1024
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "45"))
COBALT_API_URL = os.getenv("COBALT_API_URL", "").rstrip("/")
COBALT_API_KEY = os.getenv("COBALT_API_KEY", "")

DENO_PATH = Path.home() / ".deno" / "bin"
if DENO_PATH.exists():
    os.environ["PATH"] = f"{DENO_PATH}:{os.environ.get('PATH', '')}"

app = FastAPI(title="FETCH", description="Universal Media Downloader", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = None
    engine: Optional[str] = None
    filename: Optional[str] = None

PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

def is_private_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return any(ip in net for net in PRIVATE_NETS)
    except ValueError:
        return False

async def resolve_and_check(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(400, "Invalid URL")
    if hostname.lower() in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        raise HTTPException(403, "Private addresses are not allowed")
    try:
        import socket
        infos = socket.getaddrinfo(hostname, None)
        for info in infos:
            ip = info[4][0]
            if is_private_ip(ip):
                raise HTTPException(403, f"Private IP resolved: {ip}")
    except socket.gaierror:
        raise HTTPException(400, "Cannot resolve hostname")
    return url

YTDLP_DOMAINS = {
    "youtube.com", "youtu.be", "youtube-nocookie.com",
    "twitter.com", "x.com", "t.co",
    "tiktok.com", "vm.tiktok.com",
    "instagram.com", "facebook.com", "fb.watch",
    "reddit.com", "v.redd.it",
    "twitch.tv", "vimeo.com", "dailymotion.com",
    "soundcloud.com", "bilibili.com",
}

GALLERYDL_DOMAINS = {
    "pinterest.com", "imgur.com", "deviantart.com",
    "pixiv.net", "tumblr.com", "flickr.com",
    "artstation.com", "behance.net",
}

def detect_engine(url: str) -> str:
    domain = urllib.parse.urlparse(url).netloc.lower().replace("www.", "")
    for d in GALLERYDL_DOMAINS:
        if d in domain:
            return "gallery-dl"
    for d in YTDLP_DOMAINS:
        if d in domain:
            return "yt-dlp"
    if COBALT_API_URL:
        return "cobalt"
    return "yt-dlp"

def get_ytdlp_opts(extra=None):
    opts = {
        "quiet": True,
        "no_warnings": False,
        "socket_timeout": REQUEST_TIMEOUT,
        "js_runtimes": {"deno": {}},
        "remote_components": ["ejs:github"],
    }
    if extra:
        opts.update(extra)
    return opts

def extract_ytdlp(url: str):
    ydl_opts = get_ytdlp_opts({"skip_download": True, "extract_flat": False})
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise ValueError("No info extracted")
            formats = []
            seen = set()
            for f in info.get("formats", []):
                fid = f.get("format_id")
                if not fid or fid in seen:
                    continue
                seen.add(fid)
                res = f.get("resolution") or f.get("format_note") or ""
                if "storyboard" in res.lower() or (f.get("vcodec") == "none" and f.get("acodec") == "none"):
                    continue
                formats.append({
                    "format_id": fid,
                    "ext": f.get("ext"),
                    "resolution": res,
                    "filesize": f.get("filesize") or f.get("filesize_approx"),
                    "vcodec": f.get("vcodec"),
                    "acodec": f.get("acodec"),
                    "tbr": f.get("tbr"),
                    "fps": f.get("fps"),
                })
            formats = sorted(formats, key=lambda x: (x.get("filesize") or 0), reverse=True)[:40]
            return {
                "engine": "yt-dlp",
                "title": info.get("title"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
                "uploader": info.get("uploader"),
                "formats": formats,
                "id": info.get("id"),
                "webpage_url": info.get("webpage_url", url),
            }
    except Exception as e:
        raise HTTPException(400, f"yt-dlp error: {str(e)[:300]}")

def extract_gallerydl(url: str):
    try:
        result = subprocess.run(
            ["gallery-dl", "--dump-json", url],
            capture_output=True, text=True, timeout=REQUEST_TIMEOUT
        )
        if result.returncode != 0:
            raise ValueError(result.stderr[:300] or "gallery-dl failed")
        items = []
        for line in result.stdout.strip().splitlines():
            if line:
                try:
                    items.append(json.loads(line))
                except Exception:
                    pass
        if not items:
            raise ValueError("No media found")
        first = items[0]
        thumb = None
        for it in items[:5]:
            if it.get("url") and str(it.get("extension", "")).lower() in ("jpg", "jpeg", "png", "webp"):
                thumb = it.get("url")
                break
        return {
            "engine": "gallery-dl",
            "title": first.get("title") or first.get("filename") or "Gallery",
            "thumbnail": thumb,
            "count": len(items),
            "items": items[:15],
            "webpage_url": url,
            "formats": [{"format_id": "best", "ext": "original", "resolution": "original"}],
        }
    except Exception as e:
        raise HTTPException(400, f"gallery-dl error: {str(e)[:300]}")

@app.get("/api/health")
async def health():
    deno_ok = shutil.which("deno") is not None
    return {
        "status": "ok",
        "engines": {
            "yt-dlp": True,
            "gallery-dl": True,
            "cobalt": bool(COBALT_API_URL),
            "deno": deno_ok,
        },
        "cobalt_url": COBALT_API_URL or None,
        "version": "1.1.0",
    }

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    url = await resolve_and_check(req.url)
    engine = detect_engine(url)
    if engine == "gallery-dl":
        data = extract_gallerydl(url)
    else:
        data = extract_ytdlp(url)
    data["detected_engine"] = engine
    return data

@app.post("/api/download")
async def download(req: DownloadRequest):
    url = await resolve_and_check(req.url)
    engine = req.engine or detect_engine(url)
    job_id = str(uuid.uuid4())[:8]
    out_path = DOWNLOAD_DIR / job_id
    out_path.mkdir(parents=True, exist_ok=True)

    if engine == "gallery-dl":
        cmd = ["gallery-dl", "-d", str(out_path), url]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if proc.returncode != 0:
            raise HTTPException(500, f"Download failed: {proc.stderr[:300]}")
        files = [f for f in out_path.rglob("*") if f.is_file()]
        if not files:
            raise HTTPException(500, "No files downloaded")
        target = files[0]
        return FileResponse(
            path=target,
            filename=target.name,
            media_type="application/octet-stream",
        )
    else:
        ydl_opts = get_ytdlp_opts({
            "outtmpl": str(out_path / "%(title).100s.%(ext)s"),
            "format": req.format_id or "bestvideo+bestaudio/best",
            "merge_output_format": "mp4",
        })
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                file_path = Path(filename)
                if not file_path.exists():
                    candidates = list(out_path.glob("*"))
                    if not candidates:
                        raise HTTPException(500, "Download produced no file")
                    file_path = candidates[0]
                return FileResponse(
                    path=file_path,
                    filename=file_path.name,
                    media_type="application/octet-stream",
                )
        except Exception as e:
            raise HTTPException(500, f"Download error: {str(e)[:300]}")

@app.get("/api/downloads")
async def list_downloads():
    files = []
    for p in DOWNLOAD_DIR.rglob("*"):
        if p.is_file() and p.stat().st_size > 0:
            files.append({
                "name": p.name,
                "size": p.stat().st_size,
                "path": str(p.relative_to(DOWNLOAD_DIR)),
                "mtime": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
            })
    files.sort(key=lambda x: x["mtime"], reverse=True)
    return {"files": files[:50]}

@app.delete("/api/downloads/{path:path}")
async def delete_download(path: str):
    target = DOWNLOAD_DIR / path
    if target.exists() and target.is_file() and DOWNLOAD_DIR in target.resolve().parents:
        target.unlink()
        return {"ok": True}
    raise HTTPException(404, "File not found")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
