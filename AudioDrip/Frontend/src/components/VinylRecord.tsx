import React from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';

interface VinylRecordProps {
  coverUrl?: string;
  isPlaying: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  layoutId?: string;
}

const Tonearm: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  return (
    <motion.svg
      className="absolute top-[-40px] right-[-20px] w-[140px] h-[240px] pointer-events-none z-30"
      viewBox="0 0 140 240"
      initial={{ rotate: -28 }}
      animate={{ rotate: isPlaying ? 2 : -28 }}
      transition={{ type: "spring", stiffness: 180, damping: 20 }}
      style={{ originX: "90px", originY: "30px" }}
    >
      {/* Base ring */}
      <circle cx="90" cy="30" r="18" fill="#1A1714" stroke="#7A6E62" strokeWidth="2.5" />
      <circle cx="90" cy="30" r="8" fill="#FAF7F4" />
      
      {/* Counterweight */}
      <rect x="78" y="3" width="24" height="14" rx="2" fill="#7A6E62" />
      
      {/* Tonearm metallic wand */}
      <path d="M90 30 Q75 120 40 180" fill="none" stroke="#FAF7F4" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M40 180 L35 210" fill="none" stroke="#7A6E62" strokeWidth="2.5" />

      {/* Cartridge and headshell */}
      <rect x="23" y="206" width="20" height="26" rx="2" fill="#1A1714" transform="rotate(-15 33 220)" stroke="var(--skin-primary)" strokeWidth="1" />
      <circle cx="33" cy="220" r="3.5" fill="var(--skin-secondary)" />
    </motion.svg>
  );
};

export const VinylRecord: React.FC<VinylRecordProps> = ({
  coverUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300',
  isPlaying,
  size = 'md',
  className = '',
  layoutId,
}) => {
  const sizeMap = {
    sm: 48,
    md: 120,
    lg: 320,
  };

  const pixelSize = sizeMap[size];

  // Motion variants for spring raising and shadow bloom
  const containerVariants: Variants = {
    play: {
      y: -8,
      boxShadow: size === 'lg' 
        ? '0 30px 60px -15px rgba(0, 0, 0, 0.6)' 
        : size === 'md' 
        ? '0 15px 30px -8px rgba(0, 0, 0, 0.5)' 
        : '0 8px 16px -4px rgba(0, 0, 0, 0.4)',
      transition: {
        type: 'spring',
        damping: 18,
        stiffness: 120,
      }
    },
    pause: {
      y: 0,
      boxShadow: '0 4px 12px -2px rgba(0,0,0,0.5)',
      transition: {
        type: 'spring',
        damping: 18,
        stiffness: 120,
      }
    }
  };

  const innerRecordContent = (
    <>
      {/* Pressed Vinyl Texture & Grooves */}
      <div 
        className="absolute inset-0 rounded-full animate-grooves"
        style={{
          background: 'conic-gradient(from 0deg, #0d0b0a 0%, #1c1816 12%, #0d0b0a 25%, #1c1816 37%, #0d0b0a 50%, #1c1816 62%, #0d0b0a 75%, #1c1816 87%, #0d0b0a 100%)',
          animationPlayState: isPlaying ? 'running' : 'paused',
        }}
      />

      {/* Rotating grooves ring */}
      <div
        style={{
          animationPlayState: isPlaying ? 'running' : 'paused',
        }}
        className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none animate-grooves"
      >
        {/* 12 Concentric SVG grooves with alternating steps */}
        <svg className="absolute inset-0 w-full h-full opacity-45" viewBox="0 0 100 100">
          {Array.from({ length: 12 }).map((_, i) => {
            const r = 46 - i * 3.3;
            return (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={i % 2 === 0 ? "rgba(245, 240, 232, 0.09)" : "rgba(12, 10, 9, 0.28)"}
                strokeWidth={0.25 + i * 0.04}
              />
            );
          })}
        </svg>

        {/* Center label surrounded by a thin ring that transitions to --skin-primary */}
        <div 
          style={{
            width: size === 'lg' ? '100px' : size === 'md' ? '40px' : '18px',
            height: size === 'lg' ? '100px' : size === 'md' ? '40px' : '18px',
          }}
          className="relative rounded-full bg-[#0d0b0a] border-2 border-skin-primary skin-fade shadow-inner flex items-center justify-center overflow-hidden transition-all duration-500"
        >
          {coverUrl && (
            <img 
              src={coverUrl} 
              alt="label" 
              className="w-full h-full object-cover rounded-full pointer-events-none"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120';
              }}
            />
          )}
          
          {/* Spindle hole */}
          <div 
            style={{
              width: size === 'lg' ? '10px' : size === 'md' ? '5px' : '3px',
              height: size === 'lg' ? '10px' : size === 'md' ? '5px' : '3px',
            }}
            className="absolute rounded-full bg-[#090807] border border-[#141210] z-20"
          />
        </div>
      </div>
    </>
  );

  if (size === 'lg') {
    return (
      <div className="relative w-[320px] h-[320px] flex items-center justify-center">
        {/* Soft elliptical shadow bloom underneath */}
        <div 
          className="absolute inset-x-4 bottom-[-10px] h-20 rounded-full blur-[35px] opacity-25 z-0 skin-fade transition-all duration-300"
          style={{
            background: `radial-gradient(ellipse, var(--skin-primary) 0%, transparent 70%)`,
            transform: isPlaying ? 'scale(1.15) translateY(-5px)' : 'scale(1)',
          }}
        />
        
        {/* Record disc */}
        <motion.div
          layoutId={layoutId}
          variants={containerVariants}
          animate={isPlaying ? 'play' : 'pause'}
          style={{
            width: pixelSize,
            height: pixelSize,
          }}
          className={`relative rounded-full select-none cursor-pointer preserve-3d bg-[#090807] overflow-hidden z-10 ${className}`}
        >
          {innerRecordContent}
        </motion.div>

        {/* Pivot Tonearm */}
        <Tonearm isPlaying={isPlaying} />
      </div>
    );
  }

  return (
    <motion.div
      layoutId={layoutId}
      variants={containerVariants}
      animate={isPlaying ? 'play' : 'pause'}
      style={{
        width: pixelSize,
        height: pixelSize,
      }}
      className={`relative rounded-full select-none cursor-pointer preserve-3d bg-[#090807] overflow-hidden ${className}`}
    >
      {innerRecordContent}
    </motion.div>
  );
};

export default VinylRecord;
