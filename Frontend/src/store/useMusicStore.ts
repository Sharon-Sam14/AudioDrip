import { create } from 'zustand';
import { extractDominantColors, updateSkinCSSVariables } from '../utils/ColorExtractor';

export interface Track {
  id: string;
  title: string;
  artist: string;
  artist_id?: number;
  album: string;
  duration: number; // seconds
  genre: "Jazz" | "Electronic" | "Soul" | "Hip-Hop" | "Ambient" | "R&B" | string;
  coverUrl: string; // cover image
  audioUrl: string;
  playCount: number;
  isLiked: boolean;
  badge?: "Hot" | "New" | "Classic";
  cached?: boolean;
  source?: string;
  file_path?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  artist_id?: number;
  album: string;
  cover: string;
  cover_xl: string;
  duration: number;
  genre: string;
  cached?: boolean;
  liked?: boolean;
  source?: string;
  file_path?: string;
}

export const trackToSong = (t: Track): Song => ({
  id: t.id,
  title: t.title,
  artist: t.artist,
  artist_id: t.artist_id || 0,
  album: t.album,
  cover: t.coverUrl,
  cover_xl: t.coverUrl,
  duration: t.duration,
  genre: t.genre,
  cached: t.cached,
  liked: t.isLiked,
  source: t.source,
  file_path: t.file_path
});

export const songToTrack = (s: Song): Track => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  artist_id: s.artist_id || 0,
  album: s.album,
  coverUrl: s.cover_xl || s.cover,
  audioUrl: "",
  duration: s.duration || 0,
  genre: s.genre || "Music",
  playCount: 1000,
  isLiked: !!s.liked,
  cached: s.cached,
  source: s.source,
  file_path: s.file_path
});

export const seedTracks: Track[] = [
  {
    id: "3135556",
    title: "Harder, Better, Faster, Stronger",
    artist: "Daft Punk",
    album: "Discovery",
    duration: 224,
    genre: "Electronic",
    coverUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600",
    audioUrl: "https://cdns-preview-d.dzcdn.net/stream/c-d6fcd2a100b81b2cee89685371383797-6.mp3",
    playCount: 954000,
    isLiked: false,
    badge: "Classic"
  },
  {
    id: "1109731",
    title: "Take Five",
    artist: "Dave Brubeck",
    album: "Time Out",
    duration: 324,
    genre: "Jazz",
    coverUrl: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600",
    audioUrl: "https://cdns-preview-e.dzcdn.net/stream/c-e9c40212f4e0c4f8b9e69efc577018c1-3.mp3",
    playCount: 842000,
    isLiked: true,
    badge: "Hot"
  },
  {
    id: "302127",
    title: "Feeling Good",
    artist: "Nina Simone",
    album: "I Put A Spell On You",
    duration: 174,
    genre: "Soul",
    coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600",
    audioUrl: "https://cdns-preview-8.dzcdn.net/stream/c-86e00b81b2cee89685371383797c6d4-3.mp3",
    playCount: 720000,
    isLiked: false,
    badge: "New"
  },
  {
    id: "1424838642",
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    duration: 243,
    genre: "Ambient",
    coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600",
    audioUrl: "https://cdns-preview-a.dzcdn.net/stream/c-a12f5a04e578c7754d924d6738c6428c-4.mp3",
    playCount: 650000,
    isLiked: false
  }
];

export interface Playlist {
  id: number;
  name: string;
  song_count: number;
  created_at: string;
}

export interface UserPreferences {
  languages: string[];
  genres: string[];
}

// Generate or retrieve a stable per-device ID (replaces auth user_id)
function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'anonymous';
  let id = localStorage.getItem('audiodrip_device_id');
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('audiodrip_device_id', id);
  }
  return id;
}

interface MusicState {
  // Device identity (replaces auth user)
  deviceId: string;

  // Navigation / Tabs
  activeTab: 'discover' | 'search' | 'library' | 'playing';
  librarySubTab: 'liked' | 'playlists' | 'cached' | 'uploaded';

