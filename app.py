import asyncio
import json
import os
import re
import subprocess
import sys
import time
import uuid
import webbrowser
from pathlib import Path
from typing import Optional

import yt_dlp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from starlette.requests import Request
from starlette.websockets import WebSocketState

app = FastAPI(title="Oto Müzik")

BASE_DIR = Path(__file__).parent
DOWNLOAD_DIR = Path(r"C:\Users\BurakCnZ\Downloads\Oto Müzik")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

queue: list[dict] = []
completed: list[dict] = []
active_downloads: dict[str, dict] = {}
ws_connections: list[WebSocket] = []

STOP_FLAG = False
PAUSE_FLAG = False

SETTINGS = {
    "quality": "320",
    "concurrent": 2,
    "download_dir": str(DOWNLOAD_DIR),
    "cookies_from_browser": "",
}


class SettingsModel(BaseModel):
    quality: str = "320"
    concurrent: int = 2
    download_dir: Optional[str] = None
    cookies_from_browser: Optional[str] = ""


YOUTUBE_URL_RE = re.compile(
    r'(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([\w-]+)'
)

SELECTION_WAIT: dict[str, asyncio.Event] = {}
SELECTION_RESULT: dict[str, int] = {}


def extract_youtube_id(text: str):
    m = YOUTUBE_URL_RE.search(text)
    if m:
        return m.group(4)
    return None


def is_youtube_url(text: str):
    return bool(YOUTUBE_URL_RE.search(text))


def normalize_title(title: str) -> str:
    t = title.lower()
    for w in ["official", "music", "video", "audio", "lyric", "lyrics", "clip", "hd", "4k",
              "official music video", "official audio", "official lyric video",
              "vevo", "topic", "şarkı", "türkü", "canlı", "live", "akustik", "acoustic"]:
        t = t.replace(w, "")
    t = re.sub(r'[\[\]\(\)\{\}!@#$%^&*+=|\\:;"\'<>,?/~`]', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def is_undecided(results: list[dict]) -> bool:
    if len(results) < 2:
        return False
    a, b = results[0], results[1]
    na, nb = normalize_title(a["title"]), normalize_title(b["title"])
    words_a = set(na.split())
    words_b = set(nb.split())
    if not words_a or not words_b:
        return False
    overlap = len(words_a & words_b) / max(len(words_a | words_b), 1)
    va, vb = a.get("views", 0) or 0, b.get("views", 0) or 0
    if va == 0 or vb == 0:
        views_similar = True
    else:
        ratio = min(va, vb) / max(va, vb)
        views_similar = ratio > 0.4
    return overlap > 0.5 and views_similar


def generate_id():
    return str(uuid.uuid4())[:8]


async def broadcast(message: dict):
    dead = []
    for ws in ws_connections:
        try:
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_connections.remove(ws)


def get_ydl_opts(song_id: str, output_dir: str, loop=None):
    def progress_hook(d):
        if loop is None or loop.is_closed():
            return
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            speed = d.get("speed") or 0
            eta = d.get("eta") or 0
            pct = (downloaded / total * 100) if total else 0
            asyncio.run_coroutine_threadsafe(broadcast({
                "type": "progress",
                "song_id": song_id,
                "percent": round(pct, 1),
                "speed": round(speed / 1024 / 1024, 2) if speed else 0,
                "eta": eta,
                "downloaded": round(downloaded / 1024 / 1024, 2),
                "total": round(total / 1024 / 1024, 2) if total else 0,
            }), loop)
        elif d["status"] == "finished":
            asyncio.run_coroutine_threadsafe(broadcast({
                "type": "converting",
                "song_id": song_id,
            }), loop)

    quality_val = SETTINGS.get("quality", "0")
    try:
        quality_int = int(quality_val)
    except (ValueError, TypeError):
        quality_int = 0

    opts = {
        "format": "bestaudio[acodec!=none]/best[acodec!=none]/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": quality_int,
            },
            {
                "key": "FFmpegMetadata",
            },
            {
                "key": "EmbedThumbnail",
            }
        ],
        "outtmpl": os.path.join(output_dir, "%(title)s [%(id)s].%(ext)s"),
        "progress_hooks": [progress_hook],
        "writethumbnail": True,
        "keepvideo": False,
        "noplaylist": True,
        "geo_bypass": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "prefer_free_formats": False,
        "ignoreerrors": False,
    }

    cookies_browser = SETTINGS.get("cookies_from_browser", "")
    cookies_file = BASE_DIR / "cookies.txt"
    if cookies_file.exists():
        opts["cookiefile"] = str(cookies_file)
    elif cookies_browser:
        opts["cookies_from_browser"] = cookies_browser

    return opts


