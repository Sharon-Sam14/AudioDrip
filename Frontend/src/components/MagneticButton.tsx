import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface MagneticButtonProps {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLDivElement>;
  className?: string;
  as?: 'button' | 'div';
  haloRadius?: number;
  disabled?: boolean;
  title?: string;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  onClick,
  className = '',
  as = 'button',
  haloRadius = 120,
  disabled = false,
  title,
}) => {
  const ref = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleIdRef = useRef(0);

  // Motion values for magnetic displacement
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Springs for smooth pull and snap back (tuned to stiffness: 400, damping: 28)
  const springConfig = { stiffness: 400, damping: 28, mass: 0.8 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const [clickScale, setClickScale] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const elementCenterX = rect.left + rect.width / 2;
      const elementCenterY = rect.top + rect.height / 2;

      const dx = e.clientX - elementCenterX;
      const dy = e.clientY - elementCenterY;
      const distance = Math.hypot(dx, dy);

      // Trigger pull if within 80px of boundary center
      if (distance < 80) {
        setIsHovered(true);
        x.set(dx * 0.35);
        y.set(dy * 0.35);

        // Keep local mouse coords for custom cursor and halo positioning
        setCoords({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      } else {
        setIsHovered(false);
        x.set(0);
        y.set(0);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [disabled, x, y]);

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
    if (disabled) return;
    setClickScale(0.92);

    // Create ripple ring centered at click coordinates
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const id = rippleIdRef.current++;
      setRipples((prev) => [...prev, { id, x: clickX, y: clickY }]);
    }
  };

  const handleMouseUp = () => {
    setClickScale(1);
  };

  const Component = as === 'button' ? motion.button : motion.div;

  return (
    <Component
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onClick={onClick as any}
      title={title}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsHovered(false);
        x.set(0);
        y.set(0);
        setClickScale(1);
      }}
      style={{
        x: springX,
        y: springY,
        scale: clickScale,
        transformStyle: 'preserve-3d',
        // Hide standard pointer cursor on hover to replace with custom cursor
        cursor: isHovered && !disabled ? 'none' : disabled ? 'not-allowed' : 'pointer'
      }}
      className={`relative inline-flex items-center justify-center overflow-hidden transition-shadow duration-300 ${className}`}
      disabled={as === 'button' ? disabled : undefined}
    >
      {/* Soft radial glow halo behind on hover */}
      {isHovered && !disabled && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-[25px] transition-opacity duration-300 z-0"
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            width: `${haloRadius}px`,
            height: `${haloRadius}px`,
            background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
          }}
        />
      )}

      {/* Custom 24px circular tracking cursor */}
      {isHovered && !disabled && (
        <div
          className="pointer-events-none absolute w-6 h-6 rounded-full border border-skin-primary z-50 -translate-x-1/2 -translate-y-1/2 transition-colors duration-500"
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
          }}
        />
      )}

      {/* Ripple Rings in var(--skin-primary) at 20% opacity */}
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          initial={{ scale: 0, opacity: 0.4 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          onAnimationComplete={() => {
            setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
          }}
          className="absolute rounded-full pointer-events-none bg-[var(--skin-primary)]/20 z-0 skin-fade"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 30,
            height: 30,
            marginLeft: -15,
            marginTop: -15,
          }}
        />
      ))}

      {/* Button content label */}
      <span className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none">
        {children}
      </span>
    </Component>
  );
};

export default MagneticButton;
