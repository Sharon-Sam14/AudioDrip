import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from pydantic import BaseModel
from typing import List, Optional

import requests
import yt_dlp
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from db import init_pool, get_pool, get_db_cursor

from recommendation import (
    get_recommendations as get_song_recommendations,
    get_song_by_id,
    get_songs_by_ids,
    get_up_next,
    update_transition,
    upsert_song_records,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize PostgreSQL pool
    try:
        init_pool()
        # Ensure user_preferences table exists (runtime migration)
        try:
            with get_db_cursor(commit=True) as cursor:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS user_preferences (
                        user_id VARCHAR(255) PRIMARY KEY,
                        languages TEXT[] DEFAULT '{}',
                        genres TEXT[] DEFAULT '{}',
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
        except Exception as mig_err:
            print(f"Warning: Could not create user_preferences table: {mig_err}")
    except Exception as e:
        print(f"Warning: Database pool failed to initialize. Ensure init_db.py has run: {e}")
    yield
    # Cleanup DB connection pool
    try:
        pool = get_pool()
        if pool:
            pool.closeall()
            print("PostgreSQL connection pool closed.")
    except Exception:
        pass

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = BASE_DIR / "song_cache"
CACHE_LIMIT_BYTES = 600 * 1024 * 1024

DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

executor = ThreadPoolExecutor(max_workers=2)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Accept-Ranges"] = "bytes"
    return response


def is_song_cached(song_id):
    for ext in ["m4a", "webm", "opus", "mp3", "mp4"]:
        if (CACHE_DIR / f"{song_id}.{ext}").exists():
            return True
    return False


def get_cached_file(song_id):
    for ext in ["m4a", "webm", "opus", "mp3", "mp4"]:
        filepath = CACHE_DIR / f"{song_id}.{ext}"
        if filepath.exists():
            return filepath
    return None


def get_cache_size_bytes():
    return sum(entry.stat().st_size for entry in CACHE_DIR.iterdir() if entry.is_file())


def clear_audio_cache():
    for entry in CACHE_DIR.iterdir():
        if entry.is_file():
            try:
                entry.unlink()
            except OSError:
                pass


def clear_cache_if_needed():
    if get_cache_size_bytes() > CACHE_LIMIT_BYTES:
        clear_audio_cache()


def inject_cache_status(songs, user_id: str = "anonymous"):
    if not songs:
        return []
    song_ids = [song["id"] for song in songs]
    liked_set = set()
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT song_id FROM liked_songs WHERE user_id = %s AND song_id = ANY(%s);", (user_id, song_ids))
            rows = cursor.fetchall()
            liked_set = {row[0] for row in rows}
    except Exception:
        pass
        
    for song in songs:
        song["cached"] = is_song_cached(song["id"])
        song["liked"] = song["id"] in liked_set
    return songs


def _itunes_to_song(item):
    art_url = item.get("artworkUrl100", "")
    cover = art_url.replace("100x100bb", "200x200bb") if art_url else ""
    cover_xl = art_url.replace("100x100bb", "600x600bb") if art_url else ""
    return {
        "id": str(item.get("trackId", item.get("collectionId", 0))),
        "title": item.get("trackName", "Unknown"),
        "artist": item.get("artistName", "Unknown"),
        "artist_id": item.get("artistId", 0),
        "album": item.get("collectionName", "Single"),
        "cover": cover,
        "cover_xl": cover_xl,
        "duration": item.get("trackTimeMillis", 0) // 1000,
        "genre": item.get("primaryGenreName", "Music"),
    }


def search_songs(query, user_id: str = "anonymous"):
    if not query:
        return []
    import re
    # Clean query: strip redundant words "song", "songs", "music" if not the only words
    q_clean = query.strip()
    if q_clean:
        if not re.match(r'^(songs?|music)$', q_clean, re.IGNORECASE):
            q_clean = re.sub(r'\b(songs?|music)\b', '', q_clean, flags=re.IGNORECASE)
            q_clean = re.sub(r'\s+', ' ', q_clean).strip()
    if not q_clean:
        q_clean = query.strip()

    try:
        response = requests.get(
            "https://itunes.apple.com/search",
            params={"term": q_clean, "media": "music", "limit": 25, "country": "IN"},
            timeout=10,
        )
        data = response.json()
        songs = [_itunes_to_song(item) for item in data.get("results", []) if item.get("trackName")]
        upsert_song_records(songs)
        return inject_cache_status(songs, user_id=user_id)
    except Exception:
        return []


def get_chart(user_id: str = "anonymous"):
    try:
        response = requests.get("https://itunes.apple.com/in/rss/topsongs/limit=25/json", timeout=10).json()
        entries = response.get("feed", {}).get("entry", [])
        songs = []
        for entry in entries:
            try:
                art_url = ""
                for img in entry.get("im:image", []):
                    art_url = img.get("label", "")
                cover = art_url.replace("170x170bb", "200x200bb") if art_url else ""
                cover_xl = art_url.replace("170x170bb", "600x600bb") if art_url else ""
                artist_id = 0
                artist_link = entry.get("im:artist", {}).get("attributes", {}).get("href", "")
                if "/id" in artist_link:
                    try:
                        artist_id = int(artist_link.split("/id")[-1].split("?")[0])
                    except Exception:
                        pass
                track_id = str(entry.get("id", {}).get("attributes", {}).get("im:id", "0") or "0")
                genre = entry.get("category", {}).get("attributes", {}).get("label", "Music")
                songs.append(
                    {
                        "id": track_id,
                        "title": entry.get("im:name", {}).get("label", "Unknown"),
                        "artist": entry.get("im:artist", {}).get("label", "Unknown"),
                        "artist_id": artist_id,
                        "album": entry.get("im:collection", {}).get("im:name", {}).get("label", "Single"),
                        "cover": cover,
                        "cover_xl": cover_xl,
                        "duration": 0,
                        "genre": genre,
                    }
                )
            except Exception:
                continue
        upsert_song_records(songs)
        return inject_cache_status(songs, user_id=user_id)
    except Exception:
        return []


# Genres to exclude from the default (no-preference) home feed
DEVOTIONAL_GENRES = {
    "devotional", "bhakti", "spiritual", "religious", "mantra", "bhajans",
    "gospel", "christian", "islamic", "prayer", "stotra", "aarti",
    "carnatic", "qawwali"
}


def _parse_itunes_rss_entries(entries, user_id: str = "anonymous"):
    """Shared parser for iTunes RSS feed entries (top songs / new music)."""
    songs = []
    for entry in entries:
        try:
            art_url = ""
            for img in entry.get("im:image", []):
                art_url = img.get("label", "")
            cover = art_url.replace("170x170bb", "200x200bb") if art_url else ""
            cover_xl = art_url.replace("170x170bb", "600x600bb") if art_url else ""
            artist_id = 0
            artist_link = entry.get("im:artist", {}).get("attributes", {}).get("href", "")
            if "/id" in artist_link:
                try:
                    artist_id = int(artist_link.split("/id")[-1].split("?")[0])
                except Exception:
                    pass
            track_id = str(entry.get("id", {}).get("attributes", {}).get("im:id", "0") or "0")
            genre = entry.get("category", {}).get("attributes", {}).get("label", "Music")
            songs.append({
                "id": track_id,
                "title": entry.get("im:name", {}).get("label", "Unknown"),
                "artist": entry.get("im:artist", {}).get("label", "Unknown"),
                "artist_id": artist_id,
                "album": entry.get("im:collection", {}).get("im:name", {}).get("label", "Single"),
                "cover": cover,
                "cover_xl": cover_xl,
                "duration": 0,
                "genre": genre,
            })
        except Exception:
            continue
    if songs:
        upsert_song_records(songs)
    return inject_cache_status(songs, user_id=user_id)


def get_new_releases(user_id: str = "anonymous"):
    """Fetch latest global releases from iTunes new music feed, filtered of devotional content."""
    results = []
    # Primary: global new music feed
    try:
        response = requests.get(
            "https://itunes.apple.com/us/rss/newmusic/limit=50/json",
            timeout=10
        ).json()
        entries = response.get("feed", {}).get("entry", [])
        results = _parse_itunes_rss_entries(entries, user_id=user_id)
    except Exception:
        pass

    # Fallback: search for recent trending songs
    if not results:
        try:
            results = search_songs("new songs 2025 trending", user_id=user_id)
        except Exception:
            pass

    # Filter out devotional / religious genres
    filtered = [
        s for s in results
        if not any(kw in (s.get("genre") or "").lower() for kw in DEVOTIONAL_GENRES)
    ]
    return filtered if filtered else results


def fetch_lyrics(artist, title):
    try:
        resp = requests.get(
            "https://lrclib.net/api/search",
            params={"artist_name": artist, "track_name": title},
            headers={"User-Agent": "AudioDrip/1.0"},
            timeout=5,
        )
        data = resp.json()
        if isinstance(data, list) and data:
            for item in data:
                if item.get("syncedLyrics"):
                    return {"type": "synced", "text": item["syncedLyrics"]}
            for item in data:
                if item.get("plainLyrics"):
                    return {"type": "plain", "text": item["plainLyrics"]}
        return {"type": "error", "text": "No lyrics found."}
    except Exception:
        return {"type": "error", "text": "Lyrics unavailable."}


def fetch_artist_tracks(artist_id, limit=20):
    try:
        artist_id = int(artist_id or 0)
        if artist_id <= 0:
            return []
        response = requests.get(
            "https://itunes.apple.com/lookup",
            params={"id": artist_id, "entity": "song", "limit": limit, "country": "IN"},
            timeout=10,
        )
        data = response.json()
        songs = [_itunes_to_song(item) for item in data.get("results", []) if item.get("wrapperType") == "track" and item.get("trackName")]
        if songs:
            upsert_song_records(songs)
        return songs
    except Exception:
        return []


def fetch_artist_search_results(artist_name, limit=25):
    try:
        artist_name = (artist_name or "").strip()
        if not artist_name:
            return []
        response = requests.get(
            "https://itunes.apple.com/search",
            params={"term": artist_name, "media": "music", "entity": "song", "limit": limit, "country": "IN"},
            timeout=10,
        )
        data = response.json()
        songs = []
        normalized_artist = artist_name.casefold()
        for item in data.get("results", []):
            item_artist = str(item.get("artistName", "")).strip()
            if not item.get("trackName"):
                continue
            if normalized_artist not in item_artist.casefold() and item_artist.casefold() not in normalized_artist:
                continue
            songs.append(_itunes_to_song(item))
        if songs:
            upsert_song_records(songs)
        return songs
    except Exception:
        return []


def enrich_catalog_for_song(song_id):
    song = get_song_by_id(song_id)
    if not song:
        return
        
    artist = song.get("artist")
    genre = song.get("genre")
    
    search_terms = []
    if artist:
        clean_artist = artist.strip()
        if clean_artist:
            search_terms.append(clean_artist)
            
    if genre and genre.lower() not in ["music", "unknown", ""]:
        clean_genre = genre.strip()
        search_terms.append(f"{clean_genre} songs")
        
    # Detect language from metadata and search it to seed the DB
    text_to_scan = f"{song.get('title', '')} {song.get('artist', '')} {song.get('album', '')} {song.get('genre', '')}".lower()
    for lang in ["hindi", "tamil", "telugu", "punjabi", "bengali", "malayalam", "kannada", "marathi", "korean", "spanish", "french", "english"]:
        if lang in text_to_scan:
            search_terms.append(f"{lang} songs")
            break
            
    search_terms = list(dict.fromkeys(search_terms))
    
    # Pre-fetch matching tracks in parallel to seed catalog for similarity calculations
    if search_terms:
        try:
            with ThreadPoolExecutor(max_workers=2) as pool_exec:
                pool_exec.map(lambda term: search_songs(term), search_terms[:3])
        except Exception:
            pass
            
    # Keep artist_id lookup as fallback
    artist_id = song.get("artist_id")
    if artist_id and int(artist_id) > 0:
        try:
            fetch_artist_tracks(artist_id)
        except Exception:
            pass


def hydrate_song_ids(song_ids, user_id: str = "anonymous"):
    return inject_cache_status(get_songs_by_ids(song_ids), user_id=user_id)


def build_recommendation_response(song_id, user_id: str = "anonymous"):
    enrich_catalog_for_song(song_id)
    grouped_ids = get_song_recommendations(song_id)
    return {
        "behavior_based": hydrate_song_ids(grouped_ids.get("behavior_based", []), user_id=user_id),
        "content_based": hydrate_song_ids(grouped_ids.get("content_based", []), user_id=user_id),
    }


def build_up_next_response(song_id, limit=10, user_id: str = "anonymous"):
    enrich_catalog_for_song(song_id)
    entries = get_up_next(song_id, limit=limit)
    songs_by_id = {song["id"]: song for song in hydrate_song_ids([entry["song_id"] for entry in entries], user_id=user_id)}
    result = []
    for entry in entries:
        song = songs_by_id.get(entry["song_id"])
        if song:
            item = dict(song)
            item["reason"] = entry["reason"]
            result.append(item)
    return result


def download_task(song_id, artist, title):
    clear_cache_if_needed()
    if is_song_cached(song_id):
        return
    query = f"{artist} - {title} audio"
    cookie_path = BASE_DIR / "cookies.txt"
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/best",
        "outtmpl": str(CACHE_DIR / f"{song_id}.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
    }
    if cookie_path.exists():
        ydl_opts["cookiefile"] = str(cookie_path)
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"ytsearch1:{query}"])
        clear_cache_if_needed()
    except Exception:
        pass