def search_youtube(query: str, max_results: int = 5) -> list[dict]:
    print(f"  Arama: \"{query}\"")
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "default_search": "ytsearch",
        "noplaylist": True,
        "socket_timeout": 15,
        "prefer_free_formats": False,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            results = ydl.extract_info(f"ytsearch{max_results}:{query}", download=False)
            entries = results.get("entries", []) if results else []
            songs = []
            for e in entries:
                if e is None:
                    continue
                songs.append({
                    "id": e.get("id", ""),
                    "title": e.get("title", "Bilinmeyen"),
                    "duration": e.get("duration", 0),
                    "views": e.get("view_count", 0) or 0,
                    "channel": e.get("channel", e.get("uploader", "Bilinmeyen")),
                    "url": e.get("url", "") or e.get("webpage_url", "") or f"https://www.youtube.com/watch?v={e.get('id', '')}",
                    "thumbnail": e.get("thumbnail", ""),
                })
            return songs
    except Exception as e:
        print(f"Arama hatası [{query}]: {e}")
        return []


async def download_song(song_id: str):
    global STOP_FLAG, PAUSE_FLAG
    song = None
    for s in queue:
        if s["id"] == song_id:
            song = s
            break
    if not song:
        return

    song["status"] = "downloading"
    await broadcast({"type": "status_update", "song_id": song_id, "status": "downloading"})
    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})

    ydl_opts = get_ydl_opts(song_id, str(DOWNLOAD_DIR), asyncio.get_running_loop())

    try:
        await broadcast({
            "type": "searching",
            "song_id": song_id,
            "query": song["query"],
        })

        if song.get("is_url") and song.get("video_id"):
            url = f"https://www.youtube.com/watch?v={song['video_id']}"
            search_results = [{
                "id": song["video_id"],
                "title": song["query"],
                "duration": 0,
                "views": 0,
                "channel": "",
                "url": url,
                "thumbnail": f"https://img.youtube.com/vi/{song['video_id']}/mqdefault.jpg",
            }]
            print(f"  Direkt link: {url}")
        else:
            search_results = await asyncio.to_thread(search_youtube, song["query"], 5)

        if not search_results:
            raise Exception("YouTube'da sonuç bulunamadı")

        if not song.get("is_url") and is_undecided(search_results):
            print(f"  Kararsız — kullanıcıya seçim sunuluyor")
            options = search_results[:3]
            await broadcast({
                "type": "need_selection",
                "song_id": song_id,
                "query": song["query"],
                "options": options,
            })
            event = asyncio.Event()
            SELECTION_WAIT[song_id] = event
            SELECTION_RESULT[song_id] = 0
            try:
                await asyncio.wait_for(event.wait(), timeout=120)
            except asyncio.TimeoutError:
                print(f"  Seçim zaman aşımı — ilk sonuç kullanılıyor")
            finally:
                SELECTION_WAIT.pop(song_id, None)

            chosen_idx = SELECTION_RESULT.pop(song_id, 0)
            chosen_idx = max(0, min(chosen_idx, len(search_results) - 1))
            search_results = [search_results[chosen_idx]]
            await broadcast({"type": "selection_made", "song_id": song_id})

        existing_files = set(DOWNLOAD_DIR.glob("*.mp3"))
        existing_sizes = {f.stat().st_size for f in existing_files}

        last_error = None
        for idx, candidate in enumerate(search_results):
            if STOP_FLAG:
                song["status"] = "cancelled"
                await broadcast({"type": "status_update", "song_id": song_id, "status": "cancelled"})
                return

            if PAUSE_FLAG:
                song["status"] = "paused"
                await broadcast({"type": "status_update", "song_id": song_id, "status": "paused"})
                while PAUSE_FLAG and not STOP_FLAG:
                    await asyncio.sleep(0.5)
                if STOP_FLAG:
                    song["status"] = "cancelled"
                    await broadcast({"type": "status_update", "song_id": song_id, "status": "cancelled"})
                    return
                song["status"] = "downloading"
                await broadcast({"type": "status_update", "song_id": song_id, "status": "downloading"})

            song["youtube_title"] = candidate["title"]
            song["youtube_views"] = candidate["views"]
            song["youtube_url"] = candidate["url"]
            song["youtube_channel"] = candidate["channel"]
            song["youtube_thumbnail"] = candidate["thumbnail"]

            await broadcast({
                "type": "found",
                "song_id": song_id,
                "youtube_title": candidate["title"],
                "views": candidate["views"],
                "channel": candidate["channel"],
                "url": candidate["url"],
            })

            print(f"  [{idx+1}/5] {candidate['title']} ({candidate['views']} views) — {candidate['url']}")

            try:
                await asyncio.to_thread(
                    lambda c=candidate: yt_dlp.YoutubeDL(ydl_opts).download([c["url"]])
                )

                new_files = set(DOWNLOAD_DIR.glob("*.mp3")) - existing_files
                new_files = {f for f in new_files if f.stat().st_size not in existing_sizes or f.stat().st_size > 1024}
                if new_files:
                    last_error = None
                    print(f"  [{idx+1}/5] ✓ Başarılı")
                    break
                else:
                    tmp_files = set(DOWNLOAD_DIR.glob("*.webm")) | set(DOWNLOAD_DIR.glob("*.m4a")) | set(DOWNLOAD_DIR.glob("*.opus"))
                    tmp_new = {f for f in tmp_files if f.stat().st_mtime > time.time() - 60}
                    if tmp_new:
                        last_error = Exception("Ses dosyası indirildi ama MP3'e dönüştürülemedi (FFmpeg sorunu olabilir)")
                        print(f"  [{idx+1}/5] ✗ Geçici dosya var ama MP3 yok")
                    else:
                        last_error = Exception("Hiç dosya indirilmedi (DRM/koruma)")
                        print(f"  [{idx+1}/5] ✗ Hiç dosya oluşmadı")
                    continue

            except Exception as e:
                last_error = e
                print(f"  [{idx+1}/5] ✗ {e}")
                if "403" in str(e) or "Forbidden" in str(e) or "DRM" in str(e):
                    fallback_opts = dict(ydl_opts)
                    fallback_opts["format"] = "best"
                    fallback_opts["extractor_args"] = {"youtube": {"player_client": ["web", "mweb", "ios", "tv", "android"]}}
                    try:
                        await asyncio.to_thread(
                            lambda c=candidate, o=fallback_opts: yt_dlp.YoutubeDL(o).download([c["url"]])
                        )
                        new_files = set(DOWNLOAD_DIR.glob("*.mp3")) - existing_files
                        new_files = {f for f in new_files if f.stat().st_size not in existing_sizes or f.stat().st_size > 1024}
                        if new_files:
                            last_error = None
                            print(f"  [{idx+1}/5] ✓ Fallback başarılı")
                            break
                    except Exception as e2:
                        print(f"  [{idx+1}/5] ✗ Fallback de başarısız: {e2}")
                continue

        if last_error:
            raise last_error

        if STOP_FLAG:
            song["status"] = "cancelled"
            await broadcast({"type": "status_update", "song_id": song_id, "status": "cancelled"})
            return

        new_files = set(DOWNLOAD_DIR.glob("*.mp3")) - existing_files
        new_files = {f for f in new_files if f.stat().st_size not in existing_sizes or f.stat().st_size > 1024}
        downloaded_file = max(new_files, key=lambda f: f.stat().st_mtime) if new_files else None

        if not downloaded_file:
            raise Exception("Tüm sonuçlar başarısız — indirme tamamlandı ama MP3 oluşmadı")

        file_size = downloaded_file.stat().st_size

        song["status"] = "completed"
        song["file_path"] = str(downloaded_file) if downloaded_file else ""
        song["file_name"] = downloaded_file.name if downloaded_file else ""
        song["file_size"] = round(file_size / 1024 / 1024, 2)

        completed.append(song)
        if song in queue:
            queue.remove(song)

        await broadcast({
            "type": "completed",
            "song_id": song_id,
            "file_name": song["file_name"],
            "file_size": song["file_size"],
            "file_path": song["file_path"],
        })

        await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})

    except Exception as e:
        song["status"] = "error"
        song["error"] = str(e)
        completed.append(song)
        await broadcast({
            "type": "error",
            "song_id": song_id,
            "error": str(e),
        })
        if song in queue:
            queue.remove(song)

        await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})


