import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
// Supabase imports removed
import { getGenreForArtist } from '../data/genreMap';
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
  liked: t.isLiked
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
  cached: s.cached
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

interface MusicState {
  // Auth
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  showAuthModal: boolean;
  authView: 'signin' | 'signup' | 'forgot' | 'reset';
  authMessage: string | null;

  // Navigation / Tabs
  activeTab: 'discover' | 'search' | 'library' | 'playing';
  librarySubTab: 'liked' | 'playlists' | 'cached';

  // Data collections
  chartSongs: Song[];
  searchResults: Song[];
  librarySongs: Song[];
  likedSongs: Song[];
  playlists: Playlist[];
  selectedPlaylist: Playlist | null;
  playlistSongs: Song[];
  lyrics: { type: 'synced' | 'plain' | 'error'; text: string } | null;

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
  visualizerMode: "bars" | "orbit" | "tape";
  skinColors: { primary: string; secondary: string };

  // Queue lists
  queue: Track[];
  history: Track[];

  // Modals & Panels UI
  isSidebarExpanded: boolean;
  isBoothOpen: boolean;
  isQueueOpen: boolean;
  viewMode: "grid" | "list";
  showCreateModal: boolean;
  newPlaylistName: string;
  showAddModal: boolean;
  songToAddToPlaylist: Song | null;

  // AI Playlist Generator
  isGeneratingAIPlaylist: boolean;

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
  toggleSidebar: () => void;
  setViewMode: (mode: "grid" | "list") => void;

