import React, { useEffect, useState } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Search, Music, 
  Library, Trash2, FolderPlus, X, Settings, 
  Grid, List, Loader2, Sparkles, Download, Check, Heart,
  Sliders, Globe, Repeat, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMusicStore, seedTracks, trackToSong, songToTrack, getGlobalAudioElement } from './store/useMusicStore';
import type { Track, UserPreferences } from './store/useMusicStore';

// Custom components
import { ParticleField } from './components/ParticleField';
import { VinylRecord } from './components/VinylRecord';
import { WaveformScrubber } from './components/WaveformScrubber';
import { AudioVisualizer } from './components/AudioVisualizer';
import { MagneticButton } from './components/MagneticButton';
import { TrackCard } from './components/TrackCard';
import { SpotlightSearch } from './components/SpotlightSearch';
import { LyricsScroller } from './components/LyricsScroller';
import { UploadModal } from './components/UploadModal';
import { AIAssistantDrawer } from './components/AIAssistantDrawer';

const VIBES = [
  { id: 'all', name: '🪐 All Vibes', genres: [] },
  { id: 'chill', name: '🍃 Chill & Lofi', genres: ['chill', 'lo-fi', 'lofi', 'ambient', 'acoustic', 'relaxation', 'devotional', 'folk', 'classical', 'light', 'ghazal', 'sufi', 'silent', 'alternative', 'indie', 'country', 'spoken'] },
  { id: 'energetic', name: '⚡ Energetic', genres: ['dance', 'rock', 'pop', 'electronic', 'dance/electronic', 'pop/dance', 'punjabi', 'bhajans', 'bhakti', 'bhangra', 'bollywood', 'indian pop', 'telugu', 'tamil', 'party', 'club', 'hip-hop', 'rap'] },
  { id: 'focus', name: '☕ Focus', genres: ['classical', 'instrumental', 'soundtrack', 'ambient', 'acoustic', 'relaxation', 'study', 'focus', 'piano', 'peaceful'] },
  { id: 'midnight', name: '🌌 Midnight', genres: ['synthwave', 'soul', 'jazz', 'r&b', 'indie', 'ghazal', 'sufi', 'slow', 'night', 'romantic', 'love', 'alternative'] },
  { id: 'workout', name: '🧗 Workout', genres: ['workout', 'hip-hop', 'rap', 'electronic', 'dance', 'punjabi', 'energetic', 'gym', 'bhangra', 'fast', 'rock'] }
];

// Preference options
const PREF_LANGUAGES = [
  { id: 'Hindi', label: '🇮🇳 Hindi', keywords: ['hindi', 'bollywood', 'bhojpuri', 'rajasthani'] },
  { id: 'Tamil', label: '🎵 Tamil', keywords: ['tamil'] },
  { id: 'Telugu', label: '🎵 Telugu', keywords: ['telugu'] },
  { id: 'Punjabi', label: '🥁 Punjabi', keywords: ['punjabi', 'bhangra'] },
  { id: 'Bengali', label: '🎵 Bengali', keywords: ['bengali', 'bangla'] },
  { id: 'Malayalam', label: '🎵 Malayalam', keywords: ['malayalam'] },
  { id: 'Kannada', label: '🎵 Kannada', keywords: ['kannada'] },
  { id: 'Marathi', label: '🎵 Marathi', keywords: ['marathi'] },
  { id: 'English', label: '🌍 English', keywords: ['english', 'pop', 'rock', 'jazz', 'soul', 'electronic'] },
  { id: 'Korean', label: '🇰🇷 Korean', keywords: ['kpop', 'korean'] },
  { id: 'Spanish', label: '🇪🇸 Spanish', keywords: ['spanish', 'latin', 'reggaeton'] },
  { id: 'French', label: '🇫🇷 French', keywords: ['french'] },
];

const PREF_GENRES = [
  { id: 'Party', label: '🎉 Party', keywords: ['party', 'dance', 'club', 'edm'] },
  { id: 'Devotional', label: '🙏 Devotional', keywords: ['devotional', 'bhakti', 'spiritual', 'bhajans', 'mantra'] },
  { id: 'Chill', label: '🌿 Chill', keywords: ['chill', 'lofi', 'lo-fi', 'ambient', 'acoustic'] },
  { id: 'Romantic', label: '💕 Romantic', keywords: ['romantic', 'love', 'soul', 'r&b'] },
  { id: 'Hip-Hop', label: '🎤 Hip-Hop', keywords: ['hip-hop', 'rap', 'trap'] },
  { id: 'Rock', label: '🎸 Rock', keywords: ['rock', 'metal', 'punk'] },
  { id: 'Classical', label: '🎻 Classical', keywords: ['classical', 'instrumental', 'orchestral', 'piano'] },
  { id: 'Jazz', label: '🎷 Jazz', keywords: ['jazz', 'blues', 'swing'] },
  { id: 'Pop', label: '🎵 Pop', keywords: ['pop', 'indie', 'alternative'] },
  { id: 'Workout', label: '💪 Workout', keywords: ['workout', 'gym', 'energetic', 'fitness'] },
  { id: 'Sufi', label: '🌙 Sufi', keywords: ['sufi', 'ghazal', 'qawwali'] },
  { id: 'Retro', label: '📼 Retro', keywords: ['retro', 'classic', 'oldies', 'vintage', '80s', '90s'] },
];

// Preference-based scoring: returns 0-100, higher = better match
const scoreTrackByPrefs = (track: Track, prefs: UserPreferences): number => {
  if (!prefs.languages.length && !prefs.genres.length) return 0;
  const g = (track.genre || '').toLowerCase();
  const t = (track.title || '').toLowerCase();
  const a = (track.artist || '').toLowerCase();
  let score = 0;
  for (const lang of prefs.languages) {
    const langDef = PREF_LANGUAGES.find(l => l.id === lang);
    if (langDef && langDef.keywords.some(kw => g.includes(kw) || t.includes(kw) || a.includes(kw))) {
      score += 50;
    }
  }
  for (const genre of prefs.genres) {
    const genreDef = PREF_GENRES.find(gd => gd.id === genre);
    if (genreDef && genreDef.keywords.some(kw => g.includes(kw) || t.includes(kw))) {
      score += 50;
    }
  }
  return score;
};

// -------------------------------------------------------------
// SKELETON SCREENS
// Warm dark rectangles (--bg-tertiary) that breathe via waveform-idle
// -------------------------------------------------------------

const HeroSkeleton = () => (
  <div className="relative w-full md:h-[45vh] md:min-h-[300px] rounded-3xl overflow-hidden border border-border-subtle bg-bg-tertiary p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-12 animate-waveform-idle">
    <div className="w-full md:w-[40%] aspect-square max-w-[200px] md:max-w-[220px] rounded-2xl bg-bg-secondary flex-shrink-0" />
    <div className="w-full md:w-[60%] flex flex-col gap-4 items-center md:items-start">
      <div className="h-3 bg-bg-secondary rounded w-1/4" />
      <div className="h-10 bg-bg-secondary rounded w-3/4" />
      <div className="h-5 bg-bg-secondary rounded w-1/2" />
      <div className="h-12 bg-bg-secondary rounded w-full mt-2" />
    </div>
  </div>
);

const TrackCardSkeleton = () => (
  <div className="flex flex-col w-full aspect-[4/5] rounded-2xl border border-border-subtle bg-bg-tertiary overflow-hidden animate-waveform-idle">
    <div className="w-full h-[65%] bg-bg-secondary" />
    <div className="flex-grow p-4 bg-bg-secondary border-t border-border-subtle/50 flex flex-col justify-between">
      <div className="space-y-2">
        <div className="h-4 bg-bg-tertiary rounded w-3/4" />
        <div className="h-3 bg-bg-tertiary rounded w-1/2" />
      </div>
      <div className="flex justify-between items-center mt-2">
        <div className="h-3 bg-bg-tertiary rounded w-1/3" />
        <div className="h-3 bg-bg-tertiary rounded w-1/6" />
      </div>
    </div>
  </div>
);

const ScrubberSkeleton = () => (
  <div className="w-full h-9 bg-bg-tertiary rounded-xl animate-waveform-idle relative flex items-center justify-between px-3">
    <div className="h-1 bg-bg-secondary rounded w-full" />
  </div>
);

