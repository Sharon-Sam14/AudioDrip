import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, User, Disc, Loader2, Globe, Music as MusicIcon, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { Track } from '../store/useMusicStore';
import { songToTrack, useMusicStore } from '../store/useMusicStore';
import type { Song } from '../store/useMusicStore';

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[]; // initial backup tracks (seed)
  onPlay: (track: Track) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

// Quick-filter chips available in search
const SEARCH_LANG_CHIPS = [
  { id: 'Hindi', label: '🇮🇳 Hindi' },
  { id: 'Tamil', label: '🎵 Tamil' },
  { id: 'Telugu', label: '🎵 Telugu' },
  { id: 'Punjabi', label: '🥁 Punjabi' },
  { id: 'English', label: '🌍 English' },
  { id: 'Korean', label: '🇰🇷 K-Pop' },
  { id: 'Spanish', label: '🇪🇸 Spanish' },
];

const SEARCH_GENRE_CHIPS = [
  { id: 'devotional', label: '🙏 Devotional' },
  { id: 'party', label: '🎉 Party' },
  { id: 'chill', label: '🌿 Chill' },
  { id: 'romantic', label: '💕 Romantic' },
  { id: 'hip-hop', label: '🎤 Hip-Hop' },
  { id: 'rock', label: '🎸 Rock' },
  { id: 'classical', label: '🎻 Classical' },
  { id: 'workout', label: '💪 Workout' },
  { id: 'sufi', label: '🌙 Sufi' },
];

const PAGE_SIZE = 8;

