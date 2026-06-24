import statistics
from db import get_db_cursor

try:
    import numpy as np
except ImportError:
    np = None

def _normalize_song(song):
    song_id = str(song.get("id", "")).strip()
    if not song_id:
        return None

    normalized = {
        "id": song_id,
        "title": song.get("title", "Unknown") or "Unknown",
        "artist": song.get("artist", "") or "",
        "artist_id": int(song.get("artist_id", 0) or 0),
        "album": song.get("album", "Single") or "Single",
        "cover": song.get("cover", "") or "",
        "cover_xl": song.get("cover_xl", "") or "",
        "duration": int(song.get("duration", 0) or 0),
        "genre": song.get("genre", "") or "",
        "source": song.get("source", "youtube") or "youtube",
        "file_path": song.get("file_path"),
    }

    tempo = song.get("tempo")
    try:
        normalized["tempo"] = float(tempo) if tempo is not None else None
    except (TypeError, ValueError):
        normalized["tempo"] = None

    energy = song.get("energy")
    try:
        normalized["energy"] = float(energy) if energy is not None else None
    except (TypeError, ValueError):
        normalized["energy"] = None

    return normalized

def _read_catalog():
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, title, artist, artist_id, album, cover, cover_xl, duration, genre, tempo, energy, source, file_path 
            FROM songs;
        """)
        rows = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in rows]

def upsert_song_records(songs):
    if not songs:
        return
        
    with get_db_cursor(commit=True) as cursor:
        for song in songs:
            if not isinstance(song, dict):
                continue
            normalized = _normalize_song(song)
            if normalized is None:
                continue

            cursor.execute("""
                INSERT INTO songs (id, title, artist, artist_id, album, cover, cover_xl, duration, genre, tempo, energy, source, file_path)
                VALUES (%(id)s, %(title)s, %(artist)s, %(artist_id)s, %(album)s, %(cover)s, %(cover_xl)s, %(duration)s, %(genre)s, %(tempo)s, %(energy)s, %(source)s, %(file_path)s)
                ON CONFLICT (id) DO UPDATE SET
                    title = COALESCE(NULLIF(EXCLUDED.title, 'Unknown'), songs.title),
                    artist = COALESCE(NULLIF(EXCLUDED.artist, ''), songs.artist),
                    artist_id = CASE WHEN EXCLUDED.artist_id > 0 THEN EXCLUDED.artist_id ELSE songs.artist_id END,
                    album = COALESCE(NULLIF(EXCLUDED.album, 'Single'), songs.album),
                    cover = COALESCE(NULLIF(EXCLUDED.cover, ''), songs.cover),
                    cover_xl = COALESCE(NULLIF(EXCLUDED.cover_xl, ''), songs.cover_xl),
                    duration = CASE WHEN EXCLUDED.duration > 0 THEN EXCLUDED.duration ELSE songs.duration END,
                    genre = COALESCE(NULLIF(EXCLUDED.genre, ''), songs.genre),
                    tempo = COALESCE(EXCLUDED.tempo, songs.tempo),
                    energy = COALESCE(EXCLUDED.energy, songs.energy),
                    source = COALESCE(NULLIF(EXCLUDED.source, ''), songs.source),
                    file_path = COALESCE(NULLIF(EXCLUDED.file_path, ''), songs.file_path);
            """, normalized)

def get_song_by_id(song_id):
    song_id = str(song_id or "").strip()
    if not song_id:
        return None
        
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, title, artist, artist_id, album, cover, cover_xl, duration, genre, tempo, energy, source, file_path 
            FROM songs 
            WHERE id = %s;
        """, (song_id,))
        row = cursor.fetchone()
        if row:
            columns = [desc[0] for desc in cursor.description]
            return dict(zip(columns, row))
    return None

