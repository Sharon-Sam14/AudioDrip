import os
import json
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Database connection settings
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "audiodrip")

def create_database():
    # Connect to postgres default database first to create the audiodrip db if it doesn't exist
    conn = psycopg2.connect(
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
        dbname="postgres"
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()
    
    try:
        cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{DB_NAME}';")
        exists = cursor.fetchone()
        if not exists:
            print(f"Database '{DB_NAME}' does not exist. Creating...")
            cursor.execute(f"CREATE DATABASE {DB_NAME};")
            print(f"Database '{DB_NAME}' created successfully.")
        else:
            print(f"Database '{DB_NAME}' already exists.")
    except Exception as e:
        print(f"Error checking or creating database: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()

def setup_schema(conn):
    cursor = conn.cursor()
    try:
        print("Creating tables if they do not exist...")
        
        # 0. Users Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 1. Songs Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS songs (
                id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                artist VARCHAR(255) NOT NULL,
                artist_id BIGINT DEFAULT 0,
                album VARCHAR(255) DEFAULT 'Single',
                cover VARCHAR(1024) DEFAULT '',
                cover_xl VARCHAR(1024) DEFAULT '',
                duration INTEGER DEFAULT 0,
                genre VARCHAR(100) DEFAULT 'Music',
                tempo DOUBLE PRECISION,
                energy DOUBLE PRECISION,
                last_played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Ensure embedding column exists
        cursor.execute("ALTER TABLE songs ADD COLUMN IF NOT EXISTS embedding DOUBLE PRECISION[];")
        
        # Index on last_played_at for faster eviction lookups
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_songs_last_played ON songs(last_played_at DESC);")

        # 2. Playback Transitions Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playback_transitions (
                source_id VARCHAR(50) REFERENCES songs(id) ON DELETE CASCADE,
                target_id VARCHAR(50) REFERENCES songs(id) ON DELETE CASCADE,
                count INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (source_id, target_id)
            );
        """)

        # 3. System Settings Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_settings (
                key VARCHAR(100) PRIMARY KEY,
                value VARCHAR(255) NOT NULL
            );
        """)

        # 4. Liked Songs Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS liked_songs (
                song_id VARCHAR(50) REFERENCES songs(id) ON DELETE CASCADE,
                liked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (song_id)
            );
        """)
        cursor.execute("ALTER TABLE liked_songs ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) DEFAULT 'anonymous';")
        try:
            cursor.execute("ALTER TABLE liked_songs DROP CONSTRAINT IF EXISTS liked_songs_pkey;")
            cursor.execute("ALTER TABLE liked_songs ADD CONSTRAINT liked_songs_pkey PRIMARY KEY (user_id, song_id);")
        except Exception:
            pass

        # 5. Playlists Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playlists (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute("ALTER TABLE playlists ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) DEFAULT 'anonymous';")

        # 6. Playlist Songs Relation Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playlist_songs (
                playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
                song_id VARCHAR(50) REFERENCES songs(id) ON DELETE CASCADE,
                added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (playlist_id, song_id)
            );
        """)

        # 7. User Interactions Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_interactions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL DEFAULT 'anonymous',
                song_id VARCHAR(50) REFERENCES songs(id) ON DELETE CASCADE,
                interaction_type VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 9. User Preferences Table (languages + genres)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id VARCHAR(255) PRIMARY KEY,
                languages TEXT[] DEFAULT '{}',
                genres TEXT[] DEFAULT '{}',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 8. Cosine Similarity PL/pgSQL Function
        cursor.execute("""
            CREATE OR REPLACE FUNCTION cosine_similarity(a DOUBLE PRECISION[], b DOUBLE PRECISION[])
            RETURNS DOUBLE PRECISION AS $$
            DECLARE
                dot_product DOUBLE PRECISION := 0;
                norm_a DOUBLE PRECISION := 0;
                norm_b DOUBLE PRECISION := 0;
                i INTEGER;
            BEGIN
                IF a IS NULL OR b IS NULL OR cardinality(a) = 0 OR cardinality(a) != cardinality(b) THEN
                    RETURN 0;
                END IF;
                FOR i IN 1..cardinality(a) LOOP
                    dot_product := dot_product + (a[i] * b[i]);
                    norm_a := norm_a + (a[i] * a[i]);
                    norm_b := norm_b + (b[i] * b[i]);
                END LOOP;
                IF norm_a = 0 OR norm_b = 0 THEN
                    RETURN 0;
                END IF;
                RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
            END;
            $$ LANGUAGE plpgsql IMMUTABLE;
        """)
        
        conn.commit()
        print("Schema setup complete.")
    except Exception as e:
        conn.rollback()
        print(f"Error setting up schema: {e}")
        raise e
    finally:
        cursor.close()

