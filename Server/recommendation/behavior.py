from db import get_db_cursor
from .storage import apply_decay_if_needed, prune_transitions

def _ensure_song_exists(cursor, song_id):
    """
    Ensures that a song ID exists in the database before creating foreign keys.
    """
    cursor.execute(
        "INSERT INTO songs (id, title, artist) VALUES (%s, 'Unknown Song', 'Unknown Artist') ON CONFLICT (id) DO NOTHING;",
        (song_id,)
    )

def update_transition(previous_song_id, current_song_id):
    previous_song_id = str(previous_song_id or "").strip()
    current_song_id = str(current_song_id or "").strip()
    if not previous_song_id or not current_song_id or previous_song_id == current_song_id:
        return

    # Apply decay check prior to updating
    apply_decay_if_needed()

    with get_db_cursor(commit=True) as cursor:
        # Ensure both source and target exist in songs catalog
        _ensure_song_exists(cursor, previous_song_id)
        _ensure_song_exists(cursor, current_song_id)
        
        # Update current song last played time (important for pruning order)
        cursor.execute(
            "UPDATE songs SET last_played_at = CURRENT_TIMESTAMP WHERE id = %s;",
            (current_song_id,)
        )

        # Upsert the transition count
        cursor.execute(
            """
            INSERT INTO playback_transitions (source_id, target_id, count)
            VALUES (%s, %s, 1)
            ON CONFLICT (source_id, target_id)
            DO UPDATE SET count = playback_transitions.count + 1;
            """,
            (previous_song_id, current_song_id)
        )

    # Prune transitions according to constraints
    prune_transitions()

def get_behavior_recommendations(song_id, limit=5):
    song_id = str(song_id or "").strip()
    if not song_id:
        return []

    # Decay check
    apply_decay_if_needed()

    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT target_id 
            FROM playback_transitions 
            WHERE source_id = %s 
            ORDER BY count DESC, target_id ASC 
            LIMIT %s;
            """,
            (song_id, max(0, int(limit)))
        )
        rows = cursor.fetchall()
        return [row[0] for row in rows]
