import React, { useEffect, useRef, useState } from 'react';
import { setGlobalAnalyser } from '../store/useMusicStore';

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  mode: 'bars' | 'orbit' | 'tape';
  coverUrl?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioElement,
  isPlaying,
  mode,
  coverUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  const coverImageRef = useRef<HTMLImageElement | null>(null);
  const [isContextSuspended, setIsContextSuspended] = useState(false);

  // Pre-load cover art for circular mode
  useEffect(() => {
    if (coverUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = coverUrl;
      img.onload = () => {
        coverImageRef.current = img;
      };
    }
  }, [coverUrl]);

  // Audio setup: Bind media element source and analyser node
  useEffect(() => {
    if (!audioElement) return;

    const setupAnalyser = () => {
      if (audioContextRef.current) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        const activeMode = mode === 'tape' ? 'bars' : mode;
        analyser.fftSize = activeMode === 'orbit' ? 256 : 128;

        const source = ctx.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        setGlobalAnalyser(analyser);

        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        sourceRef.current = source;

        // Check suspended state
        if (ctx.state === 'suspended') {
          setIsContextSuspended(true);
        }
      } catch (err) {
        console.warn('Audio Context setup warning:', err);
      }
    };

    const handlePlay = () => {
      setupAnalyser();
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          setIsContextSuspended(false);
        });
      }
    };

    audioElement.addEventListener('play', handlePlay);
    if (isPlaying) {
      handlePlay();
    }

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('play', handlePlay);
      }
    };
  }, [audioElement, isPlaying, mode]);

  // Handle dynamic FFT size on mode updates
  useEffect(() => {
    if (analyserRef.current) {
      const activeMode = mode === 'tape' ? 'bars' : mode;
      analyserRef.current.fftSize = activeMode === 'orbit' ? 256 : 128;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
    }
  }, [mode]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Click to enable audio context bypass handler
    const handleCanvasClick = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          setIsContextSuspended(false);
        });
      }
    };
    window.addEventListener('click', handleCanvasClick);

    // Cross-fade progress trackers
    let lastTime = performance.now();
    let blendProgress = isPlaying ? 1 : 0;

    const render = (time: number) => {
      animationRef.current = requestAnimationFrame(render);

      const dt = time - lastTime;
      lastTime = time;

      // Smoothly blend cross-fade progress over 400ms
      if (isPlaying) {
        blendProgress = Math.min(1, blendProgress + dt / 400);
      } else {
        blendProgress = Math.max(0, blendProgress - dt / 400);
      }

      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      // Redraw clear with shadow trail
      ctx.fillStyle = 'rgba(12, 10, 9, 0.25)';
      ctx.fillRect(0, 0, w, h);

      // Fetch dynamic colors
      const style = getComputedStyle(document.documentElement);
      const skinPrimary = style.getPropertyValue('--skin-primary').trim() || '#F59E0B';
      const skinSecondary = style.getPropertyValue('--skin-secondary').trim() || '#E11D72';
      const colorMuted = style.getPropertyValue('--text-muted').trim() || '#7A6E62';

      // 1. Draw standby Tape sines (if not fully faded out)
      if (blendProgress < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - blendProgress;

        const timeVal = Date.now() * 0.002;
        const numLines = 3;
        for (let l = 0; l < numLines; l++) {
          ctx.beginPath();
          ctx.lineWidth = l === 0 ? 2.0 : 1.0;
          ctx.strokeStyle = l === 0 ? 'rgba(245, 240, 232, 0.4)' : l === 1 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(225, 29, 114, 0.15)';
          
          const amplitude = 12 - l * 3;
          const frequency = 0.007 + l * 0.003;
          const speed = timeVal * (1 + l * 0.2);

          for (let x = 0; x < w; x++) {
            const edgeMute = Math.sin((x / w) * Math.PI);
            const y = (h / 2) + Math.sin(x * frequency + speed) * amplitude * edgeMute;
            if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // 2. Draw active visualizer spectrums (if play blended)
      if (blendProgress > 0) {
        ctx.save();
        ctx.globalAlpha = blendProgress;

        const analyser = analyserRef.current;
        const dataArray = dataArrayRef.current;
        let hasData = false;

        if (analyser && dataArray) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          analyser.getByteFrequencyData(dataArray as any);
          hasData = dataArray.some(val => val > 0);
        }

        const activeMode = mode === 'tape' ? 'bars' : mode;

        if (activeMode === 'bars') {
          if (hasData && dataArray) {
            const barWidth = (w / dataArray.length) * 0.8;
            const gap = (w / dataArray.length) * 0.2;
            let x = gap / 2;

            for (let i = 0; i < dataArray.length; i++) {
              const boost = i < 15 ? 1.0 : i < 30 ? 1.3 : 1.7;
              const value = dataArray[i];
              const barHeight = Math.min((value / 255) * h * 0.75 * boost, h * 0.9);

              const grad = ctx.createLinearGradient(0, h, 0, h - barHeight);
              grad.addColorStop(0, skinSecondary);
              grad.addColorStop(1, skinPrimary);

              ctx.fillStyle = grad;
              ctx.shadowBlur = 10;
              ctx.shadowColor = skinPrimary;

              ctx.beginPath();
              const r = Math.max(2, barWidth / 2);
              ctx.roundRect(x, h - barHeight, barWidth, barHeight, [r, r, 0, 0]);
              ctx.fill();

              x += barWidth + gap;
            }
            ctx.shadowBlur = 0;
          }
        } 
        else if (activeMode === 'orbit') {
          const centerX = w / 2;
          const centerY = h / 2;
          
          let bassSum = 0;
          if (hasData && dataArray) {
            for (let i = 0; i < 8; i++) {
              bassSum += dataArray[i];
            }
          }
          const bassAvg = bassSum / 8;
          const baseRadius = Math.min(w, h) * 0.23 + (bassAvg / 255) * 12;

          // Project radial spikes
          const numSpikes = dataArray ? dataArray.length : 128;
          if (hasData && dataArray) {
            for (let i = 0; i < numSpikes; i++) {
              const angle = (i / numSpikes) * Math.PI * 2;
              const val = dataArray[i];
              const spikeLen = (val / 255) * 45;
              
              const startX = centerX + Math.cos(angle) * baseRadius;
              const startY = centerY + Math.sin(angle) * baseRadius;
              const endX = centerX + Math.cos(angle) * (baseRadius + spikeLen);
              const endY = centerY + Math.sin(angle) * (baseRadius + spikeLen);

              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.lineWidth = 2.0;
              ctx.strokeStyle = skinPrimary;
              ctx.stroke();
            }
          }

          // Render blurred inner cover image using offscreen canvas draws
          ctx.save();
          ctx.beginPath();
          ctx.arc(centerX, centerY, baseRadius - 3, 0, Math.PI * 2);
          ctx.clip();

          if (coverImageRef.current) {
            const size = (baseRadius - 3) * 2;
            const offscreen = document.createElement('canvas');
            offscreen.width = size;
            offscreen.height = size;
            const oCtx = offscreen.getContext('2d');
            
            if (oCtx) {
              oCtx.filter = 'blur(8px)';
              oCtx.drawImage(coverImageRef.current, 0, 0, size, size);
            }

            ctx.drawImage(offscreen, centerX - baseRadius + 3, centerY - baseRadius + 3, size, size);

            // Overlay dark shade to improve visibility
            ctx.fillStyle = 'rgba(12, 10, 9, 0.4)';
            ctx.fillRect(centerX - baseRadius + 3, centerY - baseRadius + 3, size, size);
          } else {
            const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius);
            grad.addColorStop(0, '#1A1714');
            grad.addColorStop(1, '#0C0A09');
            ctx.fillStyle = grad;
            ctx.fill();
          }
          ctx.restore();

          // Stroke thin ring around inner circle
          ctx.beginPath();
          ctx.arc(centerX, centerY, baseRadius - 3, 0, Math.PI * 2);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = skinPrimary;
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3. AudioContext Autoplay Blocker warning note
      if (isContextSuspended) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = colorMuted;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Click anywhere to enable audio', w / 2, h - 10);
        ctx.restore();
      }
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('click', handleCanvasClick);
    };
  }, [isPlaying, mode, isContextSuspended]);

  return <canvas ref={canvasRef} className="w-full h-full rounded-2xl" />;
};

export default AudioVisualizer;
