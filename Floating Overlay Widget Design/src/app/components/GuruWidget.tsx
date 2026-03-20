import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pause, Square, Circle } from 'lucide-react';

interface GuruWidgetProps {
  appName?: string;
  isRecording?: boolean;
}

export function GuruWidget({ 
  appName = "YouTube", 
  isRecording = true 
}: GuruWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Timer logic
  useEffect(() => {
    if (!isPaused && isRecording) {
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isPaused, isRecording]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleFinish = () => {
    // Reset state
    setElapsedTime(0);
    setIsPaused(false);
    setIsExpanded(false);
  };

  return (
    <motion.div 
      className="fixed bottom-6 right-6 z-50"
      drag
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{
        top: -window.innerHeight + 200,
        left: -window.innerWidth + 200,
        right: 0,
        bottom: 0,
      }}
      style={{
        x: position.x,
        y: position.y,
      }}
      onDragEnd={(_, info) => {
        setPosition({
          x: position.x + info.offset.x,
          y: position.y + info.offset.y,
        });
      }}
    >
      <div style={{ cursor: isExpanded ? 'default' : 'grab' }}>
        <AnimatePresence mode="wait">
          {!isExpanded ? (
            // COLLAPSED STATE - Circular Bubble
            <motion.button
              key="collapsed"
              onClick={() => setIsExpanded(true)}
              className="relative w-20 h-20"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 25 
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Purple gradient ring with breathing animation */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #6C63FF 0%, #8A7CFF 100%)',
                  padding: '3px',
                }}
                animate={{
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div 
                  className="w-full h-full rounded-full"
                  style={{ background: '#1A1A24' }}
                />
              </motion.div>

              {/* Content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <span 
                  className="text-[10px] tracking-wide uppercase"
                  style={{ color: '#A0A3B1' }}
                >
                  {appName}
                </span>
                <span 
                  className="text-base font-medium tabular-nums"
                  style={{ color: '#FFFFFF', opacity: 0.95 }}
                >
                  {formatTime(elapsedTime)}
                </span>
                
                {/* Recording indicator dot */}
                {isRecording && !isPaused && (
                  <motion.div
                    className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={{ background: '#8A7CFF' }}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </div>
            </motion.button>
          ) : (
            // EXPANDED STATE - Vertical Pill
            <motion.div
              key="expanded"
              className="relative overflow-hidden rounded-3xl"
              style={{
                background: 'rgba(26, 26, 36, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(138, 124, 255, 0.15)',
                boxShadow: `
                  0 8px 32px rgba(0, 0, 0, 0.4),
                  0 0 0 1px rgba(108, 99, 255, 0.1),
                  inset 0 1px 0 rgba(255, 255, 255, 0.05)
                `,
              }}
              initial={{ scale: 0.8, opacity: 0, borderRadius: '50%' }}
              animate={{ scale: 1, opacity: 1, borderRadius: '24px' }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ 
                type: "spring", 
                stiffness: 260, 
                damping: 22 
              }}
            >
              {/* Subtle gradient glow at top */}
              <div 
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(138, 124, 255, 0.3), transparent)',
                }}
              />

              <div className="px-6 py-5 flex flex-col items-center w-56">
                {/* App Name - Recording */}
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Circle 
                    className="w-2 h-2 fill-current" 
                    style={{ color: '#8A7CFF', opacity: 0.8 }}
                  />
                  <span 
                    className="text-xs tracking-wide"
                    style={{ color: '#A0A3B1' }}
                  >
                    {appName} – {isPaused ? 'Paused' : 'Recording'}
                  </span>
                </div>

                {/* Timer */}
                <div 
                  className="text-4xl font-bold font-mono tabular-nums tracking-tight mb-3"
                  style={{ color: '#FFFFFF', opacity: 0.95 }}
                >
                  {formatTime(elapsedTime)}
                </div>

                {/* Status Text */}
                <p 
                  className="text-sm text-center mb-3"
                  style={{ color: '#A0A3B1' }}
                >
                  {isPaused ? 'Take your time' : "You're in focus mode"}
                </p>

                {/* Action Buttons */}
                <div className="flex gap-3 w-full mb-2">
                  <button
                    onClick={handlePause}
                    className="flex-1 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    }}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Pause className="w-3.5 h-3.5" />
                      {isPaused ? 'Resume' : 'Pause'}
                    </div>
                  </button>

                  <button
                    onClick={handleFinish}
                    className="flex-1 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200"
                    style={{
                      background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15), rgba(138, 124, 255, 0.15))',
                      color: '#FFFFFF',
                      border: '1px solid rgba(138, 124, 255, 0.25)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(108, 99, 255, 0.25), rgba(138, 124, 255, 0.25))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(108, 99, 255, 0.15), rgba(138, 124, 255, 0.15))';
                    }}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Square className="w-3.5 h-3.5" />
                      Finish
                    </div>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}