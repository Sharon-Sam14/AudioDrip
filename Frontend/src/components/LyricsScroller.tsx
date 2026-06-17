/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface LyricLine {
  time: number;
  text: string;
}

interface LyricsScrollerProps {
  lyricsData: {
    type: 'synced' | 'plain' | 'error';
    text: string;
  } | null;
  currentTime: number;
}

export const LyricsScroller: React.FC<LyricsScrollerProps> = ({ lyricsData, currentTime }) => {
  const [parsedLyrics, setParsedLyrics] = useState<LyricLine[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // Parse lyrics when data changes
  useEffect(() => {
    if (!lyricsData) {
      setParsedLyrics([]);
      setActiveIndex(-1);
      return;
    }

    if (lyricsData.type === 'synced') {
      const lines = lyricsData.text.split('\n');
      const result: LyricLine[] = [];
      const timestampRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

      for (const line of lines) {
        const matches = [...line.matchAll(timestampRegex)];
        if (matches.length === 0) continue;

        // Strip out all timestamps to get the lyric text
        const text = line.replace(timestampRegex, '').trim();
        
        for (const match of matches) {
          const mins = parseInt(match[1], 10);
          const secs = parseInt(match[2], 10);
          const msStr = match[3] || '0';
          const msVal = parseInt(msStr, 10);
          const msFactor = msStr.length === 2 ? 10 : 1;
          const totalSeconds = mins * 60 + secs + (msVal * msFactor) / 1000;
          
          if (text) {
            result.push({ time: totalSeconds, text });
          }
        }
      }

      // Sort chronological
      result.sort((a, b) => a.time - b.time);
      setParsedLyrics(result);
      lineRefs.current = new Array(result.length).fill(null);
    } else {
      setParsedLyrics([]);
      setActiveIndex(-1);
    }
  }, [lyricsData]);

  // Sync active line based on current playtime
  useEffect(() => {
    if (parsedLyrics.length === 0) return;

    let targetIndex = -1;
    // Find the latest line that has a timestamp <= currentTime
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (currentTime >= parsedLyrics[i].time) {
        targetIndex = i;
      } else {
        break;
      }
    }

    if (targetIndex !== activeIndex) {
      setActiveIndex(targetIndex);
    }
  }, [currentTime, parsedLyrics, activeIndex]);

  // Scroll active line into center view
  useEffect(() => {
    if (activeIndex !== -1 && lineRefs.current[activeIndex]) {
      lineRefs.current[activeIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  if (!lyricsData) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 italic text-sm">
        Select a song to load lyrics
      </div>
    );
  }

  if (lyricsData.type === 'error' || !lyricsData.text) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center px-6">
        <span className="text-2xl mb-2">🎵</span>
        <p className="italic text-sm">Instrumental or lyrics unavailable for this song</p>
      </div>
    );
  }

  if (lyricsData.type === 'plain') {
    return (
      <div className="h-full overflow-y-auto px-6 py-8 text-center scroll-smooth">
        <div className="whitespace-pre-line text-zinc-300 leading-loose text-base font-light font-sans max-w-md mx-auto">
          {lyricsData.text}
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-y-auto px-4 py-[30%] text-center scrollbar-none scroll-smooth flex flex-col gap-5"
      style={{ maskImage: 'linear-gradient(to bottom, transparent, white 15%, white 85%, transparent)' }}
    >
      {parsedLyrics.map((line, idx) => {
        const isActive = idx === activeIndex;

        return (
          <motion.p
            key={idx}
            layout
            ref={el => { lineRefs.current[idx] = el; }}
            className={`transition-all duration-500 font-serif italic text-base md:text-lg px-3 py-1 text-center select-none ${
              isActive 
                ? 'text-[#F59E0B] scale-100 font-black drop-shadow-[0_0_8px_rgba(245,158,11,0.25)]' 
                : 'text-text-muted/65 scale-85 opacity-50'
            }`}
          >
            {line.text}
          </motion.p>
        );
      })}
    </div>
  );
};