def build_proxy_response(url: str, incoming_headers, headers_json: str):
    try:
        try:
            yt_headers = json.loads(headers_json or "{}")
        except Exception:
            yt_headers = {}

        headers = {
            "User-Agent": yt_headers.get("User-Agent", "Mozilla/5.0"),
            "Accept": yt_headers.get("Accept", "*/*"),
            "Accept-Language": yt_headers.get("Accept-Language", "en-us,en;q=0.5"),
            "Sec-Fetch-Mode": yt_headers.get("Sec-Fetch-Mode", "navigate"),
        }
        if "range" in incoming_headers:
            headers["Range"] = incoming_headers["range"]

        req = requests.get(url, stream=True, headers=headers, timeout=30)
        excluded_headers = {"content-encoding", "transfer-encoding", "connection"}
        response_headers = {name: value for name, value in req.headers.items() if name.lower() not in excluded_headers}
        response_headers["Accept-Ranges"] = "bytes"
        return StreamingResponse(
            req.iter_content(chunk_size=1024 * 16),
            status_code=req.status_code,
            media_type=req.headers.get("content-type", "audio/mp4"),
            headers=response_headers,
        )
    except Exception as exc:
        return PlainTextResponse(f"Stream error: {exc}", status_code=500)


def render_play_response(request: Request, song_id: str, artist: str, title: str):
    cached_file = get_cached_file(song_id)
    if cached_file:
        filename = cached_file.name
        base_url = str(request.base_url).rstrip("/")
        return JSONResponse({"source": "local", "url": f"{base_url}/api/mobile/stream_cache/{filename}"})

    query = f"{artist} - {title} audio"
    cookie_path = BASE_DIR / "cookies.txt"
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/best",
        "noplaylist": True,
        "quiet": False,
    }
    if cookie_path.exists():
        ydl_opts["cookiefile"] = str(cookie_path)
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(f"ytsearch1:{query}", download=False)
            video = info["entries"][0] if "entries" in info else info
            http_headers = video.get("http_headers", {})
            base_url = str(request.base_url).rstrip("/")
            proxy_url = f"{base_url}/api/mobile/stream_proxy?url={quote(video['url'])}&headers={quote(json.dumps(http_headers))}"
            return JSONResponse({"source": "youtube", "url": proxy_url, "direct_url": video["url"], "headers": http_headers})
        except Exception as exc:
            return JSONResponse({"error": f"Song not found: {exc}"}, status_code=404)