  // Data collections
  chartSongs: Song[];
  searchResults: Song[];
  librarySongs: Song[];
  likedSongs: Song[];
  uploadedSongs: Song[];
  playlists: Playlist[];
  selectedPlaylist: Playlist | null;
  playlistSongs: Song[];
  lyrics: { type: 'synced' | 'plain' | 'error'; text: string } | null;
  upNextSuggestions: Song[];

  // Search & Vibe queries
  searchQuery: string;
  isSearching: boolean;
  selectedVibe: string | null;

  // Player controls
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  currentTime: number;
  isMuted: boolean;
  repeatMode: 'off' | 'one' | 'all';
  visualizerMode: "bars" | "orbit" | "tape";
  skinColors: { primary: string; secondary: string };

  // Queue lists
  queue: Track[];
  history: Track[];

  // Modals & Panels UI
  isSidebarExpanded: boolean;
  isBoothOpen: boolean;
  isQueueOpen: boolean;
  isAIPanelOpen: boolean;
  viewMode: "grid" | "list";
  showCreateModal: boolean;
  newPlaylistName: string;
  showAddModal: boolean;
  showUploadModal: boolean;
  songToAddToPlaylist: Song | null;

  // User Preferences
  userPreferences: UserPreferences;
  showPrefsModal: boolean;

  // AI Playlist Generator
  isGeneratingAIPlaylist: boolean;

  // AI Chat Panel
  aiMessages: { role: 'user' | 'assistant'; content: string }[];
  isSendingAIMessage: boolean;

  // Theme
  theme: 'dark' | 'light';

