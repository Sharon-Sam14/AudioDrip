import math
from datetime import datetime, timedelta, timezone
from db import get_db_cursor

MAX_STORED_SONGS = 50
MAX_TRANSITIONS_PER_SONG = 3
DECAY_INTERVAL = timedelta(days=7)
DECAY_FACTOR = 0.5

def _utc_now():
    return datetime.now(timezone.utc)

def _to_iso8601(value):
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def _from_iso8601(value):
    if not value:
        return _utc_now()
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)

def apply_decay_if_needed():
    now = _utc_now()
    with get_db_cursor(commit=True) as cursor:
        # 1. Fetch last_decay_at
        cursor.execute("SELECT value FROM system_settings WHERE key = 'last_decay_at';")
        row = cursor.fetchone()
        if not row:
            # Set initial value if not present
            last_decay_at_str = _to_iso8601(now)
            cursor.execute(
                "INSERT INTO system_settings (key, value) VALUES ('last_decay_at', %s) ON CONFLICT (key) DO NOTHING;",
                (last_decay_at_str,)
            )
            return
            
        last_decay_at = _from_iso8601(row[0])
        elapsed = now - last_decay_at
        intervals = int(elapsed.total_seconds() // DECAY_INTERVAL.total_seconds())
        
        if intervals <= 0:
            return

        # 2. Update transitions with decay multiplier
        multiplier = DECAY_FACTOR ** intervals
        cursor.execute(
            "UPDATE playback_transitions SET count = FLOOR(count * %s);",
            (multiplier,)
        )
        # 3. Clean up zero or negative counts
        cursor.execute("DELETE FROM playback_transitions WHERE count <= 0;")
        
        # 4. Save new decay timestamp
        new_decay_at = last_decay_at + (DECAY_INTERVAL * intervals)
        cursor.execute(
            "UPDATE system_settings SET value = %s WHERE key = 'last_decay_at';",
            (_to_iso8601(new_decay_at),)
        )
        print(f"Decay applied for {intervals} interval(s). Multiplier: {multiplier}")

def prune_transitions():
    """
    Prunes database transitions:
    1. Keeps only the top 3 target transitions per source song (ordered by count desc).
    2. Evicts transitions for songs that are not among the 50 most recently played.
    """
    with get_db_cursor(commit=True) as cursor:
        # Step 1: Delete transitions that are NOT in the top 3 for each source_id
        cursor.execute(
            f"""
            DELETE FROM playback_transitions
            WHERE (source_id, target_id) NOT IN (
                SELECT source_id, target_id
                FROM (
                    SELECT source_id, target_id,
                           ROW_NUMBER() OVER (
                               PARTITION BY source_id 
                               ORDER BY count DESC, target_id ASC
                           ) as rn
                    FROM playback_transitions
                ) t
                WHERE rn <= {MAX_TRANSITIONS_PER_SONG}
            );
            """
        )

        # Step 2: Get the top 50 most recently played song IDs (that have transitions)
        # We look at songs ordered by last_played_at
        cursor.execute(
            f"""
            DELETE FROM playback_transitions
            WHERE source_id NOT IN (
                SELECT id FROM songs
                ORDER BY last_played_at DESC
                LIMIT {MAX_STORED_SONGS}
            ) OR target_id NOT IN (
                SELECT id FROM songs
                ORDER BY last_played_at DESC
                LIMIT {MAX_STORED_SONGS}
            );
            """
        )
