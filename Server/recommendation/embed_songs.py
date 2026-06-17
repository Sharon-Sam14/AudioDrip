import sys
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
import os
from pathlib import Path

# Add the parent directory to sys.path so we can import db
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from db import get_db_cursor

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("Error: sentence-transformers is not installed. Please run: pip install sentence-transformers")
    sys.exit(1)

def main():
    print("Loading SentenceTransformer model 'all-MiniLM-L6-v2'...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    print("Model loaded successfully.")

    # Fetch songs from database
    with get_db_cursor() as cursor:
        cursor.execute("SELECT id, title, artist, album, genre FROM songs;")
        songs = cursor.fetchall()

    if not songs:
        print("No songs found in catalog database. Please run a search or charts fetch in the app first to populate the catalog.")
        return

    print(f"Generating embeddings for {len(songs)} songs...")

    for song_id, title, artist, album, genre in songs:
        text = f"Title: {title or 'Unknown'}. Artist: {artist or 'Unknown'}. Album: {album or 'Single'}. Genre: {genre or 'Music'}."
        try:
            print(f"Embedding song '{title}' by '{artist}'...")
        except Exception:
            try:
                print(f"Embedding song ID: {song_id}")
            except Exception:
                pass
        vector = model.encode(text).tolist()  # Converts NumPy array to Python list of floats

        # Save to database
        with get_db_cursor(commit=True) as cursor:
            cursor.execute(
                "UPDATE songs SET embedding = %s WHERE id = %s;",
                (vector, song_id)
            )

    print("Offline song embedding generation finished successfully!")

if __name__ == "__main__":
    main()