async def process_queue():
    global STOP_FLAG, PAUSE_FLAG
    STOP_FLAG = False
    PAUSE_FLAG = False

    pending_ids = [s["id"] for s in queue if s["status"] == "pending"]
    total = len(pending_ids)
    done_count = 0

    for song_id in pending_ids:
        if STOP_FLAG:
            break
        while PAUSE_FLAG and not STOP_FLAG:
            await asyncio.sleep(0.5)
        if STOP_FLAG:
            break

        current = next((s for s in queue if s["id"] == song_id), None)
        if current and current["status"] == "pending":
            done_count += 1
            print(f"[{done_count}/{total}] İndiriliyor: {current['query']}")
            try:
                await download_song(song_id)
            except Exception as e:
                print(f"[{done_count}/{total}] BEKLENMEYEN HATA: {current['query']} — {e}")
            if current.get("status") == "error":
                print(f"[{done_count}/{total}] HATA: {current['query']} — {current.get('error', '?')}")
            else:
                print(f"[{done_count}/{total}] Tamamlandı: {current['query']}")
            await asyncio.sleep(0.5)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/parse")
async def parse_list(text: str = Form(""), file: Optional[UploadFile] = File(None)):
    lines = []
    if file:
        content = await file.read()
        text = content.decode("utf-8", errors="ignore")

    for line in text.strip().split("\n"):
        line = line.strip()
        if line and not line.startswith("#"):
            clean = re.sub(r"^\d+[\.\)\-]\s*", "", line).strip()
            if clean:
                lines.append(clean)

    items = []
    for line in lines:
        detected_id = extract_youtube_id(line)
        item = {
            "id": generate_id(),
            "query": line,
            "is_url": detected_id is not None,
            "video_id": detected_id or "",
            "status": "pending",
            "youtube_title": "",
            "youtube_views": 0,
            "youtube_url": "",
            "youtube_channel": "",
            "youtube_thumbnail": "",
            "file_path": "",
            "file_name": "",
            "file_size": 0,
            "error": "",
        }
        queue.append(item)
        items.append(item)

    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})
    return {"items": items, "total": len(queue)}


