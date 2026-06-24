import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Send, Trash, Loader2, Music } from 'lucide-react';
import { useMusicStore } from '../store/useMusicStore';

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({ isOpen, onClose }) => {
  const {
    aiMessages,
    isSendingAIMessage,
    sendAIMessage,
    clearAIChat
  } = useMusicStore();

  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, isSendingAIMessage]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSendingAIMessage) return;
    const text = input.trim();
    setInput('');
    await sendAIMessage(text);
  };

  const handleQuickPrompt = async (prompt: string) => {
    if (isSendingAIMessage) return;
    await sendAIMessage(prompt);
  };

  const parseMarkdown = (text: string) => {
    // Simple parser for standard markdown bullets, bolding, and headers
    return text.split('\n').map((line, i) => {
      let content = line;
      let className = 'text-xs leading-relaxed text-txt-secondary';

      // Bullets
      if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
        content = '• ' + line.trim().substring(1).trim();
        className = 'text-xs leading-relaxed text-txt-secondary pl-2 my-0.5';
      }

      // Headers
      if (line.trim().startsWith('###')) {
        content = line.replace('###', '').trim();
        className = 'text-xs font-black text-accent-amber mt-2 uppercase tracking-wider';
      } else if (line.trim().startsWith('##')) {
        content = line.replace('##', '').trim();
        className = 'text-sm font-serif font-black text-txt-primary mt-3';
      }

      // Bold text mapping
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          parts.push(content.substring(lastIndex, match.index));
        }
        parts.push(
          <strong key={match.index} className="font-extrabold text-txt-primary text-accent-amber/90">
            {match[1]}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < content.length) {
        parts.push(content.substring(lastIndex));
      }

      return (
        <p key={i} className={`${className} min-h-[0.5rem]`}>
          {parts.length > 0 ? parts : content}
        </p>
      );
    });
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
            className="fixed top-0 right-0 h-full w-[320px] bg-bg-secondary border-l border-border-subtle shadow-2xl z-40 flex flex-col p-6 overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b border-border-subtle/50 pb-4 mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5 text-accent-amber animate-pulse" />
                <div>
                  <h4 className="font-serif font-black text-base text-txt-primary">AI Assistant</h4>
                  <p className="text-[9px] text-txt-muted uppercase tracking-wider font-semibold mt-0.5">V2 Music Helper</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {aiMessages.length > 0 && (
                  <button
                    onClick={clearAIChat}
                    title="Clear Conversation"
                    className="p-1.5 rounded-lg hover:bg-bg-tertiary text-txt-muted hover:text-accent-rose transition-colors cursor-pointer"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-bg-tertiary text-txt-muted hover:text-txt-primary transition-colors cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-4 mb-4">
              {aiMessages.length === 0 ? (
                <div className="flex flex-col gap-5 py-8 text-center text-txt-muted text-xs font-semibold my-auto">
                  <div className="w-12 h-12 rounded-full bg-accent-amber/10 border border-accent-amber/20 flex items-center justify-center mx-auto text-accent-amber">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-txt-primary">Ask me anything about music!</p>
                    <p className="text-[10px] text-txt-muted px-4 font-normal leading-relaxed">
                      I can help you recommend tracks, list specific genres, explain artist histories, and help generate smart vibe playlists.
                    </p>
                  </div>

                  {/* Quick Prompts */}
                  <div className="flex flex-col gap-2 mt-4 px-2 text-left">
                    <span className="text-[8px] font-black tracking-widest text-txt-muted uppercase mb-1">Suggested Prompts</span>
                    {[
                      'Recommend some chill lofi songs',
                      'Suggest energetic tracks for workout',
                      'Recommend classic night jazz albums'
                    ].map((p, i) => (
                      <button
                        key={i}
                        onClick={() => handleQuickPrompt(p)}
                        className="text-left text-[10px] font-bold text-txt-secondary border border-border-subtle bg-bg-tertiary/20 hover:border-accent-amber/40 hover:bg-bg-tertiary/50 hover:text-txt-primary p-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2"
                      >
                        <Music className="w-3 h-3 text-accent-amber flex-shrink-0" />
                        <span className="truncate">{p}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {aiMessages.map((msg, i) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={i}
                        className={`flex flex-col max-w-[85%] rounded-2xl p-3 text-left border ${
                          isUser
                            ? 'self-end bg-accent-sienna/5 border-accent-sienna/20 rounded-tr-none'
                            : 'self-start bg-bg-tertiary/30 border-border-subtle/50 rounded-tl-none'
                        }`}
                      >
                        <span className={`text-[8px] font-black uppercase tracking-wider mb-1 ${
                          isUser ? 'text-accent-sienna' : 'text-accent-amber'
                        }`}>
                          {isUser ? 'You' : 'AudioDrip AI'}
                        </span>
                        <div className="space-y-1">
                          {isUser ? (
                            <p className="text-xs font-semibold text-txt-primary leading-relaxed">{msg.content}</p>
                          ) : (
                            parseMarkdown(msg.content)
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isSendingAIMessage && (
                    <div className="self-start max-w-[85%] rounded-2xl p-3 text-left border bg-bg-tertiary/30 border-border-subtle/50 rounded-tl-none flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-amber" />
                      <span className="text-xs font-bold text-txt-muted">AI is thinking...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSend} className="flex gap-2 border-t border-border-subtle/40 pt-4 mt-auto flex-shrink-0">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask or describe a music vibe..."
                disabled={isSendingAIMessage}
                className="flex-1 bg-bg-primary border border-border-subtle rounded-xl px-3 py-2.5 text-xs font-semibold placeholder-text-muted focus:outline-none focus:border-accent-amber text-txt-primary transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isSendingAIMessage || !input.trim()}
                className="p-2.5 bg-accent-amber text-[#0C0A09] rounded-xl hover:bg-accent-amber/95 transition-all disabled:opacity-30 cursor-pointer flex items-center justify-center flex-shrink-0 w-10 h-10"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AIAssistantDrawer;
