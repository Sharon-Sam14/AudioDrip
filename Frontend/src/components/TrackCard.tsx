import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Play, Pause, Heart, Download, Check, Plus } from 'lucide-react';
import type { Track } from '../store/useMusicStore';
import { VinylRecord } from './VinylRecord';

interface TrackCardProps {
  track: Track;
  isPlaying: boolean;
  isCurrent: boolean;
  onPlay: (track: Track) => void;
  onToggleLike?: (id: string, e: React.MouseEvent) => void;
  onCache?: (track: Track, e: React.MouseEvent) => void;
  onAddToPlaylist?: (track: Track, e: React.MouseEvent) => void;
  className?: string;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  isPlaying,
  isCurrent,
  onPlay,
  onToggleLike,
  onCache,
  onAddToPlaylist,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Soft Tilt Setup (max ±8deg, perspective: 1200px)
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 22, stiffness: 150, mass: 0.5 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left - width / 2;
    const mouseY = e.clientY - rect.top - height / 2;

    x.set(mouseX / width);
    y.set(mouseY / height);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Motion variants for staggering list entrance animations
  const cardVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 260,
        damping: 25
      }
    }
  };

  return (
    <motion.div
      ref={cardRef}
      variants={cardVariants}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={() => onPlay(track)}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        perspective: '1200px',
      }}
      className={`group relative flex flex-col w-full aspect-[4/5] rounded-2xl border border-border-subtle bg-bg-tertiary overflow-hidden cursor-pointer shadow-lg hover:shadow-xl hover:border-border-warm/30 transition-all duration-300 ${className}`}
    >
      {/* ZONE 1: ART SLAB (65% height) */}
      <motion.div 
        layoutId={`art-${track.id}`}
        className="relative w-full h-[65%] overflow-hidden bg-[#181615]"
      >
        {/* Cover image slowly zooming on hover */}
        <motion.img
          src={track.coverUrl}
          alt={track.title}
          animate={{ scale: isHovered ? 1.04 : 1.0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="w-full h-full object-cover pointer-events-none"
        />

        {/* Shadow scrim gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-transparent to-transparent opacity-90" />

        {/* Rotated badge in Inter uppercase, 11px, set against a near-black pill */}
        {track.badge && (
          <div className="absolute top-3 left-3 bg-[#141210]/90 border border-border-subtle text-txt-muted font-sans font-semibold px-2 py-0.5 rounded-full text-[11px] z-20 uppercase tracking-widest shadow-sm select-none transform -rotate-6">
            {track.badge}
          </div>
        )}

        {/* Play/Pause hover control overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(track);
            }}
            className="w-12 h-12 rounded-full bg-[#FAF7F4] text-[#0C0A09] flex items-center justify-center hover:scale-105 transition-transform duration-200 shadow-md"
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current translate-x-[2px]" />
            )}
          </button>
        </div>

        {/* Add to Playlist button */}
        {onAddToPlaylist && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToPlaylist(track, e);
            }}
            className="absolute top-3 right-[5.25rem] p-2 rounded-full bg-black/45 text-txt-primary hover:text-accent-amber hover:scale-110 transition-all z-20"
            title="Add to Playlist"
          >
            <Plus className="w-3.5 h-3.5 text-txt-primary" />
          </button>
        )}

        {/* Cache/Download button */}
        {onCache && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCache(track, e);
            }}
            className="absolute top-3 right-12 p-2 rounded-full bg-black/45 text-txt-primary hover:text-accent-amber hover:scale-110 transition-all z-20"
            title={track.cached ? "Cached Offline" : "Download Offline"}
          >
            {track.cached ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Download className="w-3.5 h-3.5 text-txt-primary" />
            )}
          </button>
        )}

        {/* Favorite/Heart top-right floating button */}
        {onToggleLike && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike(track.id, e);
            }}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/45 text-txt-primary hover:text-accent-rose hover:scale-110 transition-all z-20"
          >
            <Heart 
              className={`w-3.5 h-3.5 ${track.isLiked ? 'fill-[#E11D72] text-[#E11D72]' : 'text-txt-primary'}`} 
            />
          </button>
        )}
      </motion.div>

      {/* ZONE 2: INFO STRIP (35% height) */}
      <div className="relative flex-1 p-4 bg-bg-secondary flex flex-col justify-between border-t border-border-subtle/50 z-10">
        <div>
          {/* Sized to text-lg (18px) to satisfy typography restrictions for DM Serif Display */}
          <h4 className="font-serif text-lg font-black text-txt-primary leading-snug line-clamp-1">
            {track.title}
          </h4>
          <p className="text-[11px] font-medium text-txt-secondary line-clamp-1 mt-0.5">
            {track.artist}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {track.source === 'uploaded' && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-extrabold uppercase tracking-wide">
                Uploaded
              </span>
            )}
            {track.source === 'jamendo' && (
              <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-extrabold uppercase tracking-wide">
                Jamendo
              </span>
            )}
            {track.source === 'archive' && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-extrabold uppercase tracking-wide">
                Archive
              </span>
            )}
            {track.source === 'youtube' && (
              <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-extrabold uppercase tracking-wide">
                YouTube
              </span>
            )}
            {track.cached && (
              <span className="px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] font-extrabold uppercase tracking-wide">
                Cached
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          {/* Genre Tag Pill */}
          <span className="px-2 py-0.5 rounded-md bg-bg-tertiary border border-border-subtle/40 text-[9px] font-bold text-txt-muted">
            {track.genre}
          </span>
          <span className="text-[9px] font-semibold text-txt-muted">
            {formatDuration(track.duration)}
          </span>
        </div>
      </div>

      {/* Floating Vinyl Record (sm) sliding up from the bottom-right corner of the card on hover */}
      <div className="absolute right-2 bottom-12 pointer-events-none z-0">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={isHovered ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        >
          <VinylRecord 
            coverUrl={track.coverUrl} 
            isPlaying={isHovered} 
            size="sm" 
            className="shadow-2xl" 
          />
        </motion.div>
      </div>
    </motion.div>
  );
};

export default TrackCard;