STATIC_DIR = BASE_DIR / "static"

# Create static dir if not exists
STATIC_DIR.mkdir(parents=True, exist_ok=True)

@app.get("/")
def serve_root():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return PlainTextResponse("AudioDrip Server is running. Relaunch with Frontend build inside 'static' directory.")



@app.get("/api/mobile/search")
def mobile_search(q: str = "", user_id: str = "anonymous"):
    return JSONResponse(search_songs(q, user_id=user_id))


@app.get("/api/mobile/chart")
def mobile_chart(user_id: str = "anonymous"):
    # Fetch user preferences from DB if logged in
    user_prefs = {"languages": [], "genres": []}
    if user_id != "anonymous":
        try:
            with get_db_cursor() as cursor:
                cursor.execute(
                    "SELECT languages, genres FROM user_preferences WHERE user_id = %s;",
                    (user_id,)
                )
                row = cursor.fetchone()
                if row:
                    user_prefs = {"languages": list(row[0] or []), "genres": list(row[1] or [])}
        except Exception:
            pass

    has_preferences = bool(user_prefs["languages"] or user_prefs["genres"])

    # No preferences set → show latest global new releases (no devotional)
    if not has_preferences:
        new_releases = get_new_releases(user_id=user_id)
        return JSONResponse(new_releases[:30])

    # Has preferences → fetch preference-matched songs first, then India chart as filler
    base_songs = get_chart(user_id=user_id)

    # Map preferences to iTunes search terms
    LANG_SEARCH = {
        "Hindi": "hindi bollywood songs",
        "Tamil": "tamil songs",
        "Telugu": "telugu songs",
        "Punjabi": "punjabi songs",
        "Bengali": "bengali songs",
        "Malayalam": "malayalam songs",
        "Kannada": "kannada songs",
        "Marathi": "marathi songs",
        "English": "english pop hits",
        "Korean": "kpop korean songs",
        "Spanish": "spanish latin songs",
        "French": "french music",
    }
    GENRE_SEARCH = {
        "Party": "party dance club hits",
        "Devotional": "devotional bhakti spiritual",
        "Chill": "chill lofi relaxing",
        "Romantic": "romantic love songs",
        "Hip-Hop": "hip hop rap",
        "Rock": "rock songs",
        "Classical": "classical instrumental",
        "Jazz": "jazz music",
        "Pop": "pop songs top hits",
        "Workout": "workout gym energetic",
        "Sufi": "sufi ghazal music",
        "Retro": "retro classic old hits",
    }

    seen_ids = {s["id"] for s in base_songs}
    pref_songs = []

    search_terms = []
    for lang in user_prefs.get("languages", []):
        if lang in LANG_SEARCH:
            search_terms.append(LANG_SEARCH[lang])
    for genre in user_prefs.get("genres", []):
        if genre in GENRE_SEARCH:
            search_terms.append(GENRE_SEARCH[genre])

    # Fetch up to 3 preference search terms to avoid slow responses
    for term in search_terms[:3]:
        try:
            songs = search_songs(term, user_id=user_id)
            for song in songs:
                if song["id"] not in seen_ids:
                    pref_songs.append(song)
                    seen_ids.add(song["id"])
        except Exception:
            pass

    # Preference songs first, then chart songs (deduplicated)
    combined = pref_songs[:25] + base_songs
    return JSONResponse(combined[:50])