  // Tab Setters
  setActiveTab: (tab: 'discover' | 'search' | 'library' | 'playing') => void;
  setLibrarySubTab: (subTab: 'liked' | 'playlists' | 'cached') => void;
  setSelectedPlaylist: (playlist: Playlist | null) => void;
  setNewPlaylistName: (name: string) => void;
  setShowCreateModal: (show: boolean) => void;
  setShowAddModal: (show: boolean) => void;
  setSongToAddToPlaylist: (song: Song | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedVibe: (vibe: string | null) => void;
  setShowAuthModal: (show: boolean) => void;
  setAuthView: (view: 'signin' | 'signup' | 'forgot' | 'reset') => void;

  // ITunes/Deezer data triggers
  fetchChart: () => Promise<void>;
  fetchLibrary: () => Promise<void>;
  fetchLikedSongs: () => Promise<void>;
  fetchPlaylists: () => Promise<void>;
  fetchPlaylistSongs: (playlistId: number) => Promise<void>;
  fetchLyrics: (track: Track) => Promise<void>;

  // Operations
  handleCreatePlaylist: (e?: React.FormEvent) => Promise<void>;
  handleDeletePlaylist: (playlistId: number, e?: React.MouseEvent) => Promise<void>;
  handleAddSongToPlaylist: (playlistId: number) => Promise<void>;
  handleRemoveSongFromPlaylist: (playlistId: number, songId: string, e?: React.MouseEvent) => Promise<void>;
  handleSearch: (e?: React.FormEvent) => Promise<void>;
  handleToggleLike: (song: Song, e?: React.MouseEvent) => Promise<void>;
  handleGenerateAIPlaylist: (prompt: string) => Promise<void>;

  // Auth Operations
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initAuth: () => void;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  toggleTheme: () => void;
  theme: 'dark' | 'light';
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
      get().skipNext();
    });
  }

  return {
    // Auth
    user: null,
    authLoading: false,
    authError: null,
    showAuthModal: false,
    authView: 'signin',
    authMessage: null,

    // Navigation Tabs
    activeTab: 'discover',
    librarySubTab: 'liked',

    // Data lists
    chartSongs: [],
    searchResults: [],
    librarySongs: [],
    likedSongs: [],
    playlists: [],
    selectedPlaylist: null,
    playlistSongs: [],
    lyrics: null,

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
    visualizerMode: 'bars',
    skinColors: { primary: '#F59E0B', secondary: '#E11D72' },

    // Queue lists
    queue: [],
    history: [],

    // UI Panel configurations
    isSidebarExpanded: false,
    isBoothOpen: false,
    isQueueOpen: false,
    viewMode: 'grid',
    showCreateModal: false,
    newPlaylistName: '',
    showAddModal: false,
    songToAddToPlaylist: null,

    // AI
    isGeneratingAIPlaylist: false,
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

      // Play audio preview
      try {
        audio.src = track.audioUrl;
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
    toggleSidebar: () => set((state) => ({ isSidebarExpanded: !state.isSidebarExpanded })),
    setViewMode: (mode) => set({ viewMode: mode }),

    // Tab Setters
    setActiveTab: (tab) => set({ activeTab: tab }),
    setLibrarySubTab: (subTab) => set({ librarySubTab: subTab }),
    setSelectedPlaylist: (playlist) => set({ selectedPlaylist: playlist }),
    setNewPlaylistName: (name) => set({ newPlaylistName: name }),
    setShowCreateModal: (show) => set({ showCreateModal: show }),
    setShowAddModal: (show) => set({ showAddModal: show }),
    setSongToAddToPlaylist: (song) => set({ songToAddToPlaylist: song }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSelectedVibe: (vibe) => set({ selectedVibe: vibe }),
    setShowAuthModal: (show) => set({ showAuthModal: show, authError: null, authMessage: null }),
    setAuthView: (view) => set({ authView: view, authError: null, authMessage: null }),

    // DEEZER CHART LOADER
    fetchChart: async () => {
      try {
        const targetUrl = "https://api.deezer.com/chart/tracks?limit=12";
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        if (data && data.data) {
          const mapped: Track[] = data.data.map((item: { id: number; title: string; artist?: { name: string }; album?: { title: string; cover_xl: string }; duration: number; preview: string }, index: number) => {
            const artistName = item.artist?.name || "Unknown Artist";
            const genre = getGenreForArtist(artistName);
            
            let badge: "Hot" | "New" | "Classic" | undefined = undefined;
            if (index === 0) badge = "Hot";
            else if (index === 1) badge = "New";
            else if (index === 2) badge = "Classic";

            return {
              id: String(item.id),
              title: item.title || "Unknown Track",
              artist: artistName,
              album: item.album?.title || "Single",
              duration: item.duration || 180,
              genre,
              coverUrl: item.album?.cover_xl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600",
              audioUrl: item.preview || "",
              playCount: 100000 - index * 7000,
              isLiked: false,
              badge
            };
          });

          set({ queue: mapped, chartSongs: mapped.map(trackToSong) });
        }
      } catch (err) {
        console.error("Error loading Deezer charts:", err);
      }
    },

    fetchLibrary: async () => {
      // Stub library offline loaders
    },

    fetchLikedSongs: async () => {
      // Stub likes collections
    },

    fetchPlaylists: async () => {
      // Stub playlist indexes
    },

    fetchPlaylistSongs: async () => {
      // Stub playlist tracks loader
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

    // Operations
    handleCreatePlaylist: async (e) => {
      if (e) e.preventDefault();
      const { newPlaylistName } = get();
      if (!newPlaylistName.trim()) return;
      const id = Date.now();
      const newPlaylist: Playlist = {
        id,
        name: newPlaylistName,
        song_count: 0,
        created_at: new Date().toISOString()
      };
      set((state) => ({
        playlists: [...state.playlists, newPlaylist],
        showCreateModal: false,
        newPlaylistName: ''
      }));
    },

    handleDeletePlaylist: async (playlistId, e) => {
      if (e) e.stopPropagation();
      set((state) => ({
        playlists: state.playlists.filter(p => p.id !== playlistId),
        selectedPlaylist: null
      }));
    },

    handleAddSongToPlaylist: async (playlistId) => {
      const { songToAddToPlaylist } = get();
      if (!songToAddToPlaylist) return;

      set((state) => {
        const nextPlaylistSongs = [...state.playlistSongs, songToAddToPlaylist];
        const nextPlaylists = state.playlists.map(p => 
          p.id === playlistId ? { ...p, song_count: p.song_count + 1 } : p
        );
        return {
          playlistSongs: nextPlaylistSongs,
          playlists: nextPlaylists,
          showAddModal: false,
          songToAddToPlaylist: null
        };
      });
    },

    handleRemoveSongFromPlaylist: async (playlistId, songId, e) => {
      if (e) e.stopPropagation();
      set((state) => {
        const nextPlaylistSongs = state.playlistSongs.filter(s => s.id !== songId);
        const nextPlaylists = state.playlists.map(p => 
          p.id === playlistId ? { ...p, song_count: Math.max(0, p.song_count - 1) } : p
        );
        return {
          playlistSongs: nextPlaylistSongs,
          playlists: nextPlaylists
        };
      });
    },

    handleSearch: async (e) => {
      if (e) e.preventDefault();
      const { searchQuery } = get();
      if (!searchQuery.trim()) return;

      set({ isSearching: true });
      try {
        const targetUrl = `https://api.deezer.com/search?q=${encodeURIComponent(searchQuery)}&limit=25`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        if (data && data.data) {
          const mapped: Track[] = data.data.map((item: { id: number; title: string; artist?: { name: string }; album?: { title: string; cover_xl: string }; duration: number; preview: string }) => {
            const artistName = item.artist?.name || "Unknown Artist";
            return {
              id: String(item.id),
              title: item.title || "Unknown Track",
              artist: artistName,
              album: item.album?.title || "Single",
              duration: item.duration || 180,
              genre: getGenreForArtist(artistName),
              coverUrl: item.album?.cover_xl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600",
              audioUrl: item.preview || "",
              playCount: 50000,
              isLiked: false
            };
          });
          set({ searchResults: mapped.map(trackToSong), queue: mapped });
        }
      } catch (err) {
        console.error("Error searching Deezer:", err);
      } finally {
        set({ isSearching: false });
      }
    },

    handleToggleLike: async (song, e) => {
      if (e) e.stopPropagation();
      get().toggleLike(song.id);
      
      // Update likedSongs state locally
      set((state) => {
        const isCurrentlyLiked = state.likedSongs.some(s => s.id === song.id);
        const nextLiked = isCurrentlyLiked
          ? state.likedSongs.filter(s => s.id !== song.id)
          : [...state.likedSongs, { ...song, liked: true }];
        return { likedSongs: nextLiked };
      });
    },

    handleGenerateAIPlaylist: async (prompt) => {
      if (!prompt.trim()) return;
      set({ isGeneratingAIPlaylist: true });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const id = Date.now();
      const plName = `AI: ${prompt.slice(0, 20)}...`;
      
      set((state) => {
        const newPlaylist: Playlist = {
          id,
          name: plName,
          song_count: state.queue.slice(0, 6).length,
          created_at: new Date().toISOString()
        };
        return {
          playlists: [...state.playlists, newPlaylist],
          playlistSongs: state.queue.slice(0, 6).map(trackToSong),
          selectedPlaylist: newPlaylist,
          librarySubTab: 'playlists',
          isGeneratingAIPlaylist: false
        };
      });
    },

    // Auth actions implementation
    signUp: async (email, password) => {
      console.log(`signUp simulation: ${email} (pw len: ${password.length})`);
      set({ authLoading: true, authError: null, authMessage: null });
      await new Promise(resolve => setTimeout(resolve, 600));
      const mockUser = { id: `mock-user-${Date.now()}`, email };
      localStorage.setItem('audiodrip_mock_user', JSON.stringify(mockUser));
      set({ user: mockUser as unknown as User, authLoading: false });
    },

    signIn: async (email, password) => {
      console.log(`signIn simulation: ${email} (pw len: ${password.length})`);
      set({ authLoading: true, authError: null, authMessage: null });
      await new Promise(resolve => setTimeout(resolve, 600));
      const mockUser = { id: `mock-user-123`, email };
      localStorage.setItem('audiodrip_mock_user', JSON.stringify(mockUser));
      set({ user: mockUser as unknown as User, authLoading: false, showAuthModal: false });
    },

    signOut: async () => {
      set({ authLoading: true, authError: null, authMessage: null });
      localStorage.removeItem('audiodrip_mock_user');
      set({ user: null, authLoading: false });
    },

    initAuth: () => {
      const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('audiodrip_theme') || 'dark' : 'dark';
      if (typeof window !== 'undefined') {
        if (savedTheme === 'light') {
          document.documentElement.classList.add('light');
        } else {
          document.documentElement.classList.remove('light');
        }
      }

      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('audiodrip_mock_user');
        if (stored) {
          try {
            set({ user: JSON.parse(stored) });
          } catch {
            // Ignore parse errors
          }
        }
      }
    },

    sendPasswordResetEmail: async (email) => {
      console.log(`sendPasswordResetEmail simulation: ${email}`);
      set({ authLoading: true, authError: null, authMessage: null });
      await new Promise(resolve => setTimeout(resolve, 600));
      set({ 
        authMessage: 'Mock reset email sent! Click the button below to simulate password reset.', 
        authLoading: false 
      });
    },

    updatePassword: async (password) => {
      console.log(`updatePassword simulation (len: ${password.length})`);
      set({ authLoading: true, authError: null, authMessage: null });
      await new Promise(resolve => setTimeout(resolve, 600));
      set({ 
        authMessage: 'Password updated successfully (Mock)! Please sign in.', 
        authLoading: false, 
        authView: 'signin' 
      });
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

