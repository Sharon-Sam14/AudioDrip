export const GENRE_MAP: Record<string, string> = {
  "Little Simz": "Hip-Hop",
  "Miles Davis": "Jazz",
  "Frank Ocean": "R&B",
  "Pink Floyd": "Ambient",
  "Childish Gambino": "R&B",
  "M83": "Electronic",
  "deadmau5": "Electronic",
  "Rex Orange County": "Soul",
  "Kiasmos": "Electronic",
  "Paul Desmond": "Jazz",
  "Tykos": "Ambient",
  "Daft Punk": "Electronic",
  "Kanye West": "Hip-Hop",
  "Kendrick Lamar": "Hip-Hop",
  "John Coltrane": "Jazz",
  "Bill Evans": "Jazz",
  "Radiohead": "Ambient",
  "Aphex Twin": "Ambient",
  "Tame Impala": "Electronic",
  "Lana Del Rey": "Soul",
  "The Weeknd": "R&B",
  "Drake": "Hip-Hop"
};

export function getGenreForArtist(artistName: string): "Jazz" | "Electronic" | "Soul" | "Hip-Hop" | "Ambient" | "R&B" {
  const normalized = artistName.trim().toLowerCase();
  
  for (const [key, value] of Object.entries(GENRE_MAP)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return value as "Jazz" | "Electronic" | "Soul" | "Hip-Hop" | "Ambient" | "R&B";
    }
  }

  // Fallbacks
  const defaultGenres: Array<"Jazz" | "Electronic" | "Soul" | "Hip-Hop" | "Ambient" | "R&B"> = [
    "Jazz", "Electronic", "Soul", "Hip-Hop", "Ambient", "R&B"
  ];
  
  return defaultGenres[artistName.length % defaultGenres.length];
}
