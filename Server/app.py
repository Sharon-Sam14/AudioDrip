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
import uuid
from fastapi import FastAPI, Request, UploadFile, File, Form
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
        # Ensure user_preferences table and song columns exist (runtime migration)
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
                cursor.execute("ALTER TABLE songs ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'youtube';")
                cursor.execute("ALTER TABLE songs ADD COLUMN IF NOT EXISTS file_path VARCHAR(255);")
        except Exception as mig_err:
            print(f"Warning: Could not run database migrations: {mig_err}")
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

UPLOADS_DIR = BASE_DIR / "uploads"

DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/api/mobile/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

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


def search_local_db(q: str):
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, title, artist, artist_id, album, cover, cover_xl, duration, genre, tempo, energy, source, file_path 
                FROM songs 
                WHERE title ILIKE %s OR artist ILIKE %s OR album ILIKE %s OR genre ILIKE %s
                ORDER BY last_played_at DESC
                LIMIT 25;
            """, (f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"))
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        print("Local DB search failed:", e)
        return []

def search_jamendo(q: str):
    client_id = os.getenv("JAMENDO_CLIENT_ID", "2f01fa9c")
    if not client_id:
        return []
    try:
        r = requests.get("https://api.jamendo.com/v3.0/tracks/", params={
            "client_id": client_id,
            "format": "json",
            "search": q,
            "limit": 15
        }, timeout=5)
        if r.status_code == 200:
            results = r.json().get("results", [])
            songs = []
            for item in results:
                tags = item.get("musicgenre_tags", [])
                genre = tags[0] if tags else "Jamendo"
                song_id = f"jamendo_{item.get('id')}"
                songs.append({
                    "id": song_id,
                    "title": item.get("name"),
                    "artist": item.get("artist_name"),
                    "artist_id": 0,
                    "album": item.get("album_name") or "Jamendo Album",
                    "cover": item.get("image") or "",
                    "cover_xl": item.get("image") or "",
                    "duration": int(item.get("duration") or 0),
                    "genre": genre,
                    "source": "jamendo",
                    "file_path": item.get("audio")
                })
            return songs
    except Exception as e:
        print(f"Jamendo search failed: {e}")
    return []

def search_archive(q: str):
    try:
        url = "https://archive.org/advancedsearch.php"
        query_str = f'(title:({q}) OR creator:({q})) AND mediatype:(audio)'
        params = {
            "q": query_str,
            "fl[]": ["identifier", "title", "creator", "album", "format", "length"],
            "rows": 15,
            "output": "json"
        }
        r = requests.get(url, params=params, timeout=5)
        if r.status_code == 200:
            docs = r.json().get("response", {}).get("docs", [])
            songs = []
            for doc in docs:
                ident = doc.get("identifier")
                if not ident:
                    continue
                creator = doc.get("creator")
                artist = creator[0] if isinstance(creator, list) else (creator or "Internet Archive")
                album = doc.get("album")
                album_str = album[0] if isinstance(album, list) else (album or "Archive")
                
                length_str = doc.get("length", "0")
                duration = 0
                if length_str:
                    try:
                        if ":" in str(length_str):
                            parts = str(length_str).split(":")
                            if len(parts) == 2:
                                duration = int(parts[0]) * 60 + int(float(parts[1]))
                            elif len(parts) == 3:
                                duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(float(parts[2]))
                        else:
                            duration = int(float(length_str))
                    except Exception:
                        pass
                        
                song_id = f"archive_{ident}"
                songs.append({
                    "id": song_id,
                    "title": doc.get("title") or ident,
                    "artist": artist,
                    "artist_id": 0,
                    "album": album_str,
                    "cover": f"https://archive.org/services/img/{ident}",
                    "cover_xl": f"https://archive.org/services/img/{ident}",
                    "duration": duration,
                    "genre": "Archive",
                    "source": "archive",
                    "file_path": None
                })
            return songs
    except Exception as e:
        print(f"Archive search failed: {e}")
    return []

def search_songs_itunes(q_clean: str):
    try:
        response = requests.get(
            "https://itunes.apple.com/search",
            params={"term": q_clean, "media": "music", "limit": 25, "country": "IN"},
            timeout=10,
        )
        data = response.json()
        return [_itunes_to_song(item) for item in data.get("results", []) if item.get("trackName")]
    except Exception:
        return []

def search_songs(query, user_id: str = "anonymous"):
    if not query:
        return []
    import re
    q_clean = query.strip()
    if q_clean:
        if not re.match(r'^(songs?|music)$', q_clean, re.IGNORECASE):
            q_clean = re.sub(r'\b(songs?|music)\b', '', q_clean, flags=re.IGNORECASE)
            q_clean = re.sub(r'\s+', ' ', q_clean).strip()
    if not q_clean:
        q_clean = query.strip()

    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        future_local = pool.submit(search_local_db, q_clean)
        future_jamendo = pool.submit(search_jamendo, q_clean)
        future_archive = pool.submit(search_archive, q_clean)
        future_itunes = pool.submit(search_songs_itunes, q_clean)
        
        local_res = future_local.result() or []
        jamendo_res = future_jamendo.result() or []
        archive_res = future_archive.result() or []
        itunes_res = future_itunes.result() or []

    all_external = jamendo_res + archive_res + itunes_res
    if all_external:
        upsert_song_records(all_external)

    combined = local_res + jamendo_res + archive_res + itunes_res
    seen = set()
    deduped = []
    for s in combined:
        if s["id"] not in seen:
            seen.add(s["id"])
            deduped.append(s)
            
    return inject_cache_status(deduped, user_id=user_id)


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


INVIDIOUS_CACHE = {"instances": [], "last_fetched": 0.0}

def get_invidious_instances():
    now = time.time()
    # Cache for 1 hour (3600 seconds)
    if INVIDIOUS_CACHE["instances"] and (now - INVIDIOUS_CACHE["last_fetched"] < 3600):
        return INVIDIOUS_CACHE["instances"]
        
    default_instances = [
        "https://inv.nadeko.net",
        "https://invidious.projectsegfau.lt",
        "https://invidious.privacydev.net",
        "https://yewtu.be",
        "https://iv.ggtyler.dev",
        "https://invidious.lunar.icu",
        "https://inv.tux.im",
        "https://invidious.flokinet.to",
    ]
    
    try:
        print("[FALLBACK] Fetching live public Invidious instances from api.invidious.io...")
        r = requests.get("https://api.invidious.io/instances.json", timeout=5)
        if r.status_code == 200:
            data = r.json()
            instances = []
            for item in data:
                # Structure is [[domain, details_dict], ...]
                if isinstance(item, list) and len(item) >= 2:
                    domain = item[0]
                    details = item[1]
                    uri = details.get("uri")
                    monitor = details.get("monitor")
                    # Use instances that are HTTPS, have a URI, and monitor shows they are not down
                    if uri and monitor and not monitor.get("down", False) and monitor.get("uptime", 0) > 95:
                        instances.append(uri.rstrip('/'))
            if instances:
                print(f"[FALLBACK] Successfully fetched {len(instances)} active Invidious instances.")
                INVIDIOUS_CACHE["instances"] = instances
                INVIDIOUS_CACHE["last_fetched"] = now
                return instances
    except Exception as e:
        print(f"[FALLBACK] Failed to fetch live Invidious instances: {e}. Using defaults.")
        
    INVIDIOUS_CACHE["instances"] = default_instances
    INVIDIOUS_CACHE["last_fetched"] = now
    return default_instances


def get_audio_from_invidious(query: str):
    instances = get_invidious_instances()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    for instance in instances:
        instance = instance.rstrip('/')
        try:
            search_url = f"{instance}/api/v1/search"
            print(f"[FALLBACK] Querying Invidious search: {search_url} for '{query}'")
            r = requests.get(search_url, params={"q": query, "type": "video"}, headers=headers, timeout=5)
            if r.status_code != 200:
                print(f"[FALLBACK] Invidious search failed for {instance} with status code: {r.status_code}")
                continue
            results = r.json()
            if not results or not isinstance(results, list):
                print(f"[FALLBACK] Invidious search returned empty or invalid results for {instance}")
                continue
            video_id = results[0].get("videoId")
            if not video_id:
                print(f"[FALLBACK] Invidious search result lacks videoId on {instance}")
                continue
            
            video_url = f"{instance}/api/v1/videos/{video_id}"
            print(f"[FALLBACK] Fetching Invidious video streams from: {video_url}")
            r_video = requests.get(video_url, headers=headers, timeout=5)
            if r_video.status_code != 200:
                print(f"[FALLBACK] Invidious video fetch failed for {instance} with status code: {r_video.status_code}")
                continue
            video_data = r_video.json()
            adaptive = video_data.get("adaptiveFormats", [])
            audio_formats = [f for f in adaptive if f.get("type", "").startswith("audio/")]
            if not audio_formats:
                print(f"[FALLBACK] No audio streams found in adaptiveFormats on {instance}")
                continue
            
            audio_formats.sort(key=lambda x: int(x.get("bitrate") or 0), reverse=True)
            best_audio = audio_formats[0]
            stream_url = best_audio.get("url")
            if not stream_url:
                print(f"[FALLBACK] Best audio format lacks stream URL on {instance}")
                continue
            
            if "local=true" not in stream_url:
                if "?" in stream_url:
                    stream_url += "&local=true"
                else:
                    stream_url += "?local=true"
            
            print(f"[FALLBACK] Invidious success: found stream URL via {instance}")
            return {
                "source": "invidious",
                "url": stream_url,
                "title": results[0].get("title", "Audio Stream"),
                "videoId": video_id,
                "instance": instance
            }
        except Exception as e:
            print(f"[FALLBACK] Invidious fallback failed on {instance}: {e}")
            continue
    return None


def get_audio_from_piped(query: str):
    instances = [
        "https://pipedapi.kavin.rocks",
        "https://pipedapi.lunar.icu",
        "https://pipedapi.privacydev.net",
        "https://pipedapi.projectsegfau.lt",
        "https://pipedapi.tokyo.projectsegfau.lt",
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    for instance in instances:
        instance = instance.rstrip('/')
        try:
            search_url = f"{instance}/search"
            print(f"[FALLBACK] Querying Piped search: {search_url} for '{query}'")
            r = requests.get(search_url, params={"q": query, "filter": "videos"}, headers=headers, timeout=5)
            if r.status_code != 200:
                print(f"[FALLBACK] Piped search failed for {instance} with status code: {r.status_code}")
                continue
            data = r.json()
            items = data.get("items", [])
            if not items:
                print(f"[FALLBACK] Piped search returned no items on {instance}")
                continue
            video = items[0]
            video_url = video.get("url", "")
            if "v=" not in video_url:
                print(f"[FALLBACK] Piped search result lacks video ID on {instance}")
                continue
            video_id = video_url.split("v=")[-1]
            if not video_id:
                print(f"[FALLBACK] Empty video ID extracted on {instance}")
                continue
            
            stream_url = f"{instance}/streams/{video_id}"
            print(f"[FALLBACK] Fetching Piped streams from: {stream_url}")
            r_stream = requests.get(stream_url, headers=headers, timeout=5)
            if r_stream.status_code != 200:
                print(f"[FALLBACK] Piped stream fetch failed for {instance} with status code: {r_stream.status_code}")
                continue
            stream_data = r_stream.json()
            audio_streams = stream_data.get("audioStreams", [])
            if not audio_streams:
                print(f"[FALLBACK] No audio streams found in Piped response on {instance}")
                continue
            
            best_audio = audio_streams[0]
            url = best_audio.get("url")
            if url:
                print(f"[FALLBACK] Piped success: found stream URL via {instance}")
                return {
                    "source": "piped",
                    "url": url,
                    "title": video.get("title", "Audio Stream"),
                    "videoId": video_id,
                    "instance": instance
                }
        except Exception as e:
            print(f"[FALLBACK] Piped fallback failed on {instance}: {e}")
            continue
    return None


def get_audio_from_jamendo(query: str):
    client_id = os.getenv("JAMENDO_CLIENT_ID", "2f01fa9c")
    if not client_id:
        return None
    try:
        url = "https://api.jamendo.com/v3.0/tracks/"
        print(f"[FALLBACK] Querying Jamendo API for '{query}'...")
        r = requests.get(url, params={
            "client_id": client_id,
            "format": "json",
            "search": query,
            "limit": 1
        }, timeout=5)
        if r.status_code == 200:
            data = r.json()
            results = data.get("results", [])
            if results:
                track = results[0]
                stream_url = track.get("audio")
                if stream_url:
                    print(f"[FALLBACK] Jamendo success: found stream URL '{stream_url}'")
                    return {
                        "source": "jamendo",
                        "url": stream_url,
                        "title": track.get("name", "Audio Stream"),
                        "videoId": str(track.get("id", "jamendo_track")),
                        "instance": "jamendo.com"
                    }
            print("[FALLBACK] Jamendo returned no matching tracks.")
    except Exception as e:
        print(f"[FALLBACK] Jamendo query failed: {e}")
    return None


def get_audio_fallback(query: str):
    # Try Jamendo Music API first
    res = get_audio_from_jamendo(query)
    if res:
        return res
    res = get_audio_from_invidious(query)
    if res:
        return res
    return get_audio_from_piped(query)


def extract_video_info(query_or_url: str, is_download: bool = False, song_id: str = None):
    cookie_path = BASE_DIR / "cookies.txt"
    
    # Attempt 1: Without cookies using mobile clients (extremely resilient for public audio)
    ydl_opts_nocookies = {
        "format": "bestaudio[ext=m4a]/best",
        "noplaylist": True,
        "extractor_args": {
            "youtube": {
                "player_client": ["tv_downgraded", "ios", "android", "web_embedded"]
            }
        }
    }
    if is_download and song_id:
        ydl_opts_nocookies["outtmpl"] = str(CACHE_DIR / f"{song_id}.%(ext)s")
        ydl_opts_nocookies["quiet"] = True
    else:
        ydl_opts_nocookies["quiet"] = False

    try:
        print("[YT-DLP] Attempt 1: Fetching stream without cookies (emulating mobile)...")
        with yt_dlp.YoutubeDL(ydl_opts_nocookies) as ydl:
            if is_download:
                ydl.download([query_or_url])
                return {"status": "downloaded"}
            else:
                info = ydl.extract_info(query_or_url, download=False)
                return info
    except Exception as e:
        print(f"[YT-DLP] Attempt 1 failed: {e}")
        
    # Attempt 2: Fallback with cookies using TV/embedded players
    if cookie_path.exists():
        ydl_opts_cookies = {
            "format": "bestaudio[ext=m4a]/best",
            "noplaylist": True,
            "cookiefile": str(cookie_path),
            "extractor_args": {
                "youtube": {
                    "player_client": ["tv_downgraded", "web_embedded"]
                }
            }
        }
        if is_download and song_id:
            ydl_opts_cookies["outtmpl"] = str(CACHE_DIR / f"{song_id}.%(ext)s")
            ydl_opts_cookies["quiet"] = True
        else:
            ydl_opts_cookies["quiet"] = False
            
        try:
            print("[YT-DLP] Attempt 2: Fetching stream WITH cookies (emulating TV/embedded)...")
            with yt_dlp.YoutubeDL(ydl_opts_cookies) as ydl:
                if is_download:
                    ydl.download([query_or_url])
                    return {"status": "downloaded"}
                else:
                    info = ydl.extract_info(query_or_url, download=False)
                    return info
        except Exception as e2:
            print(f"[YT-DLP] Attempt 2 failed: {e2}")
            raise e2
    else:
        raise e


def download_task(song_id, artist, title):
    clear_cache_if_needed()
    if is_song_cached(song_id):
        return

    # Direct download for Jamendo and Archive
    stream_url = None
    if song_id.startswith("jamendo_") or song_id.startswith("archive_"):
        if song_id.startswith("jamendo_"):
            song = get_song_by_id(song_id)
            if song and song.get("file_path") and song.get("file_path").startswith("http"):
                stream_url = song.get("file_path")
            else:
                track_id = song_id.replace("jamendo_", "")
                client_id = os.getenv("JAMENDO_CLIENT_ID", "2f01fa9c")
                try:
                    r = requests.get("https://api.jamendo.com/v3.0/tracks/", params={
                        "client_id": client_id,
                        "format": "json",
                        "id": track_id
                    }, timeout=5)
                    if r.status_code == 200:
                        res = r.json().get("results", [])
                        if res:
                            stream_url = res[0].get("audio")
                except Exception:
                    pass
        elif song_id.startswith("archive_"):
            ident = song_id.replace("archive_", "")
            try:
                r_meta = requests.get(f"https://archive.org/metadata/{ident}", timeout=5)
                if r_meta.status_code == 200:
                    files = r_meta.json().get("files", [])
                    mp3_files = [f.get("name") for f in files if f.get("name", "").endswith(".mp3")]
                    if mp3_files:
                        stream_url = f"https://archive.org/download/{ident}/{mp3_files[0]}"
            except Exception:
                pass

        if stream_url:
            try:
                ext = "mp3"
                r = requests.get(stream_url, stream=True, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
                if r.status_code == 200:
                    content_type = r.headers.get("Content-Type", "")
                    if "webm" in content_type:
                        ext = "webm"
                    elif "ogg" in content_type or "opus" in content_type:
                        ext = "opus"
                    
                    filepath = CACHE_DIR / f"{song_id}.{ext}"
                    with open(filepath, "wb") as f:
                        for chunk in r.iter_content(chunk_size=1024 * 16):
                            f.write(chunk)
                    print(f"[DOWNLOAD] Successfully cached external song via stream to {filepath}")
                    clear_cache_if_needed()
                    return
            except Exception as e:
                print(f"[DOWNLOAD] Caching Jamendo/Archive stream failed: {e}")

    # Fallback to standard flow for YouTube
    query = f"{artist} - {title} audio"
    try:
        extract_video_info(f"ytsearch1:{query}", is_download=True, song_id=song_id)
        clear_cache_if_needed()
    except Exception as exc:
        print(f"[DOWNLOAD] yt-dlp download failed on Render: {exc}. Trying fallback...")
        try:
            fallback = get_audio_fallback(query)
            if fallback:
                stream_url = fallback["url"]
                ext = "m4a"
                r = requests.get(stream_url, stream=True, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
                if r.status_code == 200:
                    content_type = r.headers.get("Content-Type", "")
                    if "webm" in content_type:
                        ext = "webm"
                    elif "ogg" in content_type or "opus" in content_type:
                        ext = "opus"
                    
                    filepath = CACHE_DIR / f"{song_id}.{ext}"
                    with open(filepath, "wb") as f:
                        for chunk in r.iter_content(chunk_size=1024 * 16):
                            f.write(chunk)
                    print(f"[DOWNLOAD] Successfully cached song via fallback to {filepath}")
                    clear_cache_if_needed()
                else:
                    print(f"[DOWNLOAD] Fallback download HTTP error: {r.status_code}")
            else:
                print("[DOWNLOAD] Fallback could not find stream URL")
        except Exception as e:
            print(f"[DOWNLOAD] Fallback download failed: {e}")


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

    base_url = str(request.base_url).rstrip("/")

    # Uploaded playback
    if song_id.startswith("uploaded_"):
        song = get_song_by_id(song_id)
        if song and song.get("file_path"):
            fp = song.get("file_path")
            if fp.startswith("uploads/"):
                fp = fp[len("uploads/"):]
            return JSONResponse({"source": "uploaded", "url": f"{base_url}/api/mobile/uploads/{fp}"})

    # Jamendo playback
    if song_id.startswith("jamendo_"):
        song = get_song_by_id(song_id)
        stream_url = ""
        if song and song.get("file_path"):
            stream_url = song.get("file_path")
        else:
            track_id = song_id.replace("jamendo_", "")
            client_id = os.getenv("JAMENDO_CLIENT_ID", "2f01fa9c")
            try:
                r = requests.get("https://api.jamendo.com/v3.0/tracks/", params={
                    "client_id": client_id,
                    "format": "json",
                    "id": track_id
                }, timeout=5)
                if r.status_code == 200:
                    res = r.json().get("results", [])
                    if res:
                        stream_url = res[0].get("audio")
            except Exception:
                pass
        if stream_url:
            return JSONResponse({"source": "jamendo", "url": stream_url})

    # Internet Archive playback
    if song_id.startswith("archive_"):
        ident = song_id.replace("archive_", "")
        try:
            r_meta = requests.get(f"https://archive.org/metadata/{ident}", timeout=5)
            if r_meta.status_code == 200:
                files = r_meta.json().get("files", [])
                mp3_files = [f.get("name") for f in files if f.get("name", "").endswith(".mp3")]
                if mp3_files:
                    filename = mp3_files[0]
                    stream_url = f"https://archive.org/download/{ident}/{filename}"
                    return JSONResponse({"source": "archive", "url": stream_url})
        except Exception as e:
            print(f"Archive stream resolution failed: {e}")

    # Standard YouTube Playback Flow
    query = f"{artist} - {title} audio"
    try:
        info = extract_video_info(f"ytsearch1:{query}", is_download=False)
        video = info["entries"][0] if "entries" in info else info
        http_headers = video.get("http_headers", {})
        proxy_url = f"{base_url}/api/mobile/stream_proxy?url={quote(video['url'])}&headers={quote(json.dumps(http_headers))}"
        return JSONResponse({"source": "youtube", "url": proxy_url, "direct_url": video["url"], "headers": http_headers})
    except Exception as exc:
        print(f"[PLAYBACK] yt-dlp extraction failed: {exc}. Trying fallback...")
        try:
            fallback = get_audio_fallback(query)
            if fallback:
                print(f"[PLAYBACK] Fallback succeeded with {fallback['source']} instance {fallback['instance']}")
                return JSONResponse({
                    "source": fallback["source"],
                    "url": fallback["url"],
                    "direct_url": fallback["url"],
                    "headers": {}
                })
            else:
                print("[PLAYBACK] Fallback returned no stream URL")
        except Exception as e:
            print(f"[PLAYBACK] Fallback logic failed: {e}")
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


@app.get("/api/mobile/health")
def mobile_health():
    return JSONResponse({"status": "ok", "server": "AudioDrip", "version": "3.0", "timestamp": int(time.time())})


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


@app.post("/api/mobile/upload")
async def mobile_upload(
    audio: UploadFile = File(...),
    cover: Optional[UploadFile] = File(None),
    title: str = Form(...),
    artist: str = Form("Unknown"),
    album: str = Form("Single"),
    genre: str = Form("Music")
):
    try:
        song_id = f"uploaded_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        audio_ext = audio.filename.split(".")[-1] if "." in audio.filename else "mp3"
        audio_filename = f"{song_id}.{audio_ext}"
        audio_path = UPLOADS_DIR / audio_filename
        
        with open(audio_path, "wb") as f:
            f.write(await audio.read())
            
        cover_url = ""
        if cover:
            cover_ext = cover.filename.split(".")[-1] if "." in cover.filename else "jpg"
            cover_filename = f"{song_id}_cover.{cover_ext}"
            cover_path = UPLOADS_DIR / cover_filename
            with open(cover_path, "wb") as f:
                f.write(await cover.read())
            cover_url = f"/api/mobile/uploads/{cover_filename}"
            
        song_data = {
            "id": song_id,
            "title": title or "Unknown",
            "artist": artist or "Unknown",
            "artist_id": 0,
            "album": album or "Single",
            "cover": cover_url,
            "cover_xl": cover_url,
            "duration": 0,
            "genre": genre or "Music",
            "source": "uploaded",
            "file_path": f"uploads/{audio_filename}"
        }
        
        upsert_song_records([song_data])
        return JSONResponse({"status": "success", "song": song_data})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/mobile/uploaded")
def mobile_uploaded(user_id: str = "anonymous"):
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, title, artist, artist_id, album, cover, cover_xl, duration, genre, tempo, energy, source, file_path 
                FROM songs 
                WHERE source = 'uploaded'
                ORDER BY created_at DESC;
            """)
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            songs = [dict(zip(columns, row)) for row in rows]
            return JSONResponse(inject_cache_status(songs, user_id=user_id))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


class AIChatRequest(BaseModel):
    message: str
    history: List[dict] = []
    user_id: str = "anonymous"


@app.post("/api/mobile/ai_chat")
def mobile_ai_chat(req: AIChatRequest):
    message = req.message.strip()
    if not message:
        return JSONResponse({"error": "Message cannot be empty"}, status_code=400)
        
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return JSONResponse({"reply": "I'm sorry, the AI Assistant is currently disabled because GROQ_API_KEY is not configured.", "recommendations": []})
        
    try:
        system_prompt = (
            "You are AudioDrip's AI Assistant. The user wants to discuss music, get recommendations, "
            "or generate playlists. Be helpful, concise, friendly, and cool. "
            "If the user asks for music recommendations or to play something, suggest some artists/songs. "
            "Always respond in clean markdown format."
        )
        
        messages = [{"role": "system", "content": system_prompt}]
        for msg in req.history[-10:]:
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
        messages.append({"role": "user", "content": message})
        
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": messages,
            "temperature": 0.7,
        }
        
        resp = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        reply_text = resp.json()["choices"][0]["message"]["content"]
        
        return JSONResponse({"reply": reply_text})
    except Exception as e:
        print(f"Error calling Groq chat: {e}")
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