@app.get("/api/mobile/preferences")
def get_preferences(user_id: str = "anonymous"):
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT languages, genres FROM user_preferences WHERE user_id = %s;",
                (user_id,)
            )
            row = cursor.fetchone()
            if row:
                return JSONResponse({"languages": list(row[0] or []), "genres": list(row[1] or [])})
        return JSONResponse({"languages": [], "genres": []})
    except Exception:
        return JSONResponse({"languages": [], "genres": []})


class PreferencesRequest(BaseModel):
    user_id: str
    languages: List[str] = []
    genres: List[str] = []


@app.post("/api/mobile/preferences")
def save_preferences(req: PreferencesRequest):
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                INSERT INTO user_preferences (user_id, languages, genres, updated_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET
                    languages = EXCLUDED.languages,
                    genres = EXCLUDED.genres,
                    updated_at = CURRENT_TIMESTAMP;
            """, (req.user_id, req.languages, req.genres))
        return JSONResponse({"status": "success"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/mobile/recommend")
def mobile_recommend(song_id: str = "", user_id: str = "anonymous"):
    return JSONResponse(build_recommendation_response(song_id, user_id=user_id))


@app.get("/api/mobile/up_next")
def mobile_up_next(song_id: str = "", limit: int = 10, user_id: str = "anonymous"):
    return JSONResponse(build_up_next_response(song_id, limit=limit or 10, user_id=user_id))


@app.get("/api/mobile/lyrics")
def mobile_lyrics(artist: str = "", title: str = ""):
    return JSONResponse(fetch_lyrics(artist, title))


@app.get("/api/mobile/play")
def mobile_play(request: Request, id: str = "", artist: str = "", title: str = "", previous_song_id: str | None = None):
    update_transition(previous_song_id, id)
    return render_play_response(request, id, artist, title)


@app.get("/api/mobile/stream_cache/{filename:path}")
def mobile_stream_cache(filename: str):
    filepath = CACHE_DIR / filename
    if not filepath.exists():
        return PlainTextResponse("Not Found", status_code=404)
    return FileResponse(filepath)


@app.get("/api/mobile/stream_proxy")
def mobile_stream_proxy(request: Request, url: str = "", headers: str = "{}"):
    if not url:
        return PlainTextResponse("No URL", status_code=400)
    return build_proxy_response(url, request.headers, headers)


@app.post("/api/mobile/cache_song")
async def mobile_cache_song(request: Request):
    data = await request.json()
    if not data:
        return JSONResponse({"error": "No data"}, status_code=400)
    executor.submit(download_task, str(data.get("id")), data.get("artist"), data.get("title"))
    return JSONResponse({"status": "queued"})


@app.get("/api/mobile/cached")
def get_cached_songs(user_id: str = "anonymous"):
    try:
        song_ids = []
        for entry in CACHE_DIR.iterdir():
            if entry.is_file() and not entry.name.startswith('.'):
                song_id = entry.stem
                song_ids.append(song_id)
        
        if not song_ids:
            return JSONResponse([])
            
        songs = get_songs_by_ids(song_ids)
        return JSONResponse(inject_cache_status(songs, user_id=user_id))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


class AuthRequest(BaseModel):
    email: str
    password: str


@app.post("/api/mobile/signup")
def mobile_signup(req: AuthRequest):
    email = req.email.strip().lower()
    password = req.password
    if not email or not password:
        return JSONResponse({"error": "Email and password are required"}, status_code=400)
    
    import hashlib
    hashed_password = hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("SELECT 1 FROM users WHERE email = %s;", (email,))
            if cursor.fetchone():
                return JSONResponse({"error": "User already exists"}, status_code=400)
            
            cursor.execute("INSERT INTO users (email, password) VALUES (%s, %s) RETURNING id, email;", (email, hashed_password))
            row = cursor.fetchone()
            return JSONResponse({"status": "success", "user": {"id": str(row[0]), "email": row[1]}})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/mobile/signin")
def mobile_signin(req: AuthRequest):
    email = req.email.strip().lower()
    password = req.password
    if not email or not password:
        return JSONResponse({"error": "Email and password are required"}, status_code=400)
    
    import hashlib
    hashed_password = hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id, email, password FROM users WHERE email = %s;", (email,))
            row = cursor.fetchone()
            if not row:
                return JSONResponse({"error": "Invalid email or password"}, status_code=400)
            
            db_id, db_email, db_password = row
            if db_password != hashed_password:
                return JSONResponse({"error": "Invalid email or password"}, status_code=400)
                
            return JSONResponse({"status": "success", "user": {"id": str(db_id), "email": db_email}})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/mobile/health")
def mobile_health():
    return JSONResponse({"status": "ok", "server": "AudioDrip", "version": "3.0", "timestamp": int(time.time())})


@app.get("/api/mobile/check_email")
def check_email(email: str = ""):
    email = email.strip().lower()
    if not email:
        return JSONResponse({"exists": False})
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT 1 FROM users WHERE email = %s;", (email,))
            exists = cursor.fetchone() is not None
            return JSONResponse({"exists": exists})
    except Exception as e:
        print(f"Error checking email: {e}")
        return JSONResponse({"exists": False})


class PasswordResetRequest(BaseModel):
    email: str
    new_password: str


@app.post("/api/mobile/update_password")
def update_password(req: PasswordResetRequest):
    """Reset the password for a user identified by email."""
    email = req.email.strip().lower()
    new_password = req.new_password
    if not email or not new_password or len(new_password) < 6:
        return JSONResponse({"error": "Email and a password of at least 6 characters are required"}, status_code=400)

    import hashlib
    hashed_password = hashlib.sha256(new_password.encode('utf-8')).hexdigest()
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("SELECT 1 FROM users WHERE email = %s;", (email,))
            if not cursor.fetchone():
                return JSONResponse({"error": "No account found with that email"}, status_code=404)
            cursor.execute("UPDATE users SET password = %s WHERE email = %s;", (hashed_password, email))
            return JSONResponse({"status": "success", "message": "Password updated successfully"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)



@app.get("/api/mobile/liked")
def get_liked_songs(user_id: str = "anonymous"):
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT s.id, s.title, s.artist, s.artist_id, s.album, s.cover, s.cover_xl, s.duration, s.genre,
                       true as liked
                FROM liked_songs l
                JOIN songs s ON l.song_id = s.id
                WHERE l.user_id = %s
                ORDER BY l.liked_at DESC;
            """, (user_id,))
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            songs = [dict(zip(columns, row)) for row in rows]
            for song in songs:
                song["cached"] = is_song_cached(song["id"])
            return JSONResponse(songs)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/mobile/like")
