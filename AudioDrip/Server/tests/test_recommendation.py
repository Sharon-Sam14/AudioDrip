import importlib
import os
import unittest
import time
from datetime import datetime, timedelta, timezone


class RecommendationModuleTests(unittest.TestCase):
    def setUp(self):
        # Store original DB_NAME and set to audiodrip_test
        self.orig_db_name = os.environ.get("DB_NAME")
        os.environ["DB_NAME"] = "audiodrip_test"

        # Make sure the test database exists and has schema created
        import init_db
        import psycopg2
        importlib.reload(init_db)
        
        init_db.create_database()
        
        # Connect to newly created db and run schema setup
        conn = psycopg2.connect(
            user=init_db.DB_USER,
            password=init_db.DB_PASSWORD,
            host=init_db.DB_HOST,
            port=init_db.DB_PORT,
            dbname=init_db.DB_NAME
        )
        init_db.setup_schema(conn)
        conn.close()

        # Reload db.py connection pool to bind to the test DB
        import db
        if db._pool is not None:
            try:
                db._pool.closeall()
            except Exception:
                pass
            db._pool = None
        
        self.db = importlib.reload(db)

        # Import/Reload recommendation engine submodules
        import recommendation.behavior as behavior
        import recommendation.content as content
        import recommendation.engine as engine
        import recommendation.storage as storage

        self.storage = importlib.reload(storage)
        self.content = importlib.reload(content)
        self.behavior = importlib.reload(behavior)
        self.engine = importlib.reload(engine)

        # Truncate tables for a clean test environment state
        with self.db.get_db_cursor(commit=True) as cursor:
            cursor.execute("TRUNCATE TABLE songs CASCADE;")
            cursor.execute("TRUNCATE TABLE playlists CASCADE;")
            cursor.execute("TRUNCATE TABLE system_settings CASCADE;")

    def tearDown(self):
        # Close active connection pool
        if self.db._pool is not None:
            try:
                self.db._pool.closeall()
            except Exception:
                pass
            self.db._pool = None

        # Restore original DB_NAME setting
        if self.orig_db_name:
            os.environ["DB_NAME"] = self.orig_db_name
        else:
            os.environ.pop("DB_NAME", None)

        # Reload db module so the main app connects back to the dev DB
        import db
        importlib.reload(db)

    def seed_catalog(self):
        songs = [
            {
                "id": "song_1",
                "title": "Alpha",
                "artist": "Artist A",
                "genre": "synthwave",
                "tempo": 170,
                "energy": 0.8,
                "cover": "",
                "cover_xl": "",
                "album": "Album A",
                "duration": 210,
            },
            {
                "id": "song_2",
                "title": "Beta",
                "artist": "Artist A",
                "genre": "synthwave",
                "tempo": 168,
                "energy": 0.75,
                "cover": "",
                "cover_xl": "",
                "album": "Album A",
                "duration": 200,
            },
            {
                "id": "song_3",
                "title": "Gamma",
                "artist": "Artist B",
                "genre": "rock",
                "tempo": 110,
                "energy": 0.4,
                "cover": "",
                "cover_xl": "",
                "album": "Album B",
                "duration": 195,
            },
            {
                "id": "song_4",
                "title": "Delta",
                "artist": "Artist C",
                "genre": "ambient",
                "tempo": 90,
                "energy": 0.1,
                "cover": "",
                "cover_xl": "",
                "album": "Album C",
                "duration": 220,
            },
        ]
        self.content.upsert_song_records(songs)

    def test_update_transition_keeps_top_three_and_caps_song_history(self):
        self.behavior.update_transition("song_a", "song_b")
        self.behavior.update_transition("song_a", "song_c")
        self.behavior.update_transition("song_a", "song_d")
        self.behavior.update_transition("song_a", "song_e")
        self.behavior.update_transition("song_a", "song_b")

        with self.db.get_db_cursor() as cursor:
            cursor.execute(
                "SELECT target_id FROM playback_transitions WHERE source_id = 'song_a' ORDER BY count DESC, target_id ASC;"
            )
            targets = [row[0] for row in cursor.fetchall()]

        self.assertEqual(targets, ["song_b", "song_c", "song_d"])

        # Feed 52 transitions. Sleep a tiny bit to guarantee monotonic timestamps
        for index in range(52):
            self.behavior.update_transition(f"source_{index}", f"target_{index}")
            time.sleep(0.002)

        with self.db.get_db_cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM playback_transitions WHERE source_id = 'source_0';")
            count = cursor.fetchone()[0]
            
        self.assertEqual(count, 0)

    def test_decay_removes_zero_value_transitions(self):
        old_time = (datetime.now(timezone.utc) - timedelta(days=7)).replace(microsecond=0)
        old_timestamp = old_time.isoformat().replace("+00:00", "Z")

        with self.db.get_db_cursor(commit=True) as cursor:
            # Seed decay timestamp
            cursor.execute(
                "INSERT INTO system_settings (key, value) VALUES ('last_decay_at', %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;",
                (old_timestamp,)
            )
            # Seed songs catalog
            cursor.execute("INSERT INTO songs (id, title, artist) VALUES ('song_a', 'Alpha', 'Artist A') ON CONFLICT (id) DO NOTHING;")
            cursor.execute("INSERT INTO songs (id, title, artist) VALUES ('song_b', 'Beta', 'Artist B') ON CONFLICT (id) DO NOTHING;")
            cursor.execute("INSERT INTO songs (id, title, artist) VALUES ('song_c', 'Gamma', 'Artist C') ON CONFLICT (id) DO NOTHING;")
            
            # Seed transitions
            cursor.execute("INSERT INTO playback_transitions (source_id, target_id, count) VALUES ('song_a', 'song_b', 10) ON CONFLICT DO NOTHING;")
            cursor.execute("INSERT INTO playback_transitions (source_id, target_id, count) VALUES ('song_a', 'song_c', 1) ON CONFLICT DO NOTHING;")

        recommendations = self.behavior.get_behavior_recommendations("song_a")
        self.assertEqual(recommendations, ["song_b"])

        with self.db.get_db_cursor() as cursor:
            cursor.execute("SELECT target_id, count FROM playback_transitions WHERE source_id = 'song_a';")
            rows = cursor.fetchall()
            transitions = {row[0]: row[1] for row in rows}

        self.assertEqual(transitions.get("song_b"), 5)
        self.assertNotIn("song_c", transitions)

    def test_content_similarity_and_up_next_prioritize_behavior(self):
        self.seed_catalog()
        self.behavior.update_transition("song_1", "song_3")
        self.behavior.update_transition("song_1", "song_3")
        self.behavior.update_transition("song_1", "song_2")

        similar = self.content.get_similar_songs("song_1")
        self.assertEqual(similar[0], "song_2")
        self.assertNotIn("song_1", similar)

        combined = self.engine.get_recommendations("song_1")
        self.assertEqual(combined["behavior_based"], ["song_3", "song_2"])
        self.assertNotIn("song_3", combined["content_based"])

        up_next = self.engine.get_up_next("song_1", limit=3)
        self.assertEqual(up_next[0], {"song_id": "song_3", "reason": "behavior"})
        self.assertEqual(up_next[1], {"song_id": "song_2", "reason": "behavior"})
        self.assertTrue(all(entry["song_id"] != "song_1" for entry in up_next))


if __name__ == "__main__":
    unittest.main()