def migrate_data(conn):
    cursor = conn.cursor()
    try:
        # Check if we have data already
        cursor.execute("SELECT COUNT(*) FROM songs;")
        count = cursor.fetchone()[0]
        if count > 0:
            print("Songs already exist in PostgreSQL. Skipping data migration to prevent overwriting.")
            return

        print("Starting data migration from local JSON files...")
        
        # Load songs.json
        songs_path = BASE_DIR / "data" / "songs.json"
        imported_song_ids = set()
        if songs_path.exists():
            print(f"Reading songs from {songs_path}...")
            with open(songs_path, "r", encoding="utf-8") as f:
                songs = json.load(f)
                
            for song in songs:
                # Sanitize fields
                song_id = str(song.get("id")).strip()
                if not song_id:
                    continue
                
                cursor.execute("""
                    INSERT INTO songs (id, title, artist, artist_id, album, cover, cover_xl, duration, genre, tempo, energy)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                """, (
                    song_id,
                    song.get("title", "Unknown"),
                    song.get("artist", "Unknown"),
                    song.get("artist_id", 0),
                    song.get("album", "Single"),
                    song.get("cover", ""),
                    song.get("cover_xl", ""),
                    song.get("duration", 0),
                    song.get("genre", "Music"),
                    song.get("tempo"),
                    song.get("energy")
                ))
                imported_song_ids.add(song_id)
            print(f"Successfully migrated {len(imported_song_ids)} songs.")
        else:
            print("No songs.json found to migrate.")

        # Load tally_counter.json
        tally_path = BASE_DIR / "data" / "tally_counter.json"
        if tally_path.exists():
            print(f"Reading transitions from {tally_path}...")
            with open(tally_path, "r", encoding="utf-8") as f:
                tally = json.load(f)
            
            # Migrate system settings (last_decay_at)
            meta = tally.get("_meta", {})
            last_decay_at = meta.get("last_decay_at")
            if last_decay_at:
                cursor.execute("""
                    INSERT INTO system_settings (key, value)
                    VALUES ('last_decay_at', %s)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
                """, (last_decay_at,))
            
            # Migrate transitions
            transitions = tally.get("transitions", {})
            transition_count = 0
            for source_id, targets in transitions.items():
                source_id = str(source_id).strip()
                if not source_id:
                    continue
                
                # If source_id doesn't exist in songs table, insert a dummy record
                if source_id not in imported_song_ids:
                    cursor.execute("""
                        INSERT INTO songs (id, title, artist)
                        VALUES (%s, 'Unknown Song', 'Unknown Artist')
                        ON CONFLICT (id) DO NOTHING;
                    """, (source_id,))
                    imported_song_ids.add(source_id)
                
                for target_id, count in targets.items():
                    target_id = str(target_id).strip()
                    if not target_id:
                        continue
                    
                    # If target_id doesn't exist in songs table, insert a dummy record
                    if target_id not in imported_song_ids:
                        cursor.execute("""
                            INSERT INTO songs (id, title, artist)
                            VALUES (%s, 'Unknown Song', 'Unknown Artist')
                            ON CONFLICT (id) DO NOTHING;
                        """, (target_id,))
                        imported_song_ids.add(target_id)
                        
                    cursor.execute("""
                        INSERT INTO playback_transitions (source_id, target_id, count)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (source_id, target_id) DO UPDATE SET count = EXCLUDED.count;
                    """, (source_id, target_id, int(count)))
                    transition_count += 1
            print(f"Successfully migrated {transition_count} playback transitions.")
        else:
            print("No tally_counter.json found to migrate.")
            
        conn.commit()
        print("Data migration complete.")
    except Exception as e:
        conn.rollback()
        print(f"Error during migration: {e}")
        raise e
    finally:
        cursor.close()

def main():
    try:
        database_url = os.getenv("DATABASE_URL")
        if database_url:
            print("Connecting to database using DATABASE_URL...")
            conn = psycopg2.connect(database_url)
        else:
            create_database()
            # Connect to newly created/existing audiodrip db
            conn = psycopg2.connect(
                user=DB_USER,
                password=DB_PASSWORD,
                host=DB_HOST,
                port=DB_PORT,
                dbname=DB_NAME
            )
        
        setup_schema(conn)
        migrate_data(conn)
        
        conn.close()
        print("Database initialization and migration finished successfully!")
    except Exception as e:
        print(f"Database initialization failed: {e}")

if __name__ == "__main__":
    main()