export const SpotlightSearch: React.FC<SpotlightSearchProps> = ({
  isOpen,
  onClose,
  tracks,
  onPlay,
  searchQuery,
  onSearchChange,
}) => {
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const [chipMode, setChipMode] = useState<'language' | 'genre'>('genre');
  const [viewMode, setViewMode] = useState<'compact' | 'page'>('compact');
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Play from search: seed the queue with current search results first
  const handlePlayFromSearch = useCallback((track: Track) => {
    if (results.length > 0) {
      useMusicStore.setState({ queue: results });
    }
    onPlay(track);
  }, [results, onPlay]);

  // Clean query by removing redundant words like songs/song/music when other words exist
  const cleanSearchQuery = useCallback((query: string): string => {
    const trimmed = query.trim();
    if (!trimmed) return '';
    if (/^(songs?|music)$/i.test(trimmed)) {
      return trimmed;
    }
    return trimmed
      .replace(/\b(songs?|music)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  // Build chip query suffix
  const buildChipQuerySuffix = useCallback(() => {
    return activeChips.length > 0 ? activeChips.join(' ') : '';
  }, [activeChips]);

  // Full query = cleaned typed query + chip filters
  const fullQuery = [cleanSearchQuery(searchQuery), buildChipQuerySuffix()].filter(Boolean).join(' ');

  // Debounced search using the backend /api/mobile/search endpoint
  useEffect(() => {
    if (!isOpen) return;
    if (!fullQuery.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setCurrentPage(1);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await fetch(`/api/mobile/search?q=${encodeURIComponent(fullQuery)}`);
        const data = await response.json();

        if (Array.isArray(data)) {
          const mapped: Track[] = data.map((song: Song) => songToTrack(song));
          setResults(mapped);
          // Auto switch to page view when lots of results
          if (mapped.length > 5) setViewMode('page');
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error("Search error:", err);
        // Fallback: filter local seed tracks
        const q = fullQuery.toLowerCase();
        const filtered = tracks.filter(t =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q)
        );
        setResults(filtered);
        if (filtered.length > 5) setViewMode('page');
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [fullQuery, isOpen, tracks]);

  // When chips change but no query, still search if chips selected
  useEffect(() => {
    if (activeChips.length > 0 && !searchQuery.trim()) {
      setIsSearching(true);
    }
  }, [activeChips, searchQuery]);

  const matchedTracks = results;

  const matchedArtists = viewMode === 'compact'
    ? Array.from(new Set(matchedTracks.map(t => t.artist))).map((artistName, idx) => ({
        id: `art-${idx}`,
        name: artistName,
        genre: matchedTracks.find(t => t.artist === artistName)?.genre || 'Music'
      }))
    : [];

  const matchedAlbums = viewMode === 'compact'
    ? Array.from(new Set(matchedTracks.map(t => t.album))).map((albumName, idx) => {
        const matchingTrack = matchedTracks.find(t => t.album === albumName);
        return {
          id: `alb-${idx}`,
          title: albumName,
          artist: matchingTrack?.artist || 'Unknown Artist',
          coverUrl: matchingTrack?.coverUrl || ''
        };
      })
    : [];

  // Pagination for page view
  const totalPages = Math.max(1, Math.ceil(matchedTracks.length / PAGE_SIZE));
  const pagedTracks = viewMode === 'page'
    ? matchedTracks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : matchedTracks;

  const flatItems = React.useMemo((): Array<
    | { type: 'track'; data: Track }
    | { type: 'artist'; data: typeof matchedArtists[0] }
    | { type: 'album'; data: typeof matchedAlbums[0] }
  > => [
    ...matchedTracks.map(t => ({ type: 'track' as const, data: t })),
    ...matchedArtists.map(a => ({ type: 'artist' as const, data: a })),
    ...matchedAlbums.map(al => ({ type: 'album' as const, data: al }))
  ], [matchedTracks, matchedArtists, matchedAlbums]);

  // Toggle a chip on/off
  const toggleChip = (chipId: string) => {
    setActiveChips(prev =>
      prev.includes(chipId) ? prev.filter(c => c !== chipId) : [...prev, chipId]
    );
    setCurrentPage(1);
  };

  // Reset indices on query updates
  useEffect(() => {
    setActiveIndex(0);
  }, [searchQuery, activeChips]);

  // Focus input automatically on open and preserve focus during navigations
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setActiveIndex(0);
      setCurrentPage(1);
      setActiveChips([]);
      setViewMode('compact');
    } else {
      setResults([]);
    }
  }, [isOpen]);

  // Handle input change locally to allow typing without lag
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
    setViewMode('compact');
    setCurrentPage(1);
  }, [onSearchChange]);

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
            handlePlayFromSearch(selected.data);
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
  }, [isOpen, flatItems, activeIndex, onClose, handlePlayFromSearch, onSearchChange]);

  const listContainerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.04 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -12 },
    show: { opacity: 1, x: 0 }
  };

  const hasAnyQuery = fullQuery.trim().length > 0;
  const currentChips = chipMode === 'language' ? SEARCH_LANG_CHIPS : SEARCH_GENRE_CHIPS;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-[#0C0A09]/75 backdrop-blur-md flex items-start justify-center pt-16 z-55 px-4 pointer-events-auto">
          {/* Backdrop click close */}
          <div className="absolute inset-0 z-0" onClick={onClose} />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 24, stiffness: 220 }}
            ref={modalRef}
            className={`relative w-full bg-bg-secondary border border-border-subtle rounded-2xl shadow-2xl overflow-hidden z-10 transition-all duration-300 ${
              viewMode === 'page' ? 'max-w-2xl' : 'max-w-xl'
            }`}
          >
            {/* Search Input field */}
            <div className="relative border-b border-border-subtle/50 px-5 py-4 flex items-center gap-3">
              <Search className="w-4 h-4 text-txt-secondary" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={handleInputChange}
                placeholder="Search songs, artists, genres..."
                className="flex-1 bg-transparent border-b border-border-subtle/50 focus:border-[#F59E0B] focus:outline-none text-txt-primary placeholder-text-muted text-sm font-semibold py-1 transition-colors shadow-none outline-none"
              />
              
              {/* Spinner: single rotating ring while loading */}
              {isSearching && (
                <Loader2 className="w-5 h-5 text-accent-amber animate-spin flex-shrink-0" />
              )}

              {/* View mode toggle */}
              {results.length > 0 && (
                <button
                  onClick={() => setViewMode(v => v === 'compact' ? 'page' : 'compact')}
                  title={viewMode === 'compact' ? 'Switch to page view' : 'Switch to compact view'}
                  className="p-1.5 rounded-md text-txt-muted hover:text-accent-amber hover:bg-bg-tertiary transition-colors cursor-pointer text-[9px] font-black uppercase tracking-wider border border-border-subtle"
                >
                  {viewMode === 'compact' ? 'PAGE' : 'LIST'}
                </button>
              )}
              
              <button 
                onClick={onClose}
                className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── PREFERENCE FILTER CHIPS ── */}
            <div className="px-4 pt-3 pb-2 border-b border-border-subtle/30">
              {/* Chip mode switcher */}
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setChipMode('genre')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                    chipMode === 'genre'
                      ? 'bg-accent-amber border-accent-amber text-[#0C0A09]'
                      : 'border-border-subtle text-txt-muted hover:text-txt-primary'
                  }`}
                >
                  <MusicIcon className="w-2.5 h-2.5" />
                  Genre
                </button>
                <button
                  onClick={() => setChipMode('language')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                    chipMode === 'language'
                      ? 'bg-accent-amber border-accent-amber text-[#0C0A09]'
                      : 'border-border-subtle text-txt-muted hover:text-txt-primary'
                  }`}
                >
                  <Globe className="w-2.5 h-2.5" />
                  Language
                </button>
                {activeChips.length > 0 && (
                  <button
                    onClick={() => setActiveChips([])}
                    className="ml-auto text-[9px] font-bold text-txt-muted hover:text-accent-amber transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    Clear ×{activeChips.length}
                  </button>
                )}
              </div>
              {/* Chips row */}
              <div className="flex flex-wrap gap-1.5">
                {currentChips.map(chip => {
                  const isActive = activeChips.includes(chip.id);
                  return (
                    <button
                      key={chip.id}
                      onClick={() => toggleChip(chip.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-accent-sienna border-accent-sienna text-white shadow-sm'
                          : 'bg-bg-primary border-border-subtle text-txt-secondary hover:border-accent-amber/40 hover:text-txt-primary'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Results area */}
            {viewMode === 'page' && hasAnyQuery ? (
              // ── PAGE / GRID VIEW ──
              <div className="flex flex-col">
                {/* Header bar */}
                <div className="px-5 py-3 border-b border-border-subtle/30 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-txt-muted">
                    {isSearching ? 'Searching…' : `${matchedTracks.length} result${matchedTracks.length !== 1 ? 's' : ''}`}
                  </span>
                  {totalPages > 1 && (
                    <span className="text-[10px] font-bold text-txt-muted">
                      Page {currentPage} of {totalPages}
                    </span>
                  )}
                </div>

                {/* Track page grid */}
                <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {pagedTracks.length === 0 && !isSearching ? (
                    <div className="py-10 text-center text-txt-muted text-xs font-medium">
                      No songs found. Try a different search or filter.
                    </div>
                  ) : (
                    <motion.div
                      variants={listContainerVariants}
                      initial="hidden"
                      animate="show"
                      className="flex flex-col gap-2"
                      key={`page-${currentPage}-${fullQuery}`}
                    >
                      {pagedTracks.map((track, i) => {
                        const num = (currentPage - 1) * PAGE_SIZE + i + 1;
                        return (
                          <motion.div
                            key={track.id}
                            variants={itemVariants}
                            onClick={() => {
                              handlePlayFromSearch(track);
                              onClose();
                            }}
                            className="group flex items-center gap-4 px-4 py-3 rounded-xl border border-border-subtle/0 hover:border-border-subtle hover:bg-bg-tertiary/40 cursor-pointer transition-all"
                          >
                            {/* Track number */}
                            <span className="text-[11px] font-black text-txt-muted w-5 text-right flex-shrink-0 group-hover:hidden">
                              {num}
                            </span>
                            <Play className="w-3.5 h-3.5 text-accent-amber hidden group-hover:block flex-shrink-0" />

                            {/* Cover */}
                            <div className="w-12 h-12 rounded-lg bg-bg-tertiary overflow-hidden flex-shrink-0 border border-border-subtle/50">
                              {track.coverUrl ? (
                                <img src={track.coverUrl} className="w-full h-full object-cover" alt="" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <MusicIcon className="w-5 h-5 text-txt-muted" />
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate text-txt-primary flex items-center gap-1.5 flex-wrap">
                                {track.title}
                                {track.source === 'uploaded' && <span className="px-1 py-0.2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-extrabold uppercase">Uploaded</span>}
                                {track.source === 'jamendo' && <span className="px-1 py-0.2 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-extrabold uppercase">Jamendo</span>}
                                {track.source === 'archive' && <span className="px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-extrabold uppercase">Archive</span>}
                                {track.source === 'youtube' && <span className="px-1 py-0.2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-extrabold uppercase">YouTube</span>}
                                {track.cached && <span className="px-1 py-0.2 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] font-extrabold uppercase">Cached</span>}
                              </p>
                              <p className="text-[11px] font-medium truncate text-txt-muted mt-0.5">{track.artist}</p>
                            </div>

                            {/* Genre badge */}
                            {track.genre && (
                              <span className="hidden sm:inline-flex text-[9px] font-black uppercase tracking-wider bg-accent-amber/10 border border-accent-amber/20 text-accent-amber px-2 py-0.5 rounded-full flex-shrink-0">
                                {track.genre.split('/')[0].trim()}
                              </span>
                            )}

                            {/* Duration */}
                            <span className="text-[10px] font-bold text-txt-muted flex-shrink-0">
                              {track.duration > 0 ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}` : '—'}
                            </span>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-border-subtle/30 flex items-center justify-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-border-subtle text-txt-muted hover:text-txt-primary hover:border-accent-amber/40 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-default"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const page = i + 1;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-7 h-7 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                            currentPage === page
                              ? 'bg-accent-amber border-accent-amber text-[#0C0A09]'
                              : 'border-border-subtle text-txt-muted hover:border-accent-amber/40 hover:text-txt-primary'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-border-subtle text-txt-muted hover:text-txt-primary hover:border-accent-amber/40 disabled:opacity-30 transition-all cursor-pointer disabled:cursor-default"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // ── COMPACT / ORIGINAL VIEW ──
              <div className="max-h-80 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-5">
                {flatItems.length === 0 ? (
                  <div className="py-8 text-center text-txt-muted text-xs font-medium">
                    {isSearching 
                      ? "Searching..." 
                      : hasAnyQuery
                        ? "No results found. Try a different search term or filter."
                        : "Type a song, artist, or genre — or pick a filter above"}
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
                        <div className="flex items-center justify-between px-2 mb-2">
                          <h5 className="font-serif italic text-xs uppercase tracking-widest text-[#F59E0B] font-bold">
                            Tracks
                          </h5>
                          {matchedTracks.length > 5 && (
                            <button
                              onClick={() => setViewMode('page')}
                              className="text-[9px] font-black uppercase tracking-wider text-accent-amber hover:underline cursor-pointer"
                            >
                              View all {matchedTracks.length} →
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {matchedTracks.slice(0, 5).map((track, i) => {
                            const flatIdx = i;
                            const isHighlighted = activeIndex === flatIdx;
                            return (
                              <motion.div
                                key={track.id}
                                variants={itemVariants}
                                onClick={() => {
                                  handlePlayFromSearch(track);
                                  onClose();
                                }}
                                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors duration-150 ${
                                  isHighlighted 
                                    ? 'border-l-2 border-[#F59E0B] text-txt-primary bg-bg-tertiary/40' 
                                    : 'border-l-2 border-transparent hover:text-txt-primary hover:bg-bg-tertiary/20 text-txt-secondary'
                                }`}
                              >
                                <div className="w-8 h-8 rounded bg-[#181615] overflow-hidden flex-shrink-0">
                                  <img src={track.coverUrl} className="w-full h-full object-cover" alt="" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-bold truncate text-txt-primary flex items-center gap-1.5 flex-wrap">
                                    {track.title}
                                    {track.source === 'uploaded' && <span className="px-1 py-0.2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-extrabold uppercase">Uploaded</span>}
                                    {track.source === 'jamendo' && <span className="px-1 py-0.2 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-extrabold uppercase">Jamendo</span>}
                                    {track.source === 'archive' && <span className="px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-extrabold uppercase">Archive</span>}
                                    {track.source === 'youtube' && <span className="px-1 py-0.2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-extrabold uppercase">YouTube</span>}
                                    {track.cached && <span className="px-1 py-0.2 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] font-extrabold uppercase">Cached</span>}
                                  </p>
                                  <p className="text-[10px] font-medium truncate text-txt-muted">{track.artist}</p>
                                </div>
                                <span className="text-[10px] font-bold text-txt-muted">
                                  {track.duration > 0 ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}` : ''}
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
                                    ? 'border-l-2 border-[#F59E0B] text-txt-primary bg-bg-tertiary/40' 
                                    : 'border-l-2 border-transparent hover:text-txt-primary hover:bg-bg-tertiary/20 text-txt-secondary'
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
                                    ? 'border-l-2 border-[#F59E0B] text-txt-primary bg-bg-tertiary/40' 
                                    : 'border-l-2 border-transparent hover:text-txt-primary hover:bg-bg-tertiary/20 text-txt-secondary'
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
            )}
            
            {/* Keyboard Command Help footer */}
            <div className="bg-bg-tertiary px-5 py-2.5 border-t border-border-subtle/40 flex items-center justify-between text-[9px] font-bold text-txt-muted uppercase tracking-wider">
              <span>↑↓ Navigate</span>
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
