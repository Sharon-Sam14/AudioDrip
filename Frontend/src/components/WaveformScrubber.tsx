import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface WaveformScrubberProps {
  trackId: string;
  currentTime: number;
  duration: number;
  onSeek: (progress: number) => void;
  className?: string;
}

export const WaveformScrubber: React.FC<WaveformScrubberProps> = ({
  trackId,
  currentTime,
  duration,
  onSeek,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const totalBars = 70;
  const progressRatio = duration > 0 ? currentTime / duration : 0;

  // Simple deterministic LCG random helper based on trackId
  const getHeights = (id: string, count: number): number[] => {
    let hash = 0;
    const str = id || 'fallback-id';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let seed = Math.abs(hash || 12345);
    const heights: number[] = [];
    for (let i = 0; i < count; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      heights.push(0.15 + (seed / 233280) * 0.8);
    }
    return heights;
  };

  const heights = getHeights(trackId, totalBars);

  const renderWaveform = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const gap = 2.5;
    const barWidth = (w - (totalBars - 1) * gap) / totalBars;
    const midY = h / 2;

    const style = getComputedStyle(document.documentElement);
    const skinPrimary = style.getPropertyValue('--skin-primary').trim() || '#F59E0B';
    const borderSubtle = style.getPropertyValue('--border-subtle').trim() || 'rgba(245, 240, 232, 0.08)';

    for (let i = 0; i < totalBars; i++) {
      const barProgress = i / totalBars;
      const isPlayed = barProgress <= progressRatio;
      
      ctx.fillStyle = isPlayed ? skinPrimary : borderSubtle;

      const barHeight = heights[i] * (h * 0.85);
      const x = i * (barWidth + gap);
      const topY = midY - barHeight / 2;

      ctx.beginPath();
      ctx.roundRect(x, topY, barWidth, barHeight, [2, 2, 2, 2]);
      ctx.fill();
    }
  }, [progressRatio, heights]);

  // Redraw when properties change
  useEffect(() => {
    renderWaveform();
  }, [renderWaveform]);

  // Handle ResizeObserver redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      renderWaveform();
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, [renderWaveform]);

  // Click & Drag seeking
  const handleSeek = React.useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = x / rect.width;
    onSeek(ratio);
  }, [onSeek]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleSeek(e);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMoveGlobal = (e: MouseEvent) => {
      handleSeek(e);
    };

    const handleMouseUpGlobal = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMoveGlobal);
    window.addEventListener('mouseup', handleMouseUpGlobal);

    return () => {
      window.removeEventListener('mousemove', handleMouseMoveGlobal);
      window.removeEventListener('mouseup', handleMouseUpGlobal);
    };
  }, [isDragging, handleSeek]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = x / rect.width;
    setHoverProgress(ratio);
    setHoverX(x);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setHoverProgress(null);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Invisible overlay for mouse events */}
      <div
        className="absolute inset-x-0 bottom-0 top-[-10px] z-30 cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
      />

      {/* Floating Hover Time Tooltip */}
      {isHovered && hoverProgress !== null && duration > 0 && (
        <div
          className="absolute z-40 bg-[#1A1714] text-[#F5F0E8] border border-skin-primary px-2 py-0.5 rounded text-[10px] font-bold pointer-events-none -translate-x-1/2 -top-6 shadow-md transition-colors"
          style={{ left: `${hoverX}px` }}
        >
          {formatTime(hoverProgress * duration)}
        </div>
      )}

      {/* Playhead vertical line in --skin-primary */}
      {duration > 0 && (
        <div
          className="absolute top-0 bottom-0 w-[1px] bg-skin-primary pointer-events-none z-20 transition-all duration-75 skin-fade"
          style={{ left: `${progressRatio * 100}%` }}
        />
      )}

      {/* Canvas container with spring height expand (40px -> 72px) on hover */}
      <motion.div
        animate={{ height: isHovered ? 72 : 40 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className="w-full flex items-center justify-center overflow-hidden"
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </motion.div>
    </div>
  );
};

export default WaveformScrubber;