  // Actions
  play: (track: Track) => void;
  pause: () => void;
  seek: (progress: number) => void;
  setVolume: (v: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  toggleLike: (id: string) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (id: string) => void;
  reorderQueue: (from: number, to: number) => void;
  setVisualizerMode: (mode: "bars" | "orbit" | "tape") => void;
  setSkinColors: (colors: { primary: string; secondary: string }) => void;
  toggleBooth: () => void;
  toggleQueue: () => void;
  setIsAIPanelOpen: (open: boolean) => void;
  toggleRepeat: () => void;
  toggleSidebar: () => void;
  setViewMode: (mode: "grid" | "list") => void;

  // Tab Setters
  setActiveTab: (tab: 'discover' | 'search' | 'library' | 'playing') => void;
  setLibrarySubTab: (subTab: 'liked' | 'playlists' | 'cached' | 'uploaded') => void;
  setSelectedPlaylist: (playlist: Playlist | null) => void;
  setNewPlaylistName: (name: string) => void;
  setShowCreateModal: (show: boolean) => void;
  setShowAddModal: (show: boolean) => void;
  setShowUploadModal: (show: boolean) => void;
  setSongToAddToPlaylist: (song: Song | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedVibe: (vibe: string | null) => void;

  // Data fetchers
  fetchChart: () => Promise<void>;
  fetchLibrary: () => Promise<void>;
  fetchLikedSongs: () => Promise<void>;
  fetchUploadedSongs: () => Promise<void>;
  fetchPlaylists: () => Promise<void>;
  fetchPlaylistSongs: (playlistId: number) => Promise<void>;
  fetchLyrics: (track: Track) => Promise<void>;
  fetchUpNextSuggestions: (songId: string) => Promise<void>;

  // Operations
  handleCreatePlaylist: (e?: React.FormEvent) => Promise<void>;
  handleDeletePlaylist: (playlistId: number, e?: React.MouseEvent) => Promise<void>;
  handleAddSongToPlaylist: (playlistId: number) => Promise<void>;
  handleRemoveSongFromPlaylist: (playlistId: number, songId: string, e?: React.MouseEvent) => Promise<void>;
  handleSearch: (e?: React.FormEvent) => Promise<void>;
  handleToggleLike: (song: Song, e?: React.MouseEvent) => Promise<void>;
  handleGenerateAIPlaylist: (prompt: string) => Promise<void>;
  cacheSong: (track: Track) => Promise<void>;
  uploadSong: (formData: FormData) => Promise<boolean>;
  sendAIMessage: (text: string) => Promise<void>;
  clearAIChat: () => void;
  fetchPreferences: () => Promise<void>;
  savePreferences: (prefs: UserPreferences) => Promise<void>;
  setShowPrefsModal: (show: boolean) => void;
  toggleTheme: () => void;

  // App initialization (replaces initAuth)
  initApp: () => void;
}

// Global Audio Binding
let audio: HTMLAudioElement | null = null;
if (typeof window !== 'undefined') {
  audio = new Audio();
  audio.crossOrigin = 'anonymous';
}

export const useMusicStore = create<MusicState>((set, get) => {
  // Bind audio events to update store
  if (audio) {
    audio.addEventListener('timeupdate', () => {
      const dur = audio!.duration || 1;
      const cur = audio!.currentTime || 0;
      set({ 
        currentTime: cur,
        progress: cur / dur
      });
    });
    audio.addEventListener('durationchange', () => {
      set({ duration: audio!.duration || 0 });
    });
    audio.addEventListener('ended', () => {
      const { repeatMode, currentTrack, play, skipNext } = get();
      if (repeatMode === 'one' && currentTrack) {
        play(currentTrack);
      } else if (repeatMode === 'off') {
        const { queue } = get();
        if (queue.length > 0 && currentTrack) {
          const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
          if (currentIndex < queue.length - 1) {
            skipNext();
          } else {
            set({ isPlaying: false });
          }
        }
      } else {
        skipNext();
      }
    });
  }

  return {
    // Device ID (replaces auth user — initialized lazily in initApp)
    deviceId: 'anonymous',

    // Navigation Tabs
    activeTab: 'discover',
    librarySubTab: 'liked',

    // Data lists
    chartSongs: [],
    searchResults: [],
    librarySongs: [],
    likedSongs: [],
    uploadedSongs: [],
    playlists: [],
    selectedPlaylist: null,
    playlistSongs: [],
    lyrics: null,
    upNextSuggestions: [],

    // Searches
    searchQuery: '',
    isSearching: false,
    selectedVibe: null,

    // Player default states
    currentTrack: null,
    isPlaying: false,
    volume: 0.8,
    progress: 0,
    duration: 0,
    currentTime: 0,
    isMuted: false,
    repeatMode: 'off',
    visualizerMode: 'bars',
    skinColors: { primary: '#F59E0B', secondary: '#E11D72' },

    // Queue lists
    queue: [],
    history: [],

    // User Preferences
    userPreferences: { languages: [], genres: [] },
    showPrefsModal: false,

    // UI Panel configurations
    isSidebarExpanded: false,
    isBoothOpen: false,
    isQueueOpen: false,
    isAIPanelOpen: false,
    viewMode: 'grid',
    showCreateModal: false,
    newPlaylistName: '',
    showAddModal: false,
    showUploadModal: false,
    songToAddToPlaylist: null,

    // AI
    isGeneratingAIPlaylist: false,
    aiMessages: [],
    isSendingAIMessage: false,
    theme: (typeof window !== 'undefined' ? (localStorage.getItem('audiodrip_theme') as 'light' | 'dark' | null) : 'dark') || 'dark',

    // Actions
    play: async (track: Track) => {
      if (!audio) return;
      
      set({ 
        currentTrack: track,
        isPlaying: false 
      });

      // Extract dominant skin colors and update root variables directly
      try {
        const colors = await extractDominantColors(track.coverUrl);
        set({ skinColors: colors });
        updateSkinCSSVariables(colors.primary, colors.secondary);
      } catch (e) {
        console.error("Failed to extract color skins:", e);
      }

      // Fetch real playable stream URL from backend
      let streamUrl = track.audioUrl;
      try {
        const deviceId = get().deviceId;
        const response = await fetch(`/api/mobile/play?id=${track.id}&artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}&user_id=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        if (data.url) {
          streamUrl = data.url;
        } else if (data.error) {
          console.error("Backend error getting stream URL:", data.error);
        }
      } catch (err) {
        console.error("Failed to retrieve playback stream from backend:", err);
      }

      // Play audio stream
      try {
        audio.src = streamUrl;
        audio.volume = get().isMuted ? 0 : get().volume;
        await audio.play();
        set({ isPlaying: true });

        // Add to history
        set((state) => {
          const cleanHist = state.history.filter(h => h.id !== track.id);
          return { history: [track, ...cleanHist].slice(0, 50) };
        });
      } catch (err) {
        console.error("Playback start warning:", err);
      }

      // Fetch lyrics
      get().fetchLyrics(track);
      
      // Fetch up next suggestions
      get().fetchUpNextSuggestions(track.id);
    },

    pause: () => {
      if (!audio) return;
      if (get().isPlaying) {
        audio.pause();
        set({ isPlaying: false });
      } else if (get().currentTrack) {
        audio.play().catch(() => {});
        set({ isPlaying: true });
      }
    },

    seek: (progressRatio: number) => {
      if (!audio) return;
      const targetTime = progressRatio * (get().duration || 0);
      audio.currentTime = targetTime;
      set({ 
        currentTime: targetTime,
        progress: progressRatio 
      });
    },

    setVolume: (v: number) => {
      if (audio) {
        audio.volume = get().isMuted ? 0 : v;
      }
      set({ volume: v, isMuted: v === 0 });
    },

    skipNext: () => {
      const { queue, currentTrack } = get();
      if (queue.length === 0) return;
      const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
      
      const nextIndex = (currentIndex + 1) % queue.length;
      get().play(queue[nextIndex]);
    },

    skipPrev: () => {
      if (!audio) return;
      // Restart track if played past 3 seconds
      if (audio.currentTime > 3) {
        audio.currentTime = 0;
        set({ currentTime: 0, progress: 0 });
      } else {
        const { queue, currentTrack } = get();
        if (queue.length === 0) return;
        const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
        
        const prevIndex = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
        get().play(queue[prevIndex]);
      }
    },

    toggleLike: (id: string) => {
      set((state) => {
        const updateList = (list: Track[]) =>
          list.map(t => t.id === id ? { ...t, isLiked: !t.isLiked } : t);

        const nextQueue = updateList(state.queue);
        const nextHistory = updateList(state.history);
        const nextCurrentTrack = state.currentTrack && state.currentTrack.id === id
          ? { ...state.currentTrack, isLiked: !state.currentTrack.isLiked }
          : state.currentTrack;

        return {
          queue: nextQueue,
          history: nextHistory,
          currentTrack: nextCurrentTrack
        };
      });
    },

    addToQueue: (track: Track) => {
      set((state) => {
        if (state.queue.some(t => t.id === track.id)) return {};
        return { queue: [...state.queue, track] };
      });
    },

    removeFromQueue: (id: string) => {
      set((state) => ({
        queue: state.queue.filter(t => t.id !== id)
      }));
    },

    reorderQueue: (from: number, to: number) => {
      set((state) => {
        const nextQueue = [...state.queue];
        const [moved] = nextQueue.splice(from, 1);
        nextQueue.splice(to, 0, moved);
        return { queue: nextQueue };
      });
    },

    setVisualizerMode: (mode) => set({ visualizerMode: mode }),
    setSkinColors: (colors) => {
      set({ skinColors: colors });
      updateSkinCSSVariables(colors.primary, colors.secondary);
    },
    toggleBooth: () => set((state) => ({ isBoothOpen: !state.isBoothOpen })),
    toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen })),
    setIsAIPanelOpen: (open) => set({ isAIPanelOpen: open }),
    toggleSidebar: () => set((state) => ({ isSidebarExpanded: !state.isSidebarExpanded })),
    toggleRepeat: () => {
      const current = get().repeatMode;
      let next: 'off' | 'one' | 'all' = 'off';
      if (current === 'off') next = 'one';
      else if (current === 'one') next = 'all';
      set({ repeatMode: next });
    },
    setViewMode: (mode) => set({ viewMode: mode }),

    // Tab Setters
    setActiveTab: (tab) => set({ activeTab: tab }),
    setLibrarySubTab: (subTab) => set({ librarySubTab: subTab }),
    setSelectedPlaylist: (playlist) => set({ selectedPlaylist: playlist }),
    setNewPlaylistName: (name) => set({ newPlaylistName: name }),
    setShowCreateModal: (show) => set({ showCreateModal: show }),
    setShowAddModal: (show) => set({ showAddModal: show }),
    setShowUploadModal: (show) => set({ showUploadModal: show }),
    setSongToAddToPlaylist: (song) => set({ songToAddToPlaylist: song }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSelectedVibe: (vibe) => set({ selectedVibe: vibe }),
    setShowPrefsModal: (show) => set({ showPrefsModal: show }),

    fetchPreferences: async () => {
      const { deviceId } = get();
      if (deviceId && deviceId !== 'anonymous') {
        // Try fetching from backend (saves cross-device if user reuses same device_id)
        try {
          const res = await fetch(`/api/mobile/preferences?user_id=${encodeURIComponent(deviceId)}`);
          const data = await res.json();
          const prefs: UserPreferences = {
            languages: data.languages || [],
            genres: data.genres || [],
          };
          set({ userPreferences: prefs });
          localStorage.setItem('audiodrip_prefs', JSON.stringify(prefs));
          return;
        } catch (err) {
          console.error('Error fetching preferences from backend:', err);
        }
      }
      // Fallback: load from localStorage
      const stored = localStorage.getItem('audiodrip_prefs');
      if (stored) {
        try {
          const prefs = JSON.parse(stored) as UserPreferences;
          set({ userPreferences: prefs });
        } catch { /* ignore */ }
      }
    },

    savePreferences: async (prefs: UserPreferences) => {
      set({ userPreferences: prefs });
      localStorage.setItem('audiodrip_prefs', JSON.stringify(prefs));
      const { deviceId } = get();
      try {
        await fetch('/api/mobile/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: deviceId, ...prefs }),
        });
      } catch (err) {
        console.error('Error saving preferences to backend:', err);
      }
      // Refresh chart with new preferences applied
      await get().fetchChart();
    },

    fetchChart: async () => {
      const { deviceId } = get();
      try {
        const response = await fetch(`/api/mobile/chart?user_id=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
          const mapped: Track[] = data.map(songToTrack);
          set({ queue: mapped, chartSongs: data });
        }
      } catch (err) {
        console.error("Error loading charts from backend:", err);
      }
    },

    fetchLibrary: async () => {
      const { deviceId } = get();
      try {
        const response = await fetch(`/api/mobile/cached?user_id=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          set({ librarySongs: data });
        }
      } catch (err) {
        console.error("Error fetching offline cache:", err);
      }
    },

    fetchUploadedSongs: async () => {
      const { deviceId } = get();
      try {
        const response = await fetch(`/api/mobile/uploaded?user_id=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          set({ uploadedSongs: data });
        }
      } catch (err) {
        console.error("Error fetching uploaded songs:", err);
      }
    },

    fetchLikedSongs: async () => {
      const { deviceId } = get();
      try {
        const response = await fetch(`/api/mobile/liked?user_id=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          set({ likedSongs: data });
        }
      } catch (err) {
        console.error("Error fetching liked songs:", err);
      }
    },

    fetchPlaylists: async () => {
      const { deviceId } = get();
      try {
        const response = await fetch(`/api/mobile/playlists?user_id=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          set({ playlists: data });
        }
      } catch (err) {
        console.error("Error fetching playlists:", err);
      }
    },

    fetchPlaylistSongs: async (playlistId: number) => {
      const { deviceId } = get();
      try {
        const response = await fetch(`/api/mobile/playlists/${playlistId}/songs?user_id=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          set({ playlistSongs: data });
        }
      } catch (err) {
        console.error("Error fetching playlist songs:", err);
      }
    },

    fetchLyrics: async (track) => {
      try {
        const response = await fetch(`/api/mobile/lyrics?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`);
        const data = await response.json();
        set({ lyrics: data });
      } catch (err) {
        console.error('Error fetching lyrics:', err);
        set({ lyrics: { type: 'error', text: 'Lyrics unavailable.' } });
      }
    },

    fetchUpNextSuggestions: async (songId) => {
      try {
        const response = await fetch(`/api/mobile/up_next?song_id=${encodeURIComponent(songId)}&limit=5`);
        const data = await response.json();
        if (Array.isArray(data)) {
          set({ upNextSuggestions: data });
        }
      } catch (err) {
        console.error("Error fetching suggestions:", err);
      }
    },

    handleCreatePlaylist: async (e) => {
      if (e) e.preventDefault();
      const { newPlaylistName, deviceId } = get();
      if (!newPlaylistName.trim()) return;
      try {
        const response = await fetch(`/api/mobile/playlists?name=${encodeURIComponent(newPlaylistName)}&user_id=${encodeURIComponent(deviceId)}`, {
          method: 'POST'
        });
        const data = await response.json();
        if (data.status === 'success') {
          await get().fetchPlaylists();
          set({ showCreateModal: false, newPlaylistName: '' });
        }
      } catch (err) {
        console.error("Error creating playlist:", err);
      }
    },

    handleDeletePlaylist: async (playlistId, e) => {
      if (e) e.stopPropagation();
      try {
        const response = await fetch(`/api/mobile/playlists/delete?id=${playlistId}`, {
          method: 'POST'
        });
        const data = await response.json();
        if (data.status === 'success') {
          await get().fetchPlaylists();
          set({ selectedPlaylist: null });
        }
      } catch (err) {
        console.error("Error deleting playlist:", err);
      }
    },

    handleAddSongToPlaylist: async (playlistId) => {
      const { songToAddToPlaylist } = get();
      if (!songToAddToPlaylist) return;
      try {
        const response = await fetch(`/api/mobile/playlists/${playlistId}/add?song_id=${encodeURIComponent(songToAddToPlaylist.id)}`, {
          method: 'POST'
        });
        const data = await response.json();
        if (data.status === 'success') {
          await get().fetchPlaylistSongs(playlistId);
          await get().fetchPlaylists();
          set({ showAddModal: false, songToAddToPlaylist: null });
        }
      } catch (err) {
        console.error("Error adding song to playlist:", err);
      }
    },

    handleRemoveSongFromPlaylist: async (playlistId, songId, e) => {
      if (e) e.stopPropagation();
      try {
        const response = await fetch(`/api/mobile/playlists/${playlistId}/remove?song_id=${encodeURIComponent(songId)}`, {
          method: 'POST'
        });
        const data = await response.json();
        if (data.status === 'success') {
          await get().fetchPlaylistSongs(playlistId);
          await get().fetchPlaylists();
        }
      } catch (err) {
        console.error("Error removing song from playlist:", err);
      }
    },

    handleSearch: async (e) => {
      if (e) e.preventDefault();
      const { searchQuery, deviceId } = get();
      if (!searchQuery.trim()) return;

      set({ isSearching: true });
      try {
        const response = await fetch(`/api/mobile/search?q=${encodeURIComponent(searchQuery)}&user_id=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
          const mapped: Track[] = data.map(songToTrack);
          set({ searchResults: data, queue: mapped });
        }
      } catch (err) {
        console.error("Error searching backend:", err);
      } finally {
        set({ isSearching: false });
      }
    },

    handleToggleLike: async (song, e) => {
      if (e) e.stopPropagation();
      const { deviceId } = get();
      try {
        const response = await fetch(`/api/mobile/like?song_id=${encodeURIComponent(song.id)}&user_id=${encodeURIComponent(deviceId)}`, {
          method: 'POST'
        });
        const data = await response.json();
        if (data.status === 'success') {
          get().toggleLike(song.id);
          await get().fetchLikedSongs();
          await get().fetchChart();
        }
      } catch (err) {
        console.error("Error toggling like on backend:", err);
      }
    },

    handleGenerateAIPlaylist: async (prompt) => {
      if (!prompt.trim()) return;
      set({ isGeneratingAIPlaylist: true });
      const { deviceId } = get();
      try {
        const response = await fetch(`/api/mobile/ai_playlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, user_id: deviceId })
        });
        const data = await response.json();
        if (data.status === 'success') {
          await get().fetchPlaylists();
          const playlistList = get().playlists;
          const newPL = playlistList.find(p => p.id === data.playlist.id) || data.playlist;
          set({
            activeTab: 'library',
            selectedPlaylist: newPL,
            librarySubTab: 'playlists'
          });
          await get().fetchPlaylistSongs(newPL.id);
        }
      } catch (err) {
        console.error("Error generating AI playlist:", err);
      } finally {
        set({ isGeneratingAIPlaylist: false });
      }
    },

    cacheSong: async (track: Track) => {
      try {
        const response = await fetch('/api/mobile/cache_song', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: track.id,
            artist: track.artist,
            title: track.title
          })
        });
        const data = await response.json();
        if (data.status === 'queued') {
          set((state) => {
            const updateCached = (list: Track[]) =>
              list.map(t => t.id === track.id ? { ...t, cached: true } : t);
            
            const updateCachedSong = (list: Song[]) =>
              list.map(s => s.id === track.id ? { ...s, cached: true } : s);

            return {
              queue: updateCached(state.queue),
              history: updateCached(state.history),
              chartSongs: updateCachedSong(state.chartSongs),
              searchResults: updateCachedSong(state.searchResults),
              currentTrack: state.currentTrack && state.currentTrack.id === track.id
                ? { ...state.currentTrack, cached: true }
                : state.currentTrack
            };
          });

          setTimeout(() => {
            get().fetchLibrary();
            get().fetchChart();
          }, 3000);
        }
      } catch (err) {
        console.error("Error requesting song download/cache:", err);
      }
    },

    uploadSong: async (formData: FormData) => {
      try {
        const response = await fetch('/api/mobile/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        if (data.status === 'success') {
          await get().fetchUploadedSongs();
          return true;
        }
        return false;
      } catch (err) {
        console.error("Error uploading track:", err);
        return false;
      }
    },

    sendAIMessage: async (text: string) => {
      const { aiMessages, deviceId } = get();
      const updatedMessages = [...aiMessages, { role: 'user' as const, content: text }];
      set({ aiMessages: updatedMessages, isSendingAIMessage: true });
      
      try {
        const response = await fetch('/api/mobile/ai_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history: aiMessages, user_id: deviceId }),
        });
        const data = await response.json();
        if (data.reply) {
          set({
            aiMessages: [...updatedMessages, { role: 'assistant' as const, content: data.reply }],
          });
        } else if (data.error) {
          set({
            aiMessages: [...updatedMessages, { role: 'assistant' as const, content: `Error: ${data.error}` }],
          });
        }
      } catch (err) {
        console.error("AI Chat error:", err);
        set({
          aiMessages: [...updatedMessages, { role: 'assistant' as const, content: "Sorry, I encountered an issue connecting to the AI helper." }],
        });
      } finally {
        set({ isSendingAIMessage: false });
      }
    },

    clearAIChat: () => set({ aiMessages: [] }),

    // App initialization (replaces initAuth — no auth, just setup)
    initApp: () => {
      if (typeof window === 'undefined') return;

      // Apply saved theme
      const savedTheme = localStorage.getItem('audiodrip_theme') || 'dark';
      if (savedTheme === 'light') {
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
      }

      // Initialize stable device ID
      const deviceId = getOrCreateDeviceId();
      set({ deviceId });

      // Load stored preferences
      const storedPrefs = localStorage.getItem('audiodrip_prefs');
      if (storedPrefs) {
        try {
          const prefs = JSON.parse(storedPrefs) as UserPreferences;
          set({ userPreferences: prefs });
        } catch { /* ignore */ }
      }
    },

    toggleTheme: () => {
      const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        localStorage.setItem('audiodrip_theme', nextTheme);
        if (nextTheme === 'light') {
          document.documentElement.classList.add('light');
        } else {
          document.documentElement.classList.remove('light');
        }
      }
      set({ theme: nextTheme });
    }
  };
});

export const getGlobalAudioElement = () => audio;

let globalAnalyser: AnalyserNode | null = null;
export const getGlobalAnalyser = () => globalAnalyser;
export const setGlobalAnalyser = (analyser: AnalyserNode | null) => {
  globalAnalyser = analyser;
};