def toggle_like_song(song_id: str, user_id: str = "anonymous"):
    song_id = song_id.strip()
    if not song_id:
        return JSONResponse({"error": "Missing song_id"}, status_code=400)

    try:
        song = get_song_by_id(song_id)
        if not song:
            return JSONResponse({"error": "Song not found in database catalog"}, status_code=404)

        with get_db_cursor(commit=True) as cursor:
            cursor.execute("SELECT 1 FROM liked_songs WHERE user_id = %s AND song_id = %s;", (user_id, song_id))
            exists = cursor.fetchone()
            if exists:
                cursor.execute("DELETE FROM liked_songs WHERE user_id = %s AND song_id = %s;", (user_id, song_id))
                liked_state = False
            else:
                cursor.execute("INSERT INTO liked_songs (user_id, song_id) VALUES (%s, %s);", (user_id, song_id))
                liked_state = True
            return JSONResponse({"status": "success", "liked": liked_state})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/mobile/playlists")
def get_playlists(user_id: str = "anonymous"):
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT p.id, p.name, COUNT(ps.song_id)::integer as song_count, p.created_at::text
                FROM playlists p
                LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
                WHERE p.user_id = %s
                GROUP BY p.id
                ORDER BY p.name ASC;
            """, (user_id,))
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            return JSONResponse([dict(zip(columns, row)) for row in rows])
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/mobile/playlists")
def create_playlist(name: str, user_id: str = "anonymous"):
    name = name.strip()
    if not name:
        return JSONResponse({"error": "Missing playlist name"}, status_code=400)
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("INSERT INTO playlists (name, user_id) VALUES (%s, %s) RETURNING id, name;", (name, user_id))
            row = cursor.fetchone()
            return JSONResponse({"status": "success", "playlist": {"id": row[0], "name": row[1]}})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/mobile/playlists/delete")
def delete_playlist(id: int):
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("DELETE FROM playlists WHERE id = %s;", (id,))
            return JSONResponse({"status": "success", "message": f"Playlist {id} deleted"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/mobile/playlists/{id}/songs")
def get_playlist_songs(id: int, user_id: str = "anonymous"):
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT s.id, s.title, s.artist, s.artist_id, s.album, s.cover, s.cover_xl, s.duration, s.genre,
                       (l.song_id IS NOT NULL) as liked
                FROM playlist_songs ps
                JOIN songs s ON ps.song_id = s.id
                LEFT JOIN liked_songs l ON s.id = l.song_id AND l.user_id = %s
                WHERE ps.playlist_id = %s
                ORDER BY ps.added_at DESC;
            """, (user_id, id))
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            songs = [dict(zip(columns, row)) for row in rows]
            for song in songs:
                song["cached"] = is_song_cached(song["id"])
            return JSONResponse(songs)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/mobile/playlists/{id}/add")
