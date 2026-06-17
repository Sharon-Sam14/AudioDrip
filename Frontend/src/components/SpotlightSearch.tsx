import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, User, Disc } from 'lucide-react';
import { getGenreForArtist } from '../data/genreMap';
import type { Track } from '../store/useMusicStore';

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[]; // initial backup tracks
  onPlay: (track: Track) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const SpotlightSearch: React.FC<SpotlightSearchProps> = ({
  isOpen,
  onClose,
  onPlay,
  searchQuery,
  onSearchChange,
}) => {
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced live Deezer search
  useEffect(() => {
    if (!isOpen) return;
    if (!searchQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const targetUrl = `https://api.deezer.com/search?q=${encodeURIComponent(searchQuery)}&limit=15`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        if (data && data.data) {
          const mapped: Track[] = data.data.map((item: { id: number; title: string; artist?: { name: string }; album?: { title: string; cover_xl: string }; duration: number; preview: string }) => ({
            id: String(item.id),
            title: item.title || "Unknown Track",
            artist: item.artist?.name || "Unknown Artist",
            album: item.album?.title || "Single",
            duration: item.duration || 180,
            genre: getGenreForArtist(item.artist?.name || ""),
            coverUrl: item.album?.cover_xl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600",
            audioUrl: item.preview || "",
            playCount: 5000,
            isLiked: false
          }));
          setResults(mapped);
        }
      } catch (err) {
        console.error("Deezer search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isOpen]);

  // Grouped metadata matching
  const matchedTracks = results;

  const matchedArtists = Array.from(new Set(matchedTracks.map(t => t.artist))).map((artistName, idx) => ({
    id: `art-${idx}`,
    name: artistName,
    genre: matchedTracks.find(t => t.artist === artistName)?.genre || 'Music'
  }));

  const matchedAlbums = Array.from(new Set(matchedTracks.map(t => t.album))).map((albumName, idx) => {
    const matchingTrack = matchedTracks.find(t => t.album === albumName);
    return {
      id: `alb-${idx}`,
      title: albumName,
      artist: matchingTrack?.artist || 'Unknown Artist',
      coverUrl: matchingTrack?.coverUrl || ''
    };
  });

  const flatItems = React.useMemo((): Array<
    | { type: 'track'; data: Track }
    | { type: 'artist'; data: typeof matchedArtists[0] }
    | { type: 'album'; data: typeof matchedAlbums[0] }
  > => [
    ...matchedTracks.map(t => ({ type: 'track' as const, data: t })),
    ...matchedArtists.map(a => ({ type: 'artist' as const, data: a })),
    ...matchedAlbums.map(al => ({ type: 'album' as const, data: al }))
  ], [matchedTracks, matchedArtists, matchedAlbums]);

  // Reset indices on query updates
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
  }, [searchQuery]);

  // Focus input automatically on open and preserve focus during navigations
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (flatItems.length > 0 ? (prev + 1) % flatItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (flatItems.length > 0 ? (prev - 1 + flatItems.length) % flatItems.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatItems.length > 0 && flatItems[activeIndex]) {
          const selected = flatItems[activeIndex];
          if (selected.type === 'track') {
            onPlay(selected.data);
            onClose();
          } else {
            onSearchChange(selected.type === 'artist' ? selected.data.name : selected.data.title);
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatItems, activeIndex, onClose, onPlay, onSearchChange]);

  const listContainerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -12 },
    show: { opacity: 1, x: 0 }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-[#0C0A09]/75 backdrop-blur-md flex items-start justify-center pt-24 z-55 px-4 pointer-events-auto">
          {/* Backdrop click close */}
          <div className="absolute inset-0 z-0" onClick={onClose} />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 24, stiffness: 220 }}
            ref={modalRef}
            className="relative w-full max-w-xl bg-bg-secondary border border-border-subtle rounded-2xl shadow-2xl overflow-hidden z-10"
          >
            {/* Search Input field */}
            <div className="relative border-b border-border-subtle/50 px-5 py-4 flex items-center gap-3">
              <Search className="w-4 h-4 text-txt-secondary" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search Deezer library..."
                className="flex-1 bg-transparent border-b border-border-subtle/50 focus:border-[#F59E0B] focus:outline-none text-txt-primary placeholder-text-muted text-sm font-semibold py-1 transition-colors shadow-none outline-none"
              />
              
              {/* Spinner: single rotating ring while loading */}
              {isSearching && (
                <div className="w-5 h-5 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              
              <button 
                onClick={onClose}
                className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Results Grid scrollable */}
            <div className="max-h-96 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-5">
              {flatItems.length === 0 ? (
                <div className="py-8 text-center text-txt-muted text-xs font-medium">
                  {searchQuery ? "No live search results found." : "Type a song, artist, or genre to explore global hits..."}
                </div>
              ) : (
                <motion.div
                  variants={listContainerVariants}
                  initial="hidden"
                  animate="show"
                  className="flex flex-col gap-4"
                >
                  {/* Category: Tracks */}
                  {matchedTracks.length > 0 && (
                    <div>
                      <h5 className="font-serif italic text-xs uppercase tracking-widest text-[#F59E0B] font-bold px-2 mb-2">
                        Tracks
                      </h5>
                      <div className="flex flex-col gap-1">
                        {matchedTracks.map((track, i) => {
                          const flatIdx = i;
                          const isHighlighted = activeIndex === flatIdx;
                          return (
                            <motion.div
                              key={track.id}
                              variants={itemVariants}
                              onClick={() => {
                                onPlay(track);
                                onClose();
                              }}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors duration-150 ${
                                isHighlighted 
                                  ? 'border-l-2 border-[#F59E0B] text-txt-primary' 
                                  : 'border-l-2 border-transparent hover:text-txt-primary text-txt-secondary'
                              }`}
                            >
                              <div className="w-8 h-8 rounded bg-[#181615] overflow-hidden flex-shrink-0">
                                <img src={track.coverUrl} className="w-full h-full object-cover" alt="" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold truncate text-txt-primary">{track.title}</p>
                                <p className="text-[10px] font-medium truncate text-txt-muted">{track.artist}</p>
                              </div>
                              <span className="text-[10px] font-bold text-txt-muted">
                                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                              </span>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Category: Artists */}
                  {matchedArtists.length > 0 && (
                    <div>
                      <h5 className="font-serif italic text-xs uppercase tracking-widest text-[#F59E0B] font-bold px-2 mb-2">
                        Artists
                      </h5>
                      <div className="flex flex-col gap-1">
                        {matchedArtists.map((artist, i) => {
                          const flatIdx = matchedTracks.length + i;
                          const isHighlighted = activeIndex === flatIdx;
                          return (
                            <motion.div
                              key={artist.id}
                              variants={itemVariants}
                              onClick={() => onSearchChange(artist.name)}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors duration-150 ${
                                isHighlighted 
                                  ? 'border-l-2 border-[#F59E0B] text-txt-primary' 
                                  : 'border-l-2 border-transparent hover:text-txt-primary text-txt-secondary'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full bg-[#181615] flex items-center justify-center flex-shrink-0 border border-border-subtle">
                                <User className="w-3.5 h-3.5 text-txt-muted" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold truncate text-txt-primary">{artist.name}</p>
                                <p className="text-[10px] font-medium truncate text-txt-muted">{artist.genre} Artist</p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Category: Albums */}
                  {matchedAlbums.length > 0 && (
                    <div>
                      <h5 className="font-serif italic text-xs uppercase tracking-widest text-[#F59E0B] font-bold px-2 mb-2">
                        Albums
                      </h5>
                      <div className="flex flex-col gap-1">
                        {matchedAlbums.map((album, i) => {
                          const flatIdx = matchedTracks.length + matchedArtists.length + i;
                          const isHighlighted = activeIndex === flatIdx;
                          return (
                            <motion.div
                              key={album.id}
                              variants={itemVariants}
                              onClick={() => onSearchChange(album.title)}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors duration-150 ${
                                isHighlighted 
                                  ? 'border-l-2 border-[#F59E0B] text-txt-primary' 
                                  : 'border-l-2 border-transparent hover:text-txt-primary text-txt-secondary'
                              }`}
                            >
                              <div className="w-8 h-8 rounded bg-[#181615] overflow-hidden flex-shrink-0 border border-border-subtle">
                                {album.coverUrl ? (
                                  <img src={album.coverUrl} className="w-full h-full object-cover" alt="" />
                                ) : (
                                  <Disc className="w-3.5 h-3.5 text-txt-muted m-auto" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-bold truncate text-txt-primary">{album.title}</p>
                                <p className="text-[10px] font-medium truncate text-txt-muted">Album • {album.artist}</p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
            
            {/* Keyboard Command Help footer */}
            <div className="bg-bg-tertiary px-5 py-2.5 border-t border-border-subtle/40 flex items-center justify-between text-[9px] font-bold text-txt-muted uppercase tracking-wider">
              <span>↑↓ Navigation</span>
              <span>Enter to Play/Search</span>
              <span>ESC to Close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SpotlightSearch;
