import React, { useEffect, useRef } from 'react';
import { useMusicStore, getGlobalAnalyser } from '../store/useMusicStore';

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

export const ParticleField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useMusicStore((state) => state.theme);
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const mouse = { x: -1000, y: -1000 };
    const maxMotes = 120;
    let activeMoteCount = 120;
    const motes: Mote[] = [];

    // Initialize motes
    for (let i = 0; i < maxMotes; i++) {
      const radius = Math.random() * 2 + 0.8;
      const opacity = Math.random() * 0.25 + 0.15; // 0.15 - 0.40
      
      motes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25, // very slow drift
        vy: (Math.random() - 0.5) * 0.25,
        radius,
        opacity
      });
    }

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    let lastTime = performance.now();
    const fpsInterval = 1000 / 60; // Cap at 60fps
    let dataArray: Uint8Array | null = null;

    const animate = (time: number) => {
      animationId = requestAnimationFrame(animate);

      // Performance check: skip rendering if document is hidden
      if (document.hidden) return;

      const elapsed = time - lastTime;
      if (elapsed < fpsInterval) return;

      // Adjust lastTime to account for interval
      lastTime = time - (elapsed % fpsInterval);

      const frameStart = performance.now();

      // Draw canvas clear
      ctx.clearRect(0, 0, width, height);

      // Retrieve dynamic skin colors
      const style = getComputedStyle(document.documentElement);
      const skinPrimary = style.getPropertyValue('--skin-primary').trim() || '#F59E0B';
      const skinSecondary = style.getPropertyValue('--skin-secondary').trim() || '#E11D72';

      // Get analyser and calculate bass boost
      const analyser = getGlobalAnalyser();
      let bassBoost = 1.0;
      if (analyser) {
        if (!dataArray || dataArray.length !== analyser.frequencyBinCount) {
          dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analyser.getByteFrequencyData(dataArray as any);
        // Average first 8 bins for bass frequencies
        let bassSum = 0;
        const binsToCheck = Math.min(8, dataArray.length);
        for (let j = 0; j < binsToCheck; j++) {
          bassSum += dataArray[j];
        }
        const bassAvg = binsToCheck > 0 ? (bassSum / binsToCheck) : 0;
        // Map 0-255 to a 1.0 - 1.3 multiplier (+30% speed max)
        bassBoost = 1.0 + (bassAvg / 255) * 0.3;
      }

      const timeSec = time * 0.001;

      for (let i = 0; i < activeMoteCount; i++) {
        const mote = motes[i];

        // Sinusoidal 2D drift
        const sinDriftX = Math.sin(timeSec + mote.y * 0.005) * 0.15;
        const sinDriftY = Math.cos(timeSec + mote.x * 0.005) * 0.15;

        // Apply normal drift movement with bass boost
        mote.x += (mote.vx + sinDriftX) * bassBoost;
        mote.y += (mote.vy + sinDriftY) * bassBoost;

        // Proximity calculation with mouse (calm avoidance within 200px)
        const dx = mote.x - mouse.x;
        const dy = mote.y - mouse.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 200) {
          const force = (200 - distance) / 200; // scale force 0 to 1
          const angle = Math.atan2(dy, dx);
          // Gently push away
          mote.x += Math.cos(angle) * force * 1.5;
          mote.y += Math.sin(angle) * force * 1.5;
        }

        // Boundary wrap checks
        if (mote.x < 0) mote.x = width;
        if (mote.x > width) mote.x = 0;
        if (mote.y < 0) mote.y = height;
        if (mote.y > height) mote.y = 0;

        // Draw mote
        ctx.fillStyle = i % 2 === 0 ? skinPrimary : skinSecondary;
        ctx.globalAlpha = mote.opacity;
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      const frameEnd = performance.now();
      const frameDuration = frameEnd - frameStart;
      // Drop motes by 10 if draw time exceeds 14ms (60fps budget check)
      if (frameDuration > 14) {
        activeMoteCount = Math.max(10, activeMoteCount - 10);
      }
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-40 pointer-events-none" />;
};

export default ParticleField;
