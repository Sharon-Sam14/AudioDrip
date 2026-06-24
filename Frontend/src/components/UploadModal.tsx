import React, { useState } from 'react';
import { X, Upload, Music, Image as ImageIcon, Check, Loader2 } from 'lucide-react';
import { useMusicStore } from '../store/useMusicStore';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose }) => {
  const { uploadSong } = useMusicStore();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('Music');
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);

  if (!isOpen) return null;

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      // Auto-populate title from filename
      const cleanName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setTitle(cleanName);
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCoverFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile || !title.trim()) return;

    setIsUploading(true);
    setStatusMessage(null);
    setStatusType(null);

    const formData = new FormData();
    formData.append('audio', audioFile);
    if (coverFile) {
      formData.append('cover', coverFile);
    }
    formData.append('title', title);
    formData.append('artist', artist || 'Unknown');
    formData.append('album', album || 'Single');
    formData.append('genre', genre || 'Music');

    try {
      const success = await uploadSong(formData);
      if (success) {
        setStatusMessage('Track uploaded successfully!');
        setStatusType('success');
        // Reset state
        setAudioFile(null);
        setCoverFile(null);
        setTitle('');
        setArtist('');
        setAlbum('');
        setGenre('Music');
        setTimeout(() => {
          onClose();
          setStatusMessage(null);
        }, 1500);
      } else {
        setStatusMessage('Upload failed. Please check the file format and try again.');
        setStatusType('error');
      }
    } catch {
      setStatusMessage('Upload failed. Server connection error.');
      setStatusType('error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-bg-secondary border border-border-subtle rounded-3xl max-w-lg w-full relative z-10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-accent-amber/20 via-accent-sienna/10 to-transparent p-6 pb-4 border-b border-border-subtle/50">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-txt-muted hover:text-txt-primary rounded-xl hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent-amber/20 border border-accent-amber/30 flex items-center justify-center">
              <Upload className="w-5 h-5 text-accent-amber" />
            </div>
            <div>
              <h3 className="font-serif font-black text-xl text-txt-primary">Upload Music</h3>
              <p className="text-[11px] text-txt-muted mt-0.5">Stream your personal collection from any browser.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {statusMessage && (
            <div
              className={`text-xs font-semibold text-center p-3 rounded-lg border ${
                statusType === 'success'
                  ? 'text-green-400 bg-green-500/10 border-green-500/20'
                  : 'text-red-400 bg-red-500/10 border-red-500/20'
              }`}
            >
              {statusMessage}
            </div>
          )}

          {/* Audio File Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-txt-primary uppercase tracking-widest">Audio File</label>
            <div className="relative border-2 border-dashed border-border-subtle/50 hover:border-accent-amber/35 rounded-2xl p-4 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5 bg-bg-primary/20">
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                required={!audioFile}
              />
              <Music className={`w-6 h-6 ${audioFile ? 'text-green-400' : 'text-txt-muted'}`} />
              <p className="text-xs font-bold text-txt-primary">
                {audioFile ? audioFile.name : 'Select or drop audio file'}
              </p>
              <p className="text-[9px] text-txt-muted">MP3, M4A, WAV, or OGG up to 50MB</p>
            </div>
          </div>

          {/* Title and Artist */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-txt-primary uppercase tracking-widest">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track Title"
                className="bg-bg-primary border border-border-subtle rounded-xl px-4 py-2.5 text-xs font-semibold text-txt-primary focus:outline-none focus:border-accent-amber w-full"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-txt-primary uppercase tracking-widest">Artist</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist Name"
                className="bg-bg-primary border border-border-subtle rounded-xl px-4 py-2.5 text-xs font-semibold text-txt-primary focus:outline-none focus:border-accent-amber w-full"
              />
            </div>
          </div>

          {/* Album and Genre */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-txt-primary uppercase tracking-widest">Album</label>
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Album (optional)"
                className="bg-bg-primary border border-border-subtle rounded-xl px-4 py-2.5 text-xs font-semibold text-txt-primary focus:outline-none focus:border-accent-amber w-full"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-txt-primary uppercase tracking-widest">Genre</label>
              <input
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Genre (e.g. Lofi, Jazz)"
                className="bg-bg-primary border border-border-subtle rounded-xl px-4 py-2.5 text-xs font-semibold text-txt-primary focus:outline-none focus:border-accent-amber w-full"
              />
            </div>
          </div>

          {/* Cover Art Image Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-txt-primary uppercase tracking-widest">Cover Image (Optional)</label>
            <div className="relative border-2 border-dashed border-border-subtle/50 hover:border-accent-amber/35 rounded-2xl p-4 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5 bg-bg-primary/20">
              <input
                type="file"
                accept="image/*"
                onChange={handleCoverChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <ImageIcon className={`w-6 h-6 ${coverFile ? 'text-green-400' : 'text-txt-muted'}`} />
              <p className="text-xs font-bold text-txt-primary">
                {coverFile ? coverFile.name : 'Select or drop artwork image'}
              </p>
              <p className="text-[9px] text-txt-muted">PNG, JPG, or WEBP square photo</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-2 border-t border-border-subtle/40 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border-subtle text-xs font-bold text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !audioFile || !title.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-amber text-[#0C0A09] text-xs font-black uppercase tracking-wider hover:bg-accent-amber/90 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Upload Track
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadModal;
