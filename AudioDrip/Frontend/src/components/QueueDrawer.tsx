import React from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { X, GripVertical } from 'lucide-react';
import { useMusicStore } from '../store/useMusicStore';
import type { Track } from '../store/useMusicStore';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ isOpen, onClose }) => {
  const { 
    queue, 
    currentTrack, 
    play, 
    removeFromQueue 
  } = useMusicStore();

  const handleReorder = (newQueue: Track[]) => {
    // Directly update state in Zustand store
    useMusicStore.setState({ queue: newQueue });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-35"
            onClick={onClose}
          />

          {/* Drawer container */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed top-0 right-0 h-full w-[280px] bg-bg-secondary border-l border-border-subtle shadow-2xl z-40 flex flex-col p-6 overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b border-border-subtle/50 pb-4 mb-4 flex-shrink-0">
              <div>
                <h4 className="font-serif font-black text-lg text-txt-primary">Play Queue</h4>
                <p className="text-[10px] text-txt-muted uppercase tracking-wider font-semibold mt-0.5">{queue.length} Records</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-bg-tertiary text-txt-muted hover:text-txt-primary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Draggable Queue List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              {queue.length === 0 ? (
                <div className="py-12 text-center text-txt-muted text-xs font-semibold">
                  Queue is empty.
                </div>
              ) : (
                <Reorder.Group
                  values={queue}
                  onReorder={handleReorder}
                  className="flex flex-col gap-2.5"
                  axis="y"
                >
                  {queue.map((track) => {
                    const isCurrent = currentTrack?.id === track.id;

                    return (
                      <Reorder.Item
                        key={track.id}
                        value={track}
                        className={`group relative flex items-center justify-between p-2.5 rounded-xl border transition-all select-none cursor-pointer ${
                          isCurrent 
                            ? 'border-l-2 border-l-accent-amber border-y-transparent border-r-transparent bg-transparent' 
                            : 'border-transparent bg-bg-tertiary/40 hover:border-border-subtle'
                        }`}
                        whileDrag={{
                          scale: 1.02,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                          backgroundColor: 'var(--bg-tertiary)'
                        }}
                      >
                        {/* Left: Drag Handle + Cover art + Info */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="text-txt-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                          
                          <div 
                            className="flex items-center gap-2.5 min-w-0 flex-grow"
                            onClick={() => play(track)}
                          >
                            <div className="w-9 h-9 rounded overflow-hidden bg-[#181615] flex-shrink-0 border border-border-subtle">
                              <img src={track.coverUrl} className="w-full h-full object-cover" alt="" />
                            </div>
                            
                            <div className="text-left min-w-0 flex-grow">
                              <h5 className="font-serif text-[13px] font-black text-txt-primary truncate leading-tight">
                                {track.title}
                              </h5>
                              <p className="text-[10px] font-medium text-txt-muted truncate mt-0.5 leading-tight">
                                {track.artist}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Right: Swipe/hover X button */}
                        <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromQueue(track.id);
                            }}
                            className="p-1 rounded bg-[#0C0A09] border border-border-subtle text-txt-muted hover:text-accent-rose hover:scale-105 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </Reorder.Item>
                    );
                  })}
                </Reorder.Group>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default QueueDrawer;