@app.post("/api/queue/{song_id}/remove")
async def remove_from_queue(song_id: str):
    global queue
    queue = [s for s in queue if s["id"] != song_id]
    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})
    return {"ok": True}


@app.post("/api/queue/clear")
async def clear_queue():
    global queue
    queue = []
    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})
    return {"ok": True}


@app.post("/api/completed/clear")
async def clear_completed():
    global completed
    completed = [s for s in completed if s["status"] != "completed"]
    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})
    return {"ok": True}


@app.post("/api/errors/clear")
async def clear_errors():
    global completed
    completed = [s for s in completed if s["status"] != "error"]
    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})
    return {"ok": True}


@app.post("/api/errors/{song_id}/remove")
async def remove_error(song_id: str):
    global completed
    completed = [s for s in completed if s["id"] != song_id]
    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})
    return {"ok": True}


@app.post("/api/errors/{song_id}/retry")
async def retry_error(song_id: str):
    global queue, completed
    song = None
    for s in completed:
        if s["id"] == song_id and s["status"] == "error":
            song = s
            break
    if not song:
        return JSONResponse(status_code=404, content={"error": "Şarkı bulunamadı"})
    completed = [s for s in completed if s["id"] != song_id]
    song["status"] = "pending"
    song["error"] = ""
    queue.append(song)
    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})
    return {"ok": True}