def get_songs_by_ids(song_ids):
    if not song_ids:
        return []
        
    ids = [str(song_id).strip() for song_id in song_ids if song_id]
    if not ids:
        return []
        
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT id, title, artist, artist_id, album, cover, cover_xl, duration, genre, tempo, energy, source, file_path 
            FROM songs 
            WHERE id = ANY(%s);
        """, (ids,))
        rows = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        songs_by_id = {row[0]: dict(zip(columns, row)) for row in rows}
        
        # Maintain order as requested in input
        ordered_songs = []
        for song_id in ids:
            if song_id in songs_by_id:
                ordered_songs.append(songs_by_id[song_id])
        return ordered_songs

def _detect_language(song):
    text = f"{song.get('title', '')} {song.get('artist', '')} {song.get('album', '')} {song.get('genre', '')}".lower()
    for lang in ["hindi", "tamil", "telugu", "punjabi", "bengali", "malayalam", "kannada", "marathi", "korean", "spanish", "french", "english"]:
        if lang in text:
            return lang
    return "english"

def _build_feature_matrix(catalog):
    if not catalog:
        return [], []

    artists = sorted({song.get("artist", "") or "" for song in catalog})
    genres = sorted({song.get("genre", "") or "" for song in catalog})
    artist_index = {artist: idx for idx, artist in enumerate(artists)}
    genre_index = {genre: idx for idx, genre in enumerate(genres)}

    languages = ["hindi", "tamil", "telugu", "punjabi", "bengali", "malayalam", "kannada", "marathi", "korean", "spanish", "french", "english"]
    lang_index = {lang: idx for idx, lang in enumerate(languages)}

    tempos = [song["tempo"] for song in catalog if song.get("tempo") is not None]
    tempo_median = float(statistics.median(tempos)) if tempos else 0.0
    filled_tempos = [float(song["tempo"]) if song.get("tempo") is not None else tempo_median for song in catalog]
    tempo_min = min(filled_tempos) if filled_tempos else 0.0
    tempo_max = max(filled_tempos) if filled_tempos else 0.0
    tempo_range = tempo_max - tempo_min

    vectors = []
    for song, tempo_value in zip(catalog, filled_tempos):
        vector = [0.0] * (len(artists) + len(genres) + len(languages) + 2)
        vector[artist_index[song.get("artist", "") or ""]] = 1.0
        vector[len(artists) + genre_index[song.get("genre", "") or ""]] = 1.0
        
        # Add language vector component
        song_lang = _detect_language(song)
        vector[len(artists) + len(genres) + lang_index[song_lang]] = 1.0
        
        vector[-2] = 0.0 if tempo_range == 0 else (tempo_value - tempo_min) / tempo_range
        vector[-1] = float(song.get("energy") or 0.0)
        vectors.append(vector)

    if np is not None:
        return np.array(vectors, dtype=float), catalog
    return vectors, catalog

def get_similar_songs(song_id, limit=5):
    song_id = str(song_id or "").strip()
    if not song_id:
        return []

    catalog = _read_catalog()
    matrix, catalog = _build_feature_matrix(catalog)
    if (np is not None and getattr(matrix, "size", 0) == 0) or (np is None and not matrix):
        return []

    index_by_id = {song["id"]: idx for idx, song in enumerate(catalog)}
    target_index = index_by_id.get(song_id)
    if target_index is None:
        return []

    target_vector = matrix[target_index]
    if np is not None:
        target_norm = np.linalg.norm(target_vector)
    else:
        target_norm = sum(value * value for value in target_vector) ** 0.5
    if target_norm == 0:
        return []

    if np is not None:
        norms = np.linalg.norm(matrix, axis=1)
        safe_denominator = norms * target_norm
        similarities = np.divide(
            matrix @ target_vector,
            safe_denominator,
            out=np.zeros_like(norms),
            where=safe_denominator != 0,
        )
    else:
        similarities = []
        for vector in matrix:
            norm = sum(value * value for value in vector) ** 0.5
            denominator = norm * target_norm
            if denominator == 0:
                similarities.append(0.0)
            else:
                dot_product = sum(left * right for left, right in zip(vector, target_vector))
                similarities.append(dot_product / denominator)

    ranked = []
    for idx, similarity in enumerate(similarities):
        candidate_id = catalog[idx]["id"]
        if candidate_id == song_id:
            continue
        ranked.append((candidate_id, float(similarity)))

    ranked.sort(key=lambda item: (-item[1], item[0]))
    return [candidate_id for candidate_id, _ in ranked[: max(0, int(limit))]]

def get_semantic_similar_songs(song_id, limit=5):
    song_id = str(song_id or "").strip()
    if not song_id:
        return []
        
    try:
        with get_db_cursor() as cursor:
            # Fetch target song's embedding
            cursor.execute("SELECT embedding FROM songs WHERE id = %s;", (song_id,))
            row = cursor.fetchone()
            if not row or not row[0]:
                return []
            target_embedding = row[0]
            
            # Query cosine similarity using PL/pgSQL function
            cursor.execute("""
                SELECT id FROM songs 
                WHERE embedding IS NOT NULL AND id != %s 
                ORDER BY cosine_similarity(embedding, %s) DESC 
                LIMIT %s;
            """, (song_id, target_embedding, max(0, int(limit))))
            rows = cursor.fetchall()
            return [r[0] for r in rows]
    except Exception as e:
        print(f"Error getting semantic similar songs: {e}")
        return []