def add_song_to_playlist(id: int, song_id: str):
    song_id = song_id.strip()
    if not song_id:
        return JSONResponse({"error": "Missing song_id"}, status_code=400)
    try:
        song = get_song_by_id(song_id)
        if not song:
            return JSONResponse({"error": "Song not found in catalog database"}, status_code=404)
            
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("SELECT 1 FROM playlists WHERE id = %s;", (id,))
            if not cursor.fetchone():
                return JSONResponse({"error": "Playlist not found"}, status_code=404)
                
            cursor.execute("""
                INSERT INTO playlist_songs (playlist_id, song_id) 
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING;
            """, (id, song_id))
            return JSONResponse({"status": "success", "message": "Song added to playlist"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/mobile/playlists/{id}/remove")
def remove_song_from_playlist(id: int, song_id: str):
    song_id = song_id.strip()
    if not song_id:
        return JSONResponse({"error": "Missing song_id"}, status_code=400)
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("DELETE FROM playlist_songs WHERE playlist_id = %s AND song_id = %s;", (id, song_id))
            return JSONResponse({"status": "success", "message": "Song removed from playlist"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# Interaction Endpoint Setup
class InteractionRequest(BaseModel):
    user_id: str
    song_id: str
    interaction_type: str
    score: int


@app.post("/api/mobile/interaction")
def log_user_interaction(req: InteractionRequest):
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                INSERT INTO user_interactions (user_id, song_id, interaction_type, score)
                VALUES (%s, %s, %s, %s);
            """, (req.user_id, req.song_id, req.interaction_type, req.score))
        return JSONResponse({"status": "success"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# AI Playlist Endpoint Setup
class AIPlaylistRequest(BaseModel):
    prompt: str
    user_id: str = "anonymous"


@app.post("/api/mobile/ai_playlist")
def generate_ai_playlist(req: AIPlaylistRequest):
    prompt = req.prompt.strip()
    if not prompt:
        return JSONResponse({"error": "Prompt cannot be empty"}, status_code=400)
    
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        print("Warning: GROQ_API_KEY not configured. Falling back to local catalog match.")
        return generate_fallback_playlist_local(prompt, req.user_id)

    try:
        system_prompt = (
            "You are AudioDrip's AI Assistant. The user wants to generate a playlist. "
            "Analyze the prompt and output a JSON object with: "
            "1. 'name': a creative title for this playlist. "
            "2. 'genres': a list of genre names mentioned or implied. "
            "3. 'keywords': a list of keyword strings to match song titles, albums, or artists. "
            "Do not output any introductory or summary text. Output ONLY the JSON block. "
            "Example format: {\"name\": \"Chill Night Vibe\", \"genres\": [\"synthwave\", \"lofi\"], \"keywords\": [\"night\", \"sleep\", \"slow\"]}"
        )
        
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }
        
        resp = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        resp_data = resp.json()
        content = resp_data["choices"][0]["message"]["content"]
        ai_meta = json.loads(content)
        
        pl_name = ai_meta.get("name", f"AI: {prompt[:30]}")
        genres = ai_meta.get("genres", [])
        keywords = ai_meta.get("keywords", [])
        
        # Dynamically seed local DB with fresh matches from iTunes Search API in parallel
        import re
        search_terms = []
        clean_prompt = prompt
        if not re.match(r'^(songs?|music)$', clean_prompt, re.IGNORECASE):
            clean_prompt = re.sub(r'\b(songs?|music)\b', '', clean_prompt, flags=re.IGNORECASE)
            clean_prompt = re.sub(r'\s+', ' ', clean_prompt).strip()
        if clean_prompt:
            search_terms.append(clean_prompt)
            
        for g in genres[:2]:
            for k in keywords[:2]:
                if g.lower() != k.lower():
                    search_terms.append(f"{g} {k}")
                else:
                    search_terms.append(g)
        
        search_terms = list(dict.fromkeys(search_terms))
        
        with ThreadPoolExecutor(max_workers=3) as pool_exec:
            pool_exec.map(lambda term: search_songs(term, user_id=req.user_id), search_terms[:4])
        
        matched_song_ids = []
        with get_db_cursor() as cursor:
            clauses = []
            params = []
            for g in genres:
                clauses.append("genre ILIKE %s")
                params.append(f"%{g}%")
            for k in keywords:
                clauses.append("title ILIKE %s OR artist ILIKE %s OR album ILIKE %s OR genre ILIKE %s")
                params.extend([f"%{k}%", f"%{k}%", f"%{k}%", f"%{k}%"])
                
            if clauses:
                case_clauses = [f"CASE WHEN {c} THEN 1 ELSE 0 END" for c in clauses]
                score_expr = " + ".join(case_clauses)
                query = f"""
                    SELECT id, ({score_expr}) as match_score 
                    FROM songs 
                    WHERE {' OR '.join(clauses)} 
                    ORDER BY match_score DESC, last_played_at DESC 
                    LIMIT 15;
                """
                cursor.execute(query, params + params)
                matched_song_ids = [row[0] for row in cursor.fetchall()]
                
        if len(matched_song_ids) < 10:
            with get_db_cursor() as cursor:
                cursor.execute("SELECT id FROM songs ORDER BY last_played_at DESC LIMIT 20;")
                extra_ids = [row[0] for row in cursor.fetchall()]
                for eid in extra_ids:
                    if eid not in matched_song_ids:
                        matched_song_ids.append(eid)
                        
        song_ids = matched_song_ids[:15]
        
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("INSERT INTO playlists (name, user_id) VALUES (%s, %s) RETURNING id, name;", (pl_name, req.user_id))
            row = cursor.fetchone()
            playlist_id = row[0]
            for sid in song_ids:
                cursor.execute("INSERT INTO playlist_songs (playlist_id, song_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (playlist_id, sid))
                
        return JSONResponse({"status": "success", "playlist": {"id": playlist_id, "name": pl_name}})
        
    except Exception as e:
        print(f"Error calling Groq API: {e}")
        return generate_fallback_playlist_local(prompt, req.user_id)


def generate_fallback_playlist_local(prompt, user_id):
    # Pre-fetch matching songs from iTunes to seed local database
    import re
    clean_prompt = prompt
    if not re.match(r'^(songs?|music)$', clean_prompt, re.IGNORECASE):
        clean_prompt = re.sub(r'\b(songs?|music)\b', '', clean_prompt, flags=re.IGNORECASE)
        clean_prompt = re.sub(r'\s+', ' ', clean_prompt).strip()
    if clean_prompt:
        try:
            search_songs(clean_prompt, user_id=user_id)
        except Exception:
            pass

    words = [w.strip().lower() for w in prompt.split() if len(w.strip()) > 3]
    matched_songs = []
    with get_db_cursor() as cursor:
        if words:
            clauses = []
            params = []
            case_clauses = []
            for w in words:
                clause = "(title ILIKE %s OR artist ILIKE %s OR genre ILIKE %s)"
                clauses.append(clause)
                params.extend([f"%{w}%", f"%{w}%", f"%{w}%"])
                case_clauses.append(f"CASE WHEN {clause} THEN 1 ELSE 0 END")
                
            score_expr = " + ".join(case_clauses)
            query = f"""
                SELECT id, title, artist, ({score_expr}) as match_score 
                FROM songs 
                WHERE {' OR '.join(clauses)} 
                ORDER BY match_score DESC, last_played_at DESC 
                LIMIT 15;
            """
            cursor.execute(query, params + params)
            matched_songs = cursor.fetchall()
            
        matched_ids = [s[0] for s in matched_songs]
        if len(matched_ids) < 10:
            cursor.execute("SELECT id FROM songs ORDER BY last_played_at DESC LIMIT 20;")
            extra_ids = [row[0] for row in cursor.fetchall()]
            for eid in extra_ids:
                if eid not in matched_ids:
                    matched_ids.append(eid)
                    
    song_ids = matched_ids[:15]
    playlist_name = f"AI: {prompt[:30]}"
    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("INSERT INTO playlists (name, user_id) VALUES (%s, %s) RETURNING id, name;", (playlist_name, user_id))
            row = cursor.fetchone()
            playlist_id = row[0]
            for sid in song_ids:
                cursor.execute("INSERT INTO playlist_songs (playlist_id, song_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;", (playlist_id, sid))
        return JSONResponse({"status": "success", "playlist": {"id": playlist_id, "name": playlist_name}})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/{path:path}")
def serve_fallback(path: str):
    if path.startswith("api/"):
        return JSONResponse({"error": "Not Found"}, status_code=404)
        
    file_path = STATIC_DIR / path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
        
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
        
    return PlainTextResponse("Not Found", status_code=404)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