@app.post("/api/queue/reorder")
async def reorder_queue(order: list[str] = Form(...)):
    global queue
    id_map = {s["id"]: s for s in queue}
    new_queue = [id_map[sid] for sid in order if sid in id_map]
    queue = new_queue
    await broadcast({"type": "queue_updated", "queue": queue, "completed": completed})
    return {"ok": True}


@app.post("/api/download/start")
async def start_download():
    asyncio.create_task(process_queue())
    return {"ok": True}


@app.post("/api/download/pause")
async def pause_download():
    global PAUSE_FLAG
    PAUSE_FLAG = not PAUSE_FLAG
    return {"paused": PAUSE_FLAG}


@app.post("/api/download/stop")
async def stop_download():
    global STOP_FLAG
    STOP_FLAG = True
    return {"ok": True}


@app.post("/api/open-folder")
async def open_folder():
    os.startfile(str(DOWNLOAD_DIR))
    return {"ok": True}


@app.post("/api/open-file/{song_id}")
async def open_file(song_id: str):
    for s in completed:
        if s["id"] == song_id and s["file_path"]:
            if os.path.exists(s["file_path"]):
                os.startfile(s["file_path"])
                return {"ok": True}
    return JSONResponse(status_code=404, content={"error": "Dosya bulunamadı"})


@app.get("/api/stats")
async def get_stats():
    return {
        "total": len(queue),
        "pending": sum(1 for s in queue if s["status"] == "pending"),
        "downloading": sum(1 for s in queue if s["status"] == "downloading"),
        "completed": len(completed),
        "errors": sum(1 for s in completed if s["status"] == "error"),
    }


@app.get("/api/settings")
async def get_settings():
    return SETTINGS


@app.post("/api/settings")
async def update_settings(model: SettingsModel):
    global DOWNLOAD_DIR, SETTINGS
    SETTINGS["quality"] = model.quality
    SETTINGS["concurrent"] = model.concurrent
    if model.download_dir:
        DOWNLOAD_DIR = Path(model.download_dir)
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        SETTINGS["download_dir"] = str(DOWNLOAD_DIR)
    if model.cookies_from_browser is not None:
        SETTINGS["cookies_from_browser"] = model.cookies_from_browser
    return SETTINGS


@app.post("/api/select-video")
async def select_video(song_id: str = Form(...), index: int = Form(...)):
    if song_id in SELECTION_WAIT:
        SELECTION_RESULT[song_id] = index
        SELECTION_WAIT[song_id].set()
    return {"ok": True}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_connections.append(websocket)
    try:
        await websocket.send_json({
            "type": "queue_updated",
            "queue": queue,
            "completed": completed,
        })
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "select_video":
                song_id = msg.get("song_id")
                index = msg.get("index", 0)
                if song_id in SELECTION_WAIT:
                    SELECTION_RESULT[song_id] = index
                    SELECTION_WAIT[song_id].set()
    except WebSocketDisconnect:
        if websocket in ws_connections:
            ws_connections.remove(websocket)


if __name__ == "__main__":
    import uvicorn
    webbrowser.open("http://localhost:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