export default function App() {
  const {
    // Navigation
    activeTab,
    librarySubTab,
    
    // Data
    chartSongs,
    librarySongs,
    likedSongs,
    uploadedSongs,
    playlists,
    selectedPlaylist,
    playlistSongs,
    lyrics,
    upNextSuggestions,
    
    // Modals
    showCreateModal,
    newPlaylistName,
    showAddModal,
    showUploadModal,
    songToAddToPlaylist,
    
    // Search
    searchQuery,
    
    // Playback
    isPlaying,
    currentTime,
    duration,
    selectedVibe,
    
    // Visualizer / Custom states
    currentTrack,
    visualizerMode,
    history,
    isSidebarExpanded,
    isBoothOpen,
    isAIPanelOpen,
    viewMode,

    // Actions
    setActiveTab,
    setLibrarySubTab,
    setSelectedPlaylist,
    setNewPlaylistName,
    setShowCreateModal,
    setShowAddModal,
    setShowUploadModal,
    setSongToAddToPlaylist,
    setSearchQuery,
    setSelectedVibe,
    setIsAIPanelOpen,
    
    fetchChart,
    fetchLibrary,
    fetchLikedSongs,
    fetchUploadedSongs,
    fetchPlaylists,
    fetchPlaylistSongs,
    handleCreatePlaylist,
    handleDeletePlaylist,
    handleAddSongToPlaylist,
    handleRemoveSongFromPlaylist,
    handleToggleLike,
    cacheSong,
    
    pause: handleTogglePlay,
    skipNext: handleNextSong,
    skipPrev: handlePrevSong,
    
    // Auth
    theme,
    toggleTheme,
    isGeneratingAIPlaylist,
    handleGenerateAIPlaylist,
    initApp,

    // Setters
    play,
    seek,
    setVisualizerMode,
    toggleBooth,
    toggleSidebar,
    setViewMode,

    // Preferences
    userPreferences,
    showPrefsModal,
    savePreferences,
    setShowPrefsModal,

    // Repeat Mode
    repeatMode,
    toggleRepeat,
  } = useMusicStore();

  const [aiPrompt, setAiPrompt] = useState('');
  
  // Spotlight modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Skeleton loading state
  const [isLoading, setIsLoading] = useState(true);

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Local preference editor state (inside the modal)
  const [prefLangs, setPrefLangs] = useState<string[]>([]);
  const [prefGenres, setPrefGenres] = useState<string[]>([]);
  const [prefSaving, setPrefSaving] = useState(false);

  // Wrapper to adapt cacheSong (1-arg) to TrackCard onCache (2-arg) signature
  const handleCache = (track: import('./store/useMusicStore').Track, _e?: React.MouseEvent) => {
    cacheSong(track);
  };

  const handleAddToPlaylist = (track: Track, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSongToAddToPlaylist(trackToSong(track));
    setShowAddModal(true);
  };


  // Initialize
  useEffect(() => {
    initApp();
    fetchChart();
    fetchLibrary();
    fetchLikedSongs();
    fetchUploadedSongs();
    fetchPlaylists();

    // Mock initial database loading for 1.2 seconds to show off elegant skeleton screens
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, [initApp, fetchChart, fetchLibrary, fetchLikedSongs, fetchUploadedSongs, fetchPlaylists]);


  // Listen to Cmd/Ctrl + K to toggle spotlight search modal
  useEffect(() => {
    const handleCmdK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleCmdK);
    return () => window.removeEventListener('keydown', handleCmdK);
  }, []);

  // Sync playlist songs if a playlist gets selected
  useEffect(() => {
    if (selectedPlaylist) {
      fetchPlaylistSongs(selectedPlaylist.id);
    }
  }, [selectedPlaylist, fetchPlaylistSongs]);

  // Pre-fill local preference state when either prefs modal or settings modal opens
  useEffect(() => {
    if (showPrefsModal || showSettingsModal) {
      setPrefLangs([...userPreferences.languages]);
      setPrefGenres([...userPreferences.genres]);
    }
  }, [showPrefsModal, showSettingsModal, userPreferences]);

  const [selectedSource, setSelectedSource] = useState<'all' | 'uploaded' | 'jamendo' | 'archive' | 'youtube'>('all');

  // Vibe Filter implementation
  const filterSongsByVibe = (list: Track[]) => {
    if (!selectedVibe || selectedVibe === 'all') return list;
    const vibeObj = VIBES.find(v => v.id === selectedVibe);
    if (!vibeObj) return list;
    
    return list.filter(song => {
      const g = (song.genre || '').toLowerCase();
      return vibeObj.genres.some(genreKeyword => g.includes(genreKeyword));
    });
  };

  const filterSongsBySource = (list: Track[]) => {
    if (selectedSource === 'all') return list;
    return list.filter(song => song.source === selectedSource);
  };

  // Maps backend song lists to track types
  const mappedChartTracks = filterSongsBySource(filterSongsByVibe(chartSongs.map(songToTrack)));

  // Apply preference-based sort: preference-matching songs bubble to top
  const sortedChartTracks = [...mappedChartTracks].sort((a, b) => {
    const sa = scoreTrackByPrefs(a, userPreferences);
    const sb = scoreTrackByPrefs(b, userPreferences);
    return sb - sa; // descending score
  });
  const mappedLikedTracks = likedSongs.map(songToTrack);
  const mappedLibraryTracks = librarySongs.map(songToTrack);
  const mappedUploadedTracks = uploadedSongs.map(songToTrack);
  const mappedPlaylistTracks = playlistSongs.map(songToTrack);

  // Determine current active track details
  const activeTrackObj = currentTrack || (seedTracks.find((t: Track) => t.id === useMusicStore.getState().currentTrack?.id)) || null;


  const similarTracks = upNextSuggestions.map(songToTrack);

  // Identify highest played track for the Hero Banner
  const heroTrack = seedTracks.reduce((max: Track, track: Track) => track.playCount > max.playCount ? track : max, seedTracks[0]);

  // Reduced motion support state
  const [shouldReduceMotion, setShouldReduceMotion] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  );
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setShouldReduceMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  const onToggleLike = (id: string, e: React.MouseEvent) => {
    const allTracks = [...mappedChartTracks, ...mappedLikedTracks, ...mappedLibraryTracks, ...seedTracks];
    const track = allTracks.find(t => t.id === id);
    if (track) {
      handleToggleLike(trackToSong(track), e);
    }
  };

  return (
    <div className={`relative min-h-screen text-txt-primary overflow-x-hidden flex select-none bg-bg-primary`}>
      {/* 2D Motes background layer */}
      <ParticleField />

      {/* Mobile Sidebar Overlay Backdrop */}
      {windowWidth < 768 && isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Grid Layout structure (Sidebar | Main Floor | The Booth Right Panel) */}
      <div 
        className={`w-full min-h-screen grid ${shouldReduceMotion ? '' : 'transition-[grid-template-columns] duration-500 ease-in-out'} relative overflow-hidden`}
        style={{
          gridTemplateColumns: windowWidth < 768
            ? '0px 1fr 0px'
            : windowWidth < 1024
              ? '64px 1fr 0px'
              : `${isSidebarExpanded ? '240px' : '64px'} 1fr ${isBoothOpen && activeTrackObj ? '320px' : '0px'}`,
        }}
      >
        
        {/* ========================================================
            A. LEFT SIDEBAR — "CATALOG RAIL"
            ======================================================== */}
        <aside
          onMouseEnter={() => windowWidth >= 1024 && !isSidebarExpanded && toggleSidebar()}
          onMouseLeave={() => windowWidth >= 1024 && isSidebarExpanded && toggleSidebar()}
          className={`
            bg-bg-secondary border-r border-border-subtle flex flex-col justify-between items-center py-6 overflow-hidden
            ${windowWidth < 768 
              ? 'fixed top-0 left-0 bottom-0 z-50 w-[240px] h-screen transition-transform duration-300 ' + (isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full') 
              : 'w-full h-screen z-30'
            }
          `}
        >
          {/* Top Branding Logo */}
          <div className="w-full px-4 flex items-center gap-3 justify-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-accent-sienna to-accent-amber flex items-center justify-center shadow-lg">
              <Music className="w-4.5 h-4.5 text-txt-primary" />
            </div>
            <AnimatePresence>
              {(isSidebarExpanded || isMobileMenuOpen) && (
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="font-serif italic font-black text-base tracking-widest text-txt-primary whitespace-nowrap"
                >
                  AUDIODRIP
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation Links list */}
          <div className="w-full flex-1 flex flex-col gap-6 justify-center px-2">
            {[
              { id: 'discover', name: 'Discover', icon: Music, action: () => { setActiveTab('discover'); setSelectedPlaylist(null); if (windowWidth < 768) setIsMobileMenuOpen(false); } },
              { id: 'search', name: 'Search (⌘K)', icon: Search, action: () => { setIsSearchOpen(true); if (windowWidth < 768) setIsMobileMenuOpen(false); } },
              { id: 'library', name: 'Library', icon: Library, action: () => { setActiveTab('library'); setSelectedPlaylist(null); if (windowWidth < 768) setIsMobileMenuOpen(false); } },
              { id: 'ai_helper', name: 'AI Helper', icon: Sparkles, action: () => { setIsAIPanelOpen(!isAIPanelOpen); if (windowWidth < 768) setIsMobileMenuOpen(false); } }
            ].map((item) => {
              const isActive = item.id === 'ai_helper' ? isAIPanelOpen : activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  className="group relative w-full py-2.5 flex items-center gap-4 text-txt-secondary hover:text-accent-amber transition-colors cursor-pointer"
                >
                  {/* Left edge active indicator */}
                  {isActive && (
                    <motion.div 
                      layoutId="sidebar-active" 
                      className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent-amber"
                    />
                  )}
                  
                  <div className="pl-4.5 flex-shrink-0">
                    <Icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-105 ${isActive ? 'text-accent-amber' : ''}`} />
                  </div>

                  <AnimatePresence>
                    {(isSidebarExpanded || isMobileMenuOpen) && (
                      <motion.span
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -15 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                        className={`text-[12px] font-semibold tracking-wider uppercase whitespace-nowrap ${isActive ? 'text-accent-amber font-bold' : ''}`}
                      >
                        {item.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}

            {/* Sub-playlists links if sidebar is expanded */}
            <AnimatePresence>
              {(isSidebarExpanded || isMobileMenuOpen) && playlists.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="mt-4 border-t border-border-subtle/40 pt-4 px-4 flex flex-col gap-2 max-h-36 overflow-y-auto custom-scrollbar"
                >
                  <span className="text-[9px] font-black text-txt-muted tracking-widest uppercase">My Playlists</span>
                  {playlists.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPlaylist(p);
                        setActiveTab('library');
                        setLibrarySubTab('playlists');
                        if (windowWidth < 768) setIsMobileMenuOpen(false);
                      }}
                      className={`text-left text-[11px] font-semibold truncate hover:text-accent-amber transition-colors ${
                        selectedPlaylist?.id === p.id ? 'text-accent-amber font-bold' : 'text-txt-muted'
                      }`}
                    >
                      ✦ {p.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom section with current playing track record widget and profile info */}
          <div className="w-full px-2 flex flex-col gap-4 items-center">
            
            {/* Small spinning vinyl record (sm) showing current track */}
            {activeTrackObj && (
              <div className="w-full px-1 border-b border-border-subtle/20 pb-4 flex flex-col items-center gap-2">
                <div className="flex items-center gap-3 w-full justify-center">
                  <div className="flex-shrink-0">
                    <VinylRecord
                      coverUrl={activeTrackObj.coverUrl}
                      isPlaying={isPlaying}
                      size="sm"
                      layoutId={`vinyl-cover-${activeTrackObj.id}-sidebar`}
                    />
                  </div>
                  <AnimatePresence>
                    {(isSidebarExpanded || isMobileMenuOpen) && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="text-left min-w-0 flex-1"
                      >
                        <h5 className="font-serif font-black text-[11px] text-txt-primary truncate leading-tight">{activeTrackObj.title}</h5>
                        <p className="text-[9px] font-semibold text-txt-muted truncate mt-0.5 leading-tight">{activeTrackObj.artist}</p>
                        <span className="text-[8px] font-bold text-accent-amber tracking-wider uppercase mt-1.5 block">
                          {isPlaying ? '✦ Playing' : '⚡ Paused'}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {!(isSidebarExpanded || isMobileMenuOpen) && (
                  <span className="text-[7px] font-bold text-accent-amber tracking-wider uppercase">
                    {isPlaying ? 'PLAY' : 'PAUSED'}
                  </span>
                )}
              </div>
            )}

            {/* Quick visualizer styles settings modal trigger */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-xl hover:bg-bg-tertiary/60 text-txt-secondary hover:text-txt-primary transition-all cursor-pointer"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>


          </div>
        </aside>

        {/* ========================================================
            B. MAIN CONTENT — "THE FLOOR"
            ======================================================== */}
        <main className="flex-grow flex-shrink min-w-0 h-screen overflow-y-auto px-4 md:px-8 py-5 md:py-10 custom-scrollbar flex flex-col gap-6 md:gap-10">
          
          {/* Upper Nav Header bar */}
          <header className="flex justify-between items-center z-10 gap-3">
            {windowWidth < 768 && (
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2.5 rounded-xl bg-bg-secondary border border-border-subtle text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer flex-shrink-0"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            {/* Search command bar search block */}
            <div 
              onClick={() => setIsSearchOpen(true)}
              className="group flex items-center gap-3 px-4 py-2.5 bg-bg-secondary border border-border-subtle rounded-xl text-txt-muted hover:border-border-warm/25 cursor-pointer flex-1 max-w-sm transition-all"
            >
              <Search className="w-4 h-4 text-txt-muted group-hover:text-accent-amber transition-colors flex-shrink-0" />
              <span className="text-xs font-semibold tracking-wide truncate">
                {windowWidth < 768 ? 'Search...' : 'Search songs, artists (⌘K)'}
              </span>
            </div>

            {/* Quick theme swapper toggler */}
            <button
              onClick={toggleTheme}
              className="px-3 md:px-4 py-2 rounded-xl bg-bg-secondary border border-border-subtle hover:border-border-warm/25 text-xs font-bold uppercase tracking-wider text-txt-secondary hover:text-txt-primary transition-all cursor-pointer flex-shrink-0 whitespace-nowrap"
            >
              {windowWidth < 768 ? (theme === 'dark' ? '☀️' : '🌙') : `✦ ${theme === 'dark' ? 'Daylight Session' : 'Obsidian Studio'}`}
            </button>
          </header>

          {/* Tab content renderer */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (selectedPlaylist ? `-playlist-${selectedPlaylist.id}` : '')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, duration: 0.2 }}
              className="flex flex-col gap-10"
            >
              {activeTab === 'discover' && !selectedPlaylist && (
                <>
                  {/* 1. HERO BANNER */}
                  {isLoading ? (
                    <HeroSkeleton />
                  ) : (
                    heroTrack && (
                      <section className="relative w-full md:h-[45vh] md:min-h-[300px] rounded-3xl overflow-hidden border border-border-subtle shadow-xl bg-gradient-to-br from-[#1A1714] to-[#0C0A09] flex flex-col md:flex-row p-6 md:p-8 gap-6 md:gap-12 items-center">
                        {/* Background subtle radial amber glow behind record */}
                        <div className="absolute left-[20%] top-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent-glow rounded-full blur-[80px] pointer-events-none animate-pulse-warm" />
                        
                        {/* Left 40%: Album Art sleeve and vinyl */}
                        <div className="w-full md:w-[40%] h-48 md:h-full flex-shrink-0 flex items-center justify-center relative max-w-[240px] md:max-w-none">
                          {/* Album cover art */}
                          <motion.div 
                            layoutId={`vinyl-cover-${heroTrack.id}`}
                            className="absolute left-4 md:left-0 w-[60%] md:w-[70%] aspect-square bg-[#1A1714] rounded-2xl overflow-hidden border border-border-subtle shadow-2xl z-10"
                          >
                            <img 
                              src={heroTrack.coverUrl} 
                              alt={heroTrack.title} 
                              className="w-full h-full object-cover pointer-events-none" 
                            />
                          </motion.div>

                          {/* Large Vinyl Record centering absolute over cover art */}
                          <div className="absolute right-[10%] md:right-[-10%] top-1/2 -translate-y-1/2 z-0 scale-75 md:scale-100">
                            <VinylRecord 
                              coverUrl={heroTrack.coverUrl} 
                              isPlaying={isPlaying && activeTrackObj?.id === heroTrack.id} 
                              size="lg" 
                            />
                          </div>
                        </div>

                        {/* Right 60%: Editorial Text */}
                        <div className="w-full md:w-[60%] md:h-full flex flex-col justify-center text-center md:text-left relative z-10 pl-0 md:pl-6 items-center md:items-start">
                          <span className="text-[10px] font-black text-accent-amber tracking-widest uppercase mb-3">Featured Release</span>
                          <h2 className="font-serif font-black text-2xl md:text-5xl uppercase tracking-widest text-[#FAF7F4] leading-tight line-clamp-2">
                            {heroTrack.title}
                          </h2>
                          <h3 className="text-sm md:text-xl font-medium text-txt-secondary mt-1 md:mt-2">
                            {heroTrack.artist}
                          </h3>
                          <p className="text-xs font-medium text-txt-muted max-w-lg mt-3 md:mt-4 line-clamp-3 md:line-clamp-4 leading-relaxed">
                            A timeless masterpiece leading the charts with over {(heroTrack.playCount / 1000).toFixed(0)}K monthly sessions. Play now to experience analog sound textures. Currently trending across global ambient sessions.
                          </p>

                          <div className="flex items-center gap-4 mt-4 md:mt-6">
                            <MagneticButton
                              onClick={() => play(heroTrack)}
                              className="px-6 py-3 rounded-full bg-accent-amber text-[#0C0A09] text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-xl hover:bg-accent-amber/90 transition-all"
                            >
                              Listen Now
                            </MagneticButton>
                          </div>
                        </div>
                      </section>
                    )
                  )}

                  {/* VIBE FILTER CHIPS */}
                  <section className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-serif italic text-sm text-accent-amber font-bold">01</span>
                      <h4 className="text-[10px] font-black text-txt-secondary uppercase tracking-widest">Tune by Mood</h4>
                    </div>
                    
                    <div className="flex flex-wrap gap-2.5">
                      {VIBES.map((vibe) => (
                        <button
                          key={vibe.id}
                          onClick={() => setSelectedVibe(vibe.id === 'all' ? null : vibe.id)}
                          className={`px-4 py-2 rounded-full border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            (selectedVibe === vibe.id || (!selectedVibe && vibe.id === 'all'))
                              ? 'bg-accent-amber border-accent-amber text-[#0C0A09]'
                              : 'bg-bg-secondary border-border-subtle text-txt-secondary hover:text-txt-primary hover:border-border-warm/30'
                          }`}
                        >
                          {vibe.name}
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* SOURCE FILTER CHIPS */}
                  <section className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-serif italic text-sm text-accent-sienna font-bold">01.5</span>
                      <h4 className="text-[10px] font-black text-txt-secondary uppercase tracking-widest">Filter by Source</h4>
                    </div>
                    
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        { id: 'all', name: '🪐 All Sources' },
                        { id: 'uploaded', name: '📁 Uploaded' },
                        { id: 'jamendo', name: '🎵 Jamendo' },
                        { id: 'archive', name: '🏛️ Archive' },
                        { id: 'youtube', name: '📺 YouTube' }
                      ].map((src) => (
                        <button
                          key={src.id}
                          onClick={() => setSelectedSource(src.id as any)}
                          className={`px-4 py-2 rounded-full border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            selectedSource === src.id
                              ? 'bg-accent-amber border-accent-amber text-[#0C0A09]'
                              : 'bg-bg-secondary border-border-subtle text-txt-secondary hover:text-txt-primary hover:border-border-warm/30'
                          }`}
                        >
                          {src.name}
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* 2. MUSIC GRIDS FLOOR */}
                  <section className="flex flex-col gap-6">
                    <div className="flex items-center justify-between border-b border-border-subtle/50 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-serif italic text-lg text-accent-amber font-bold">02</span>
                        <h3 className="font-serif font-black text-2xl uppercase tracking-wider text-txt-primary">
                          Catalog Tracks
                        </h3>
                      </div>
                      
                      {/* Grid/List View switcher toggler */}
                      <div className="flex items-center gap-2 border border-border-subtle/80 rounded-lg p-0.5 bg-bg-secondary">
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            viewMode === 'grid' ? 'bg-accent-amber/10 text-accent-amber' : 'text-txt-muted hover:text-txt-primary'
                          }`}
                        >
                          <Grid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setViewMode('list')}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            viewMode === 'list' ? 'bg-accent-amber/10 text-accent-amber' : 'text-txt-muted hover:text-txt-primary'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Staggered lists render */}
                    <div>
                      {isLoading ? (
                        viewMode === 'grid' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                            {Array.from({ length: 8 }).map((_, idx) => (
                              <TrackCardSkeleton key={idx} />
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 bg-bg-secondary border border-border-subtle rounded-2xl p-4">
                            {Array.from({ length: 6 }).map((_, idx) => (
                              <div key={idx} className="h-14 bg-bg-tertiary rounded-xl animate-waveform-idle" />
                            ))}
                          </div>
                        )
                      ) : mappedChartTracks.length === 0 ? (
                        <div className="text-center py-12 text-txt-muted text-xs font-semibold">
                          No songs match this vibe filter yet.
                        </div>
                      ) : viewMode === 'grid' ? (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0 },
                            visible: {
                              opacity: 1,
                              transition: {
                                staggerChildren: 0.05
                              }
                            }
                          }}
                          initial="hidden"
                          animate="visible"
                          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6"
                        >
                          {sortedChartTracks.map((track) => (
                            <TrackCard
                              key={track.id}
                              track={track}
                              isPlaying={isPlaying}
                              isCurrent={activeTrackObj?.id === track.id}
                              onPlay={play}
                              onToggleLike={onToggleLike}
                              onCache={handleCache}
                              onAddToPlaylist={handleAddToPlaylist}
                            />
                          ))}
                        </motion.div>
                      ) : (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0 },
                            visible: {
                              opacity: 1,
                              transition: {
                                staggerChildren: 0.04
                              }
                            }
                          }}
                          initial="hidden"
                          animate="visible"
                          className="flex flex-col gap-2 bg-bg-secondary border border-border-subtle rounded-2xl p-4"
                        >
                          {sortedChartTracks.map((track, i) => {
                            const isCurrent = activeTrackObj?.id === track.id;
                            return (
                              <motion.div
                                key={track.id}
                                variants={{
                                  hidden: { opacity: 0, y: 8 },
                                  visible: { opacity: 1, y: 0 }
                                }}
                                onClick={() => play(track)}
                                className={`flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-bg-tertiary/45 transition-colors cursor-pointer ${
                                  isCurrent ? 'bg-bg-tertiary/75 border border-border-warm/20' : 'border border-transparent'
                                }`}
                              >
                                <span className="font-serif italic text-xs text-txt-muted w-4">
                                  {String(i + 1).padStart(2, '0')}
                                </span>
                                
                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#181615] flex-shrink-0 border border-border-subtle">
                                  <img src={track.coverUrl} className="w-full h-full object-cover" alt="" />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-serif font-black truncate text-txt-primary">{track.title}</p>
                                  <p className="text-xs font-medium text-txt-muted truncate mt-0.5">{track.artist}</p>
                                </div>

                                <div className="text-xs font-bold text-txt-muted">
                                  {track.genre}
                                </div>

                                <div className="flex items-center gap-3">
                                  {/* Cache button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      cacheSong(track);
                                    }}
                                    className="p-1.5 rounded-lg text-txt-muted hover:text-accent-amber hover:bg-bg-tertiary/60 transition-colors cursor-pointer"
                                    title={track.cached ? "Cached Offline" : "Download Offline"}
                                  >
                                    {track.cached ? (
                                      <Check className="w-3.5 h-3.5 text-green-400" />
                                    ) : (
                                      <Download className="w-3.5 h-3.5" />
                                    )}
                                  </button>

                                  {/* Like button */}
                                  <button
                                    onClick={(e) => onToggleLike(track.id, e)}
                                    className="p-1.5 rounded-lg text-txt-muted hover:text-accent-rose hover:bg-bg-tertiary/60 transition-colors cursor-pointer"
                                    title={track.isLiked ? "Unlike" : "Like"}
                                  >
                                    <Heart className={`w-3.5 h-3.5 ${track.isLiked ? 'fill-[#E11D72] text-[#E11D72]' : ''}`} />
                                  </button>

                                  {/* Add to Playlist button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSongToAddToPlaylist(trackToSong(track));
                                      setShowAddModal(true);
                                    }}
                                    className="p-1.5 rounded-lg text-txt-muted hover:text-accent-amber hover:bg-bg-tertiary/60 transition-colors cursor-pointer"
                                    title="Add to Playlist"
                                  >
                                    <FolderPlus className="w-3.5 h-3.5" />
                                  </button>

                                  <span className="text-xs font-semibold text-txt-muted pr-2">
                                    {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                                  </span>
                                </div>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      )}
                    </div>
                  </section>

                  {/* 3. RECENTLY PLAYED HORIZONTAL ROLL */}
                  {history.length > 0 && (
                    <section className="flex flex-col gap-4">
                      <div className="flex items-center gap-3 border-b border-border-subtle/50 pb-2">
                        <span className="font-serif italic text-lg text-accent-sienna font-bold">03</span>
                        <h3 className="font-serif font-black text-2xl uppercase tracking-wider text-txt-primary">
                          Recently Played
                        </h3>
                      </div>

                      <motion.div 
                        variants={{
                          hidden: { opacity: 0 },
                          visible: {
                            opacity: 1,
                            transition: {
                              staggerChildren: 0.05
                            }
                          }
                        }}
                        initial="hidden"
                        animate="visible"
                        className="flex gap-4 overflow-x-auto py-2 custom-scrollbar"
                        style={{ 
                          WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)',
                          maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)' 
                        }}
                      >
                        {history.map((track) => (
                          <motion.div
                            key={track.id}
                            variants={{
                              hidden: { opacity: 0, y: 10 },
                              visible: { opacity: 1, y: 0 }
                            }}
                            onClick={() => play(track)}
                            className="group flex-shrink-0 w-32 cursor-pointer flex flex-col gap-2"
                          >
                            {/* Portrait ratio slab image */}
                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#181615] border border-border-subtle">
                              <img src={track.coverUrl} className="w-full h-full object-cover group-hover:scale-104 transition-all duration-300" alt="" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Play className="w-6 h-6 text-[#FAF7F4] fill-current" />
                              </div>
                            </div>
                            <div className="text-left">
                              <h5 className="font-serif font-bold text-[12px] text-txt-primary line-clamp-1">
                                {track.title}
                              </h5>
                              <p className="text-[10px] font-medium text-txt-muted truncate mt-0.5">
                                {track.artist}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </section>
                  )}

                  {/* 4. RECENTLY UPLOADED HORIZONTAL ROLL */}
                  {uploadedSongs.length > 0 && (
                    <section className="flex flex-col gap-4">
                      <div className="flex items-center gap-3 border-b border-border-subtle/50 pb-2">
                        <span className="font-serif italic text-lg text-accent-amber font-bold">04</span>
                        <h3 className="font-serif font-black text-2xl uppercase tracking-wider text-txt-primary">
                          Recently Uploaded
                        </h3>
                      </div>

                      <motion.div 
                        variants={{
                          hidden: { opacity: 0 },
                          visible: {
                            opacity: 1,
                            transition: {
                              staggerChildren: 0.05
                            }
                          }
                        }}
                        initial="hidden"
                        animate="visible"
                        className="flex gap-4 overflow-x-auto py-2 custom-scrollbar"
                        style={{ 
                          WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)',
                          maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)' 
                        }}
                      >
                        {uploadedSongs.map(songToTrack).map((track) => (
                          <motion.div
                            key={track.id}
                            variants={{
                              hidden: { opacity: 0, y: 10 },
                              visible: { opacity: 1, y: 0 }
                            }}
                            onClick={() => play(track)}
                            className="group flex-shrink-0 w-32 cursor-pointer flex flex-col gap-2"
                          >
                            {/* Portrait ratio slab image */}
                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#181615] border border-border-subtle">
                              <img src={track.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600"} className="w-full h-full object-cover group-hover:scale-104 transition-all duration-300" alt="" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Play className="w-6 h-6 text-[#FAF7F4] fill-current" />
                              </div>
                            </div>
                            <div className="text-left">
                              <h5 className="font-serif font-bold text-[12px] text-txt-primary line-clamp-1">
                                {track.title}
                              </h5>
                              <p className="text-[10px] font-medium text-txt-muted truncate mt-0.5">
                                {track.artist}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </section>
                  )}
                </>
              )}

              {/* ========================================================
                  MY LIBRARY VIEW ROUTE
                  ======================================================== */}
              {activeTab === 'library' && (
                <div className="flex flex-col gap-8">
                  {/* Library Subtabs swappers header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle/50 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-serif italic text-lg text-accent-amber font-bold">L</span>
                      <h3 className="font-serif font-black text-2xl uppercase tracking-wider text-txt-primary">
                        {selectedPlaylist ? selectedPlaylist.name : 'My Music Library'}
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { setLibrarySubTab('liked'); setSelectedPlaylist(null); }}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          librarySubTab === 'liked' && !selectedPlaylist
                            ? 'bg-accent-amber/10 border-accent-amber text-accent-amber'
                            : 'bg-bg-secondary border-border-subtle text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        Likes ({mappedLikedTracks.length})
                      </button>
                      <button
                        onClick={() => { setLibrarySubTab('cached'); setSelectedPlaylist(null); }}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          librarySubTab === 'cached' && !selectedPlaylist
                            ? 'bg-accent-amber/10 border-accent-amber text-accent-amber'
                            : 'bg-bg-secondary border-border-subtle text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        Offline Cache ({mappedLibraryTracks.length})
                      </button>
                      <button
                        onClick={() => { setLibrarySubTab('uploaded'); setSelectedPlaylist(null); }}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          librarySubTab === 'uploaded' && !selectedPlaylist
                            ? 'bg-accent-amber/10 border-accent-amber text-accent-amber'
                            : 'bg-bg-secondary border-border-subtle text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        Uploaded ({mappedUploadedTracks.length})
                      </button>
                      <button
                        onClick={() => { setLibrarySubTab('playlists'); }}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          librarySubTab === 'playlists'
                            ? 'bg-accent-amber/10 border-accent-amber text-accent-amber'
                            : 'bg-bg-secondary border-border-subtle text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        Playlists ({playlists.length})
                      </button>
                    </div>
                  </div>

                  {/* Playlist display or subtab contents */}
                  {selectedPlaylist ? (
                    <div className="flex flex-col gap-4 bg-bg-secondary border border-border-subtle rounded-2xl p-6">
                      <div className="flex justify-between items-center pb-3 border-b border-border-subtle/40">
                        <div>
                          <p className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Playlist Details</p>
                          <h4 className="font-serif font-black text-2xl text-txt-primary mt-1">{selectedPlaylist.name}</h4>
                        </div>
                        <button
                          onClick={(e) => handleDeletePlaylist(selectedPlaylist.id, e)}
                          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" /> Delete Playlist
                        </button>
                      </div>

                      {mappedPlaylistTracks.length === 0 ? (
                        <div className="py-8 text-center text-txt-muted text-xs font-semibold">
                          No songs in this playlist. Tap search or likes to append tracks.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 mt-2">
                          {mappedPlaylistTracks.map((track, i) => (
                            <div
                              key={track.id}
                              onClick={() => play(track)}
                              className="flex items-center justify-between px-4 py-3 rounded-xl bg-bg-tertiary/20 hover:bg-bg-tertiary/50 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-4">
                                <span className="font-serif italic text-xs text-txt-muted">{String(i + 1).padStart(2, '0')}</span>
                                <div className="w-9 h-9 rounded bg-[#181615] overflow-hidden border border-border-subtle">
                                  <img src={track.coverUrl} className="w-full h-full object-cover" alt="" />
                                </div>
                                <div>
                                  <p className="text-sm font-serif font-black text-txt-primary truncate">{track.title}</p>
                                  <p className="text-[10px] font-medium text-txt-muted truncate mt-0.5">{track.artist}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-txt-muted">{Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveSongFromPlaylist(selectedPlaylist.id, track.id, e);
                                  }}
                                  className="p-1.5 rounded-lg text-txt-muted hover:text-red-400 hover:bg-bg-tertiary transition-colors cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {/* LIKED SONGS LIST */}
                      {librarySubTab === 'liked' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                          {mappedLikedTracks.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-txt-muted text-xs font-semibold">
                              No liked records yet. Start exploration using Discover tab.
                            </div>
                          ) : (
                            mappedLikedTracks.map((track) => (
                              <TrackCard
                                key={track.id}
                                track={track}
                                isPlaying={isPlaying}
                                isCurrent={activeTrackObj?.id === track.id}
                                onPlay={play}
                                onToggleLike={onToggleLike}
                                onCache={handleCache}
                                onAddToPlaylist={handleAddToPlaylist}
                              />
                            ))
                          )}
                        </div>
                      )}

                      {/* OFFLINE CACHED SONGS LIST */}
                      {librarySubTab === 'cached' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                          {mappedLibraryTracks.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-txt-muted text-xs font-semibold">
                              No tracks cached locally. Turn on caching in song tiles.
                            </div>
                          ) : (
                            mappedLibraryTracks.map((track) => (
                              <TrackCard
                                key={track.id}
                                track={track}
                                isPlaying={isPlaying}
                                isCurrent={activeTrackObj?.id === track.id}
                                onPlay={play}
                                onToggleLike={onToggleLike}
                                onCache={handleCache}
                                onAddToPlaylist={handleAddToPlaylist}
                              />
                            ))
                          )}
                        </div>
                      )}

                        {/* UPLOADED SONGS LIST */}
                        {librarySubTab === 'uploaded' && (
                          <div className="flex flex-col gap-6">
                            {/* Upload Track banner */}
                            <div className="flex items-center gap-4 justify-between bg-bg-secondary p-5 border border-border-subtle rounded-2xl">
                              <div>
                                <h4 className="font-serif font-black text-lg text-txt-primary">My Uploaded Tracks</h4>
                                <p className="text-xs text-txt-muted mt-1">Upload files from your device to stream them anywhere.</p>
                              </div>
                              
                              <button
                                onClick={() => setShowUploadModal(true)}
                                className="px-4 py-2.5 rounded-xl bg-accent-amber text-[#0C0A09] text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2"
                              >
                                <Music className="w-4 h-4" /> Upload Track
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                              {mappedUploadedTracks.length === 0 ? (
                                <div className="col-span-full py-12 text-center text-txt-muted text-xs font-semibold">
                                  No uploaded tracks yet. Upload your first track above.
                                </div>
                              ) : (
                                mappedUploadedTracks.map((track) => (
                                  <TrackCard
                                    key={track.id}
                                    track={track}
                                    isPlaying={isPlaying}
                                    isCurrent={activeTrackObj?.id === track.id}
                                    onPlay={play}
                                    onToggleLike={onToggleLike}
                                    onCache={handleCache}
                                    onAddToPlaylist={handleAddToPlaylist}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        )}

                      {/* PLAYLISTS COLLECTION */}
                      {librarySubTab === 'playlists' && (
                        <div className="flex flex-col gap-6">
                          {/* Create Playlist action triggers */}
                          <div className="flex items-center gap-4 justify-between bg-bg-secondary p-5 border border-border-subtle rounded-2xl">
                            <div>
                              <h4 className="font-serif font-black text-lg text-txt-primary">Create New Playlist</h4>
                              <p className="text-xs text-txt-muted mt-1">Organize your records manually or compile instantly with AI generators.</p>
                            </div>
                            
                            <div className="flex gap-3">
                              <button
                                onClick={() => setShowCreateModal(true)}
                                className="px-4 py-2.5 rounded-xl border border-border-subtle hover:border-border-warm/30 text-xs font-bold uppercase tracking-wider text-txt-secondary hover:text-txt-primary transition-all cursor-pointer flex items-center gap-2"
                              >
                                <FolderPlus className="w-4 h-4" /> Custom Playlist
                              </button>
                            </div>
                          </div>

                          {/* AI Playlist Generator prompt block */}
                          <div className="bg-gradient-to-br from-[#1C1714] to-[#141210] p-6 border border-border-warm/20 rounded-2xl flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-accent-amber" />
                              <h4 className="font-serif italic font-bold text-sm text-accent-amber">AI Playlist Generator</h4>
                            </div>
                            
                            <form 
                              onSubmit={(e) => {
                                  e.preventDefault();
                                  handleGenerateAIPlaylist(aiPrompt);
                              }}
                              className="flex gap-3 w-full"
                            >
                              <input
                                type="text"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="Describe a vibe, artist, or style (e.g. 'Chill late night jazz for rainy evening')"
                                className="flex-1 bg-bg-primary border border-border-subtle rounded-xl px-4 py-3 text-xs font-semibold placeholder-text-muted/65 focus:outline-none focus:border-accent-amber text-txt-primary transition-all"
                              />
                              <button
                                type="submit"
                                disabled={isGeneratingAIPlaylist}
                                className="px-5 py-3 bg-accent-amber text-[#0C0A09] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                              >
                                {isGeneratingAIPlaylist ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                                  </>
                                ) : (
                                  'Generate'
                                )}
                              </button>
                            </form>
                          </div>

                          {/* Playlists grid rendering */}
                          {playlists.length === 0 ? (
                            <div className="text-center py-12 text-txt-muted text-xs font-semibold">
                              No playlists created yet. Start by creating a custom folder above.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                              {playlists.map((p) => (
                                <div
                                  key={p.id}
                                  onClick={() => setSelectedPlaylist(p)}
                                  className="group flex flex-col w-full aspect-[4/5] rounded-2xl border border-border-subtle bg-bg-tertiary overflow-hidden cursor-pointer shadow-lg hover:border-border-warm/25 transition-all p-5 justify-between text-left"
                                >
                                  <div className="w-12 h-12 rounded-xl bg-accent-amber/10 border border-accent-amber/25 flex items-center justify-center text-accent-amber group-hover:scale-105 transition-transform duration-300">
                                    <Library className="w-5 h-5" />
                                  </div>
                                  
                                  <div>
                                    <h5 className="font-serif font-black text-lg text-txt-primary leading-tight line-clamp-2 mt-4">{p.name}</h5>
                                    <p className="text-[10px] font-bold text-txt-muted tracking-widest uppercase mt-2">
                                      {p.song_count} Records
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ========================================================
            C. RIGHT PANEL — "THE BOOTH"
            ======================================================== */}
        <aside
          className={`
            bg-bg-secondary flex flex-col justify-between h-screen overflow-hidden z-30 transition-all duration-300
            ${windowWidth < 768
              ? `fixed inset-0 w-full z-50 ${isBoothOpen && activeTrackObj ? 'translate-x-0' : 'translate-x-full'}`
              : windowWidth < 1024
                ? `fixed top-0 right-0 bottom-0 w-[320px] z-40 border-l border-border-subtle shadow-2xl ${isBoothOpen && activeTrackObj ? 'translate-x-0' : 'translate-x-full'}`
                : `w-full border-l border-border-subtle relative ${isBoothOpen && activeTrackObj ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
            }
          `}
        >
          <div className="w-full md:w-[320px] h-full flex flex-col py-6 px-6 overflow-y-auto custom-scrollbar gap-0 relative mx-auto">
            {/* Close panel toggle button */}
            <button
              onClick={toggleBooth}
              className="absolute top-4 right-4 p-2 rounded-xl hover:bg-bg-tertiary text-txt-muted hover:text-txt-primary transition-all cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {activeTrackObj && (
              <>
                {/* Top: Vinyl Album rotating with shared transition layoutId */}
                <div className="flex flex-col items-center mt-6 flex-shrink-0">
                  <VinylRecord
                    coverUrl={activeTrackObj.coverUrl}
                    isPlaying={isPlaying}
                    size="md"
                    className="shadow-2xl border-4 border-border-subtle"
                    layoutId={`vinyl-cover-${activeTrackObj.id}`}
                  />
                  <h4 className="font-serif font-black text-lg text-txt-primary mt-6 text-center line-clamp-1 w-full px-2">
                    {activeTrackObj.title}
                  </h4>
                  <p className="text-xs font-semibold text-txt-secondary mt-1 text-center line-clamp-1 w-full px-2">
                    {activeTrackObj.artist}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
                    {activeTrackObj.source === 'uploaded' && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-extrabold uppercase tracking-wide">
                        Uploaded
                      </span>
                    )}
                    {activeTrackObj.source === 'jamendo' && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-extrabold uppercase tracking-wide">
                        Jamendo
                      </span>
                    )}
                    {activeTrackObj.source === 'archive' && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-extrabold uppercase tracking-wide">
                        Archive
                      </span>
                    )}
                    {activeTrackObj.source === 'youtube' && (
                      <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-extrabold uppercase tracking-wide">
                        YouTube
                      </span>
                    )}
                    {activeTrackObj.cached && (
                      <span className="px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] font-extrabold uppercase tracking-wide">
                        Cached
                      </span>
                    )}
                  </div>

                  {/* Like + Add to Playlist actions */}
                  <div className="flex items-center gap-3 mt-4">
                    {/* Like Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const song = trackToSong(activeTrackObj);
                        handleToggleLike(song, e);
                      }}
                      title={activeTrackObj.isLiked ? 'Unlike' : 'Like'}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-bold transition-all cursor-pointer ${
                        activeTrackObj.isLiked
                          ? 'bg-accent-rose/15 border-accent-rose text-[#E11D72]'
                          : 'bg-bg-primary border-border-subtle text-txt-muted hover:border-accent-rose hover:text-[#E11D72]'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 transition-all ${activeTrackObj.isLiked ? 'fill-[#E11D72]' : ''}`} />
                      <span>{activeTrackObj.isLiked ? 'Liked' : 'Like'}</span>
                    </button>

                    {/* Add to Playlist Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSongToAddToPlaylist(trackToSong(activeTrackObj));
                        fetchPlaylists();
                        setShowAddModal(true);
                      }}
                      title="Add to Playlist"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-border-subtle bg-bg-primary text-txt-muted hover:border-accent-amber hover:text-accent-amber text-xs font-bold transition-all cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Playlist</span>
                    </button>
                  </div>
                </div>

                {/* Middle: Waveform scrubber seeker */}
                <div className="my-6 flex-shrink-0">
                  {isLoading ? (
                    <ScrubberSkeleton />
                  ) : (
                    <WaveformScrubber
                      trackId={activeTrackObj.id}
                      currentTime={currentTime}
                      duration={duration}
                      onSeek={seek}
                      className="w-full"
                    />
                  )}
                  
                  {/* Audio controls playback metadata duration */}
                  <div className="flex justify-between items-center text-[10px] font-bold text-txt-muted mt-2">
                    <span>{Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}</span>
                    <span>{Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}</span>
                  </div>

                  {/* Primary controller button group */}
                  <div className="flex justify-center items-center gap-5 mt-4">
                    <MagneticButton
                      onClick={handlePrevSong}
                      className="p-3 rounded-full hover:bg-bg-tertiary text-txt-secondary hover:text-txt-primary transition-all"
                    >
                      <SkipBack className="w-4 h-4 fill-current" />
                    </MagneticButton>

                    <MagneticButton
                      onClick={handleTogglePlay}
                      className="p-4 rounded-full bg-accent-amber text-[#0C0A09] shadow-lg hover:scale-105 transition-transform"
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current translate-x-[2px]" />
                      )}
                    </MagneticButton>

                    <MagneticButton
                      onClick={handleNextSong}
                      className="p-3 rounded-full hover:bg-bg-tertiary text-txt-secondary hover:text-txt-primary transition-all"
                    >
                      <SkipForward className="w-4 h-4 fill-current" />
                    </MagneticButton>

                    <MagneticButton
                      onClick={toggleRepeat}
                      title={
                        repeatMode === 'one'
                          ? 'Repeat: One'
                          : repeatMode === 'all'
                          ? 'Repeat: All'
                          : 'Repeat: Off'
                      }
                      className={`p-3 rounded-full hover:bg-bg-tertiary transition-all cursor-pointer relative ${
                        repeatMode !== 'off' ? 'text-accent-amber font-bold' : 'text-txt-muted hover:text-txt-secondary'
                      }`}
                    >
                      {repeatMode === 'one' ? (
                        <div className="relative">
                          <Repeat className="w-4 h-4" />
                          <span className="absolute -top-1.5 -right-1.5 text-[7px] font-extrabold bg-[#0C0A09] text-accent-amber border border-accent-amber/35 rounded-full w-3 h-3 flex items-center justify-center">
                            1
                          </span>
                        </div>
                      ) : (
                        <Repeat className="w-4 h-4" />
                      )}
                    </MagneticButton>
                  </div>
                </div>

                {/* Dynamic canvas visualizer modes switcher */}
                <div className="h-24 flex-shrink-0 bg-bg-primary rounded-2xl overflow-hidden relative border border-border-subtle/50 flex flex-col justify-end p-2.5">
                  <div className="absolute inset-0 z-0">
                    <AudioVisualizer
                      audioElement={getGlobalAudioElement()}
                      isPlaying={isPlaying}
                      mode={visualizerMode}
                      coverUrl={activeTrackObj.coverUrl}
                    />
                  </div>
                  
                  {/* Visualizer modes toggler overlay */}
                  <div className="relative z-10 flex gap-1 bg-bg-secondary/80 backdrop-blur-md border border-border-subtle/40 rounded-lg p-0.5 self-center">
                    {(['bars', 'orbit', 'tape'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setVisualizerMode(m)}
                        className={`px-2 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                          visualizerMode === m ? 'bg-accent-amber text-[#0C0A09]' : 'text-txt-muted hover:text-txt-primary'
                        }`}
                      >
                        {m === 'bars' ? 'Bars' : m === 'orbit' ? 'Orbit' : 'Tape'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lyrics Section */}
                <div className="mt-5 flex-shrink-0">
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <Music className="w-3.5 h-3.5 text-accent-amber" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-txt-muted">Lyrics Preview</span>
                  </div>
                  <div className="h-32 overflow-hidden relative border border-border-subtle/30 rounded-xl p-3 bg-bg-primary/50">
                    <LyricsScroller lyricsData={lyrics} currentTime={currentTime} />
                  </div>
                </div>

                {/* Up Next / Similar Songs */}
                <div className="mt-5 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent-amber" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-txt-muted">Up Next / Similar</span>
                    </div>
                    <span className="text-[9px] font-bold text-txt-muted px-1.5 py-0.5 rounded bg-bg-primary border border-border-subtle/50">
                      {similarTracks.length} Songs
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                    {similarTracks.length === 0 ? (
                      <p className="text-center text-txt-muted text-[10px] font-semibold py-6">
                        No similar tracks found.
                      </p>
                    ) : (
                      similarTracks.map(track => {
                        const isSameArtist = track.artist.toLowerCase() === activeTrackObj.artist.toLowerCase();
                        const primaryGenre = track.genre ? track.genre.split('/')[0].trim() : 'Music';
                        return (
                          <button
                            key={track.id}
                            onClick={() => play(track)}
                            className="group flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-bg-tertiary/60 transition-all cursor-pointer text-left w-full border border-transparent hover:border-border-subtle/40"
                          >
                            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 border border-border-subtle/40 relative">
                              <img src={track.coverUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                              <div className="absolute inset-0 bg-[#0C0A09]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Play className="w-3 h-3 text-accent-amber fill-current" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold truncate text-txt-primary">{track.title}</p>
                              <p className="text-[9px] font-medium truncate text-txt-muted mt-0.5">{track.artist}</p>
                            </div>
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0 tracking-wider transition-colors ${
                              isSameArtist 
                                ? 'bg-accent-amber/10 text-accent-amber border border-accent-amber/20' 
                                : 'bg-bg-primary text-txt-muted border border-border-subtle/50'
                            }`}>
                              {isSameArtist ? 'Artist' : primaryGenre}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ========================================================
          D. BOTTOM PLAYER — FLOATING CAPSULE (Mobile / Collapsed)
          ======================================================== */}
      <AnimatePresence>
        {(!isBoothOpen || !activeTrackObj) && activeTrackObj && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 180 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-xl w-full px-4 z-40"
          >
            <div 
              onClick={toggleBooth}
              className="glass-panel flex items-center justify-between px-6 py-3 rounded-full hover:border-accent-amber/25 transition-all cursor-pointer gap-6 border border-border-warm bg-bg-card/90 backdrop-blur-[20px] shadow-2xl"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Mini record disc with shared layoutId */}
                <VinylRecord
                  coverUrl={activeTrackObj.coverUrl}
                  isPlaying={isPlaying}
                  size="sm"
                  layoutId={`vinyl-cover-${activeTrackObj.id}`}
                />
                
                {/* Metadata details */}
                <div className="text-left min-w-0 flex-1">
                  <h5 className="font-serif font-black text-sm text-txt-primary truncate flex items-center gap-1.5">
                    {activeTrackObj.title}
                    {activeTrackObj.source === 'uploaded' && <span className="px-1 py-0.2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-extrabold uppercase">Uploaded</span>}
                    {activeTrackObj.source === 'jamendo' && <span className="px-1 py-0.2 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-extrabold uppercase">Jamendo</span>}
                    {activeTrackObj.source === 'archive' && <span className="px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-extrabold uppercase">Archive</span>}
                    {activeTrackObj.source === 'youtube' && <span className="px-1 py-0.2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-extrabold uppercase">YouTube</span>}
                    {activeTrackObj.cached && <span className="px-1 py-0.2 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] font-extrabold uppercase">Cached</span>}
                  </h5>
                  <p className="text-[10px] font-semibold text-txt-muted truncate mt-0.5">{activeTrackObj.artist}</p>
                </div>
              </div>

              {/* Minimal Waveform seeker */}
              <div className="w-32 hidden md:block">
                <WaveformScrubber
                  trackId={activeTrackObj.id}
                  currentTime={currentTime}
                  duration={duration}
                  onSeek={seek}
                  className="w-full"
                />
              </div>

              {/* Play Pause trigger */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrevSong();
                  }}
                  className="p-3 text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <SkipBack className="w-3.5 h-3.5 fill-current" />
                </button>

                <MagneticButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay();
                  }}
                  className="p-3 rounded-full bg-accent-amber text-[#0C0A09] shadow min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current translate-x-[1px]" />
                  )}
                </MagneticButton>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextSong();
                  }}
                  className="p-3 text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <SkipForward className="w-3.5 h-3.5 fill-current" />
                </button>

                {/* Like button in mini capsule */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLike(trackToSong(activeTrackObj), e);
                  }}
                  title={activeTrackObj.isLiked ? 'Unlike' : 'Like'}
                  className="p-3 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <Heart className={`w-3.5 h-3.5 transition-all ${activeTrackObj.isLiked ? 'fill-[#E11D72] text-[#E11D72]' : 'text-txt-muted hover:text-[#E11D72]'}`} />
                </button>

                {/* Add to Playlist button in mini capsule */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSongToAddToPlaylist(trackToSong(activeTrackObj));
                    fetchPlaylists();
                    setShowAddModal(true);
                  }}
                  title="Add to Playlist"
                  className="p-3 text-txt-muted hover:text-accent-amber transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================
          SPOTLIGHT SEARCH MODAL Command Palette
          ======================================================== */}
      <SpotlightSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        tracks={seedTracks}
        onPlay={play}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* ========================================================
          SETTINGS CONFIGURATION MODAL
          ======================================================= */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="absolute inset-0" onClick={() => setShowSettingsModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-bg-secondary border border-border-subtle rounded-2xl max-w-md w-full p-6 relative z-10 shadow-2xl max-h-[88vh] overflow-y-auto custom-scrollbar"
            >
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="absolute top-4 right-4 p-1.5 text-txt-muted hover:text-txt-primary rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h4 className="font-serif font-black text-xl text-txt-primary border-b border-border-subtle/50 pb-3">Settings Panel</h4>
              
              <div className="flex flex-col gap-5 mt-5 text-left">

                {/* Default visualizer modes preferences */}
                <div>
                  <p className="text-xs font-bold text-txt-primary mb-2">Default Render Visualizer</p>
                  <div className="flex gap-2">
                    {(['bars', 'orbit', 'tape'] as const).map(style => (
                      <button
                        key={style}
                        onClick={() => setVisualizerMode(style)}
                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-colors cursor-pointer ${
                          visualizerMode === style 
                            ? 'bg-accent-amber border-accent-amber text-[#0C0A09]' 
                            : 'bg-bg-primary border-border-subtle text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        {style === 'bars' ? 'Bars' : style === 'orbit' ? 'Orbit' : 'Tape'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme preferences */}
                <div className="flex justify-between items-center pt-1">
                  <div>
                    <p className="text-xs font-bold text-txt-primary">Visual Mode Theme</p>
                    <p className="text-[10px] text-txt-muted mt-0.5">Toggle light session vs obsidian studio</p>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="px-4 py-2 rounded-xl bg-bg-primary border border-border-subtle hover:border-[#F59E0B]/20 text-[10px] font-black uppercase tracking-wider text-txt-secondary transition-colors cursor-pointer"
                  >
                    {theme === 'dark' ? 'Daylight' : 'Obsidian'}
                  </button>
                </div>

                {/* ── LANGUAGE PREFERENCES (inline) ── */}
                <div className="border-t border-border-subtle/40 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-3.5 h-3.5 text-accent-amber" />
                    <p className="text-xs font-bold text-txt-primary">Language Preferences</p>
                  </div>
                  <p className="text-[10px] text-txt-muted mb-3">Pick languages you enjoy — songs will be sorted to match</p>
                  <div className="flex flex-wrap gap-2">
                    {PREF_LANGUAGES.map(lang => {
                      const active = prefLangs.includes(lang.id);
                      return (
                        <button
                          key={lang.id}
                          onClick={() => setPrefLangs(prev =>
                            prev.includes(lang.id) ? prev.filter(l => l !== lang.id) : [...prev, lang.id]
                          )}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                            active
                              ? 'bg-accent-amber border-accent-amber text-[#0C0A09] shadow-sm shadow-accent-amber/30'
                              : 'bg-bg-primary border-border-subtle text-txt-secondary hover:border-accent-amber/40 hover:text-txt-primary'
                          }`}
                        >
                          {lang.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── SONG TYPE / GENRE PREFERENCES (inline) ── */}
                <div className="border-t border-border-subtle/40 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Music className="w-3.5 h-3.5 text-accent-sienna" />
                    <p className="text-xs font-bold text-txt-primary">Song Type Preferences</p>
                  </div>
                  <p className="text-[10px] text-txt-muted mb-3">Choose your favourite moods &amp; genres to personalise your feed</p>
                  <div className="flex flex-wrap gap-2">
                    {PREF_GENRES.map(genre => {
                      const active = prefGenres.includes(genre.id);
                      return (
                        <button
                          key={genre.id}
                          onClick={() => setPrefGenres(prev =>
                            prev.includes(genre.id) ? prev.filter(g => g !== genre.id) : [...prev, genre.id]
                          )}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                            active
                              ? 'bg-accent-sienna border-accent-sienna text-white shadow-sm shadow-accent-sienna/30'
                              : 'bg-bg-primary border-border-subtle text-txt-secondary hover:border-accent-sienna/40 hover:text-txt-primary'
                          }`}
                        >
                          {genre.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Save preferences button */}
                <button
                  disabled={prefSaving}
                  onClick={async () => {
                    setPrefSaving(true);
                    await savePreferences({ languages: prefLangs, genres: prefGenres });
                    setPrefSaving(false);
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-accent-amber to-accent-sienna text-[#0C0A09] text-xs font-black uppercase tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {prefSaving ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                  ) : (
                    <><Check className="w-3.5 h-3.5" /> Save Preferences</>
                  )}
                </button>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          PLAYLIST CREATE MODAL
          ======================================================= */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="absolute inset-0" onClick={() => setShowCreateModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-bg-secondary border border-border-subtle rounded-2xl max-w-md w-full p-6 relative z-10 shadow-2xl"
            >
              <button 
                onClick={() => setShowCreateModal(false)}
                className="absolute top-4 right-4 p-1.5 text-txt-muted hover:text-txt-primary rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h4 className="font-serif font-black text-xl text-txt-primary border-b border-border-subtle/50 pb-3">New Custom Playlist</h4>
              
              <form onSubmit={handleCreatePlaylist} className="flex flex-col gap-4 mt-4">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Enter playlist folder name..."
                  className="bg-bg-primary border border-border-subtle rounded-xl px-4 py-3 text-xs font-semibold placeholder-text-muted/65 focus:outline-none focus:border-accent-amber text-txt-primary transition-all"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full py-3 bg-accent-amber text-[#0C0A09] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Create Folder
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          ADD TO PLAYLIST MODAL
          ======================================================= */}
      <AnimatePresence>
        {showAddModal && songToAddToPlaylist && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="absolute inset-0" onClick={() => { setShowAddModal(false); setNewPlaylistName(''); }} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-bg-secondary border border-border-subtle rounded-2xl max-w-md w-full p-6 relative z-10 shadow-2xl"
            >
              <button 
                onClick={() => { setShowAddModal(false); setNewPlaylistName(''); }}
                className="absolute top-4 right-4 p-1.5 text-txt-muted hover:text-txt-primary rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h4 className="font-serif font-black text-xl text-txt-primary border-b border-border-subtle/50 pb-3">Add to Playlist</h4>
              <p className="text-xs text-txt-muted mt-2">Append "<strong>{songToAddToPlaylist.title}</strong>" to a playlist:</p>
              
              {/* Existing playlists list */}
              <div className="flex flex-col gap-2 mt-4 max-h-48 overflow-y-auto custom-scrollbar">
                {playlists.length === 0 ? (
                  <p className="text-xs text-txt-muted text-center py-4">No playlists yet. Create one below ↓</p>
                ) : (
                  playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => handleAddSongToPlaylist(playlist.id)}
                      className="group flex items-center justify-between px-4 py-3 rounded-xl bg-bg-primary hover:bg-accent-amber/10 hover:border-accent-amber/30 border border-transparent transition-all cursor-pointer text-left w-full"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-accent-amber/10 border border-accent-amber/20 flex items-center justify-center">
                          <Library className="w-3.5 h-3.5 text-accent-amber" />
                        </div>
                        <span className="text-xs font-semibold text-txt-primary group-hover:text-accent-amber transition-colors">{playlist.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-txt-muted">{playlist.song_count} Tracks</span>
                    </button>
                  ))
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border-subtle/50" />
                <span className="text-[10px] font-black text-txt-muted uppercase tracking-widest">Or Create New</span>
                <div className="flex-1 h-px bg-border-subtle/50" />
              </div>

              {/* Inline create new playlist form */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newPlaylistName.trim()) return;
                  const userId = useMusicStore.getState().deviceId;
                  try {
                    const res = await fetch(`/api/mobile/playlists?name=${encodeURIComponent(newPlaylistName)}&user_id=${encodeURIComponent(userId)}`, { method: 'POST' });
                    const data = await res.json();
                    if (data.status === 'success') {
                      await fetchPlaylists();
                      // Auto-add the song to the newly created playlist
                      const updatedPlaylists = useMusicStore.getState().playlists;
                      const newPL = updatedPlaylists.find(p => p.name === newPlaylistName);
                      if (newPL) {
                        await handleAddSongToPlaylist(newPL.id);
                      }
                      setNewPlaylistName('');
                    }
                  } catch (err) {
                    console.error('Error creating playlist from modal:', err);
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="New playlist name..."
                  className="flex-1 bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-xs font-semibold text-txt-primary placeholder-txt-muted/50 focus:outline-none focus:border-accent-amber transition-all"
                />
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  className="px-4 py-2.5 bg-accent-amber text-[#0C0A09] rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5 hover:bg-accent-amber/90"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Create
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MUSIC PREFERENCES MODAL
          ======================================================== */}
      <AnimatePresence>
        {showPrefsModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.93, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 200 }}
              className="bg-bg-secondary border border-border-subtle rounded-3xl max-w-2xl w-full relative z-10 shadow-2xl overflow-hidden"
            >
              {/* Gradient header */}
              <div className="relative bg-gradient-to-br from-accent-amber/20 via-accent-sienna/10 to-transparent p-8 pb-6 border-b border-border-subtle/50">
                <button
                  onClick={() => setShowPrefsModal(false)}
                  className="absolute top-5 right-5 p-2 text-txt-muted hover:text-txt-primary rounded-xl hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-accent-amber/20 border border-accent-amber/30 flex items-center justify-center">
                    <Sliders className="w-5 h-5 text-accent-amber" />
                  </div>
                  <div>
                    <h3 className="font-serif font-black text-2xl text-txt-primary">Music Preferences</h3>
                    <p className="text-xs text-txt-muted mt-0.5">Pick languages & genres — your catalog will be sorted to match your taste.</p>
                  </div>
                </div>
                {(prefLangs.length > 0 || prefGenres.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {prefLangs.map(l => (
                      <span key={l} className="text-[10px] font-bold px-2 py-1 rounded-full bg-accent-amber/20 text-accent-amber border border-accent-amber/30">
                        {PREF_LANGUAGES.find(x => x.id === l)?.label || l}
                      </span>
                    ))}
                    {prefGenres.map(g => (
                      <span key={g} className="text-[10px] font-bold px-2 py-1 rounded-full bg-accent-sienna/20 text-accent-sienna border border-accent-sienna/30">
                        {PREF_GENRES.find(x => x.id === g)?.label || g}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 flex flex-col gap-6 max-h-[60vh] overflow-y-auto custom-scrollbar">

                {/* Language section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4 text-accent-amber" />
                    <h4 className="text-xs font-black text-txt-primary uppercase tracking-widest">Language</h4>
                    <span className="text-[10px] font-bold text-txt-muted">(choose multiple)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PREF_LANGUAGES.map((lang) => {
                      const selected = prefLangs.includes(lang.id);
                      return (
                        <button
                          key={lang.id}
                          onClick={() => {
                            setPrefLangs(prev =>
                              prev.includes(lang.id)
                                ? prev.filter(x => x !== lang.id)
                                : [...prev, lang.id]
                            );
                          }}
                          className={`px-3 py-2 rounded-full border text-xs font-bold transition-all cursor-pointer ${
                            selected
                              ? 'bg-accent-amber text-[#0C0A09] border-accent-amber shadow-md shadow-accent-amber/20 scale-105'
                              : 'bg-bg-primary border-border-subtle text-txt-secondary hover:border-accent-amber/40 hover:text-txt-primary'
                          }`}
                        >
                          {lang.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Genre section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Music className="w-4 h-4 text-accent-sienna" />
                    <h4 className="text-xs font-black text-txt-primary uppercase tracking-widest">Genre / Mood</h4>
                    <span className="text-[10px] font-bold text-txt-muted">(choose multiple)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PREF_GENRES.map((genre) => {
                      const selected = prefGenres.includes(genre.id);
                      return (
                        <button
                          key={genre.id}
                          onClick={() => {
                            setPrefGenres(prev =>
                              prev.includes(genre.id)
                                ? prev.filter(x => x !== genre.id)
                                : [...prev, genre.id]
                            );
                          }}
                          className={`px-3 py-2 rounded-full border text-xs font-bold transition-all cursor-pointer ${
                            selected
                              ? 'bg-accent-sienna text-white border-accent-sienna shadow-md shadow-accent-sienna/20 scale-105'
                              : 'bg-bg-primary border-border-subtle text-txt-secondary hover:border-accent-sienna/40 hover:text-txt-primary'
                          }`}
                        >
                          {genre.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer action buttons */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle/50 bg-bg-primary/40">
                <button
                  onClick={() => {
                    setPrefLangs([]);
                    setPrefGenres([]);
                  }}
                  className="text-xs font-bold text-txt-muted hover:text-txt-primary transition-colors cursor-pointer"
                >
                  Clear all
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPrefsModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-border-subtle text-xs font-bold text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer"
                  >
                    Skip
                  </button>
                  <button
                    disabled={prefSaving}
                    onClick={async () => {
                      setPrefSaving(true);
                      await savePreferences({ languages: prefLangs, genres: prefGenres });
                      setPrefSaving(false);
                      setShowPrefsModal(false);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-amber text-[#0C0A09] text-xs font-black uppercase tracking-wider hover:bg-accent-amber/90 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {prefSaving ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                    ) : (
                      <><Check className="w-3.5 h-3.5" /> Save Preferences</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <UploadModal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} />
      <AIAssistantDrawer isOpen={isAIPanelOpen} onClose={() => setIsAIPanelOpen(false)} />
    </div>
  );
}
