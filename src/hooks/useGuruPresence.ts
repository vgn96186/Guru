import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { generateGuruPresenceMessages } from '../services/aiService';
import type { GuruEventType, GuruPresenceMessage } from '../services/aiService';

interface GuruPresenceOptions {
  topicNames: string[];
  apiKey: string;
  orKey?: string;
  isActive: boolean;
  frequency?: 'rare' | 'normal' | 'frequent' | 'off';
}

interface GuruPresenceReturn {
  currentMessage: string | null;
  presencePulse: Animated.Value;
  toastOpacity: Animated.Value;
  triggerEvent: (type: GuruEventType) => void;
}

export function useGuruPresence({ topicNames, apiKey, orKey, isActive, frequency = 'normal' }: GuruPresenceOptions): GuruPresenceReturn {
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const presencePulse = useRef(new Animated.Value(1)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const messagesRef = useRef<GuruPresenceMessage[]>([]);
  const lastGeneratedKeyRef = useRef<string | null>(null);
  const isShowingRef = useRef(false);
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const topicsKey = useMemo(() => topicNames.join('|'), [topicNames]);

  // Generate presence messages once when topics are available
  useEffect(() => {
    if (!apiKey) return;
    if (topicNames.length === 0) return;
    if (lastGeneratedKeyRef.current === topicsKey) return;
    lastGeneratedKeyRef.current = topicsKey;
    generateGuruPresenceMessages(topicNames, topicNames, apiKey, orKey)
      .then(msgs => { messagesRef.current = msgs; })
      .catch(() => {});
  }, [topicsKey, topicNames, apiKey, orKey]);

  // Pulse animation — run when active, pause otherwise
  useEffect(() => {
    if (isActive) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(presencePulse, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(presencePulse, { toValue: 0.8, duration: 1000, useNativeDriver: true }),
        ]),
      );
      pulseAnimRef.current = anim;
      anim.start();
    } else {
      pulseAnimRef.current?.stop();
      Animated.timing(presencePulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isActive]);

  const showMessage = useCallback((text: string) => {
    if (isShowingRef.current) return;
    isShowingRef.current = true;
    setCurrentMessage(text);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setCurrentMessage(null);
      isShowingRef.current = false;
    });
  }, [toastOpacity]);

  const triggerEvent = useCallback((type: GuruEventType) => {
    if (isShowingRef.current) return;
    const matching = messagesRef.current.filter(m => m.trigger === type);
    if (matching.length === 0) return;
    const msg = matching[Math.floor(Math.random() * matching.length)];
    showMessage(msg.text);
  }, [showMessage]);

  // Periodic ambient messages based on frequency setting
  useEffect(() => {
    if (!isActive || frequency === 'off') return;
    
    // Define timing based on frequency
    const timings = {
      rare: { first: 5 * 60 * 1000, interval: 30 * 60 * 1000 },    // 5min first, 30min repeat
      normal: { first: 2 * 60 * 1000, interval: 20 * 60 * 1000 }, // 2min first, 20min repeat
      frequent: { first: 30 * 1000, interval: 10 * 60 * 1000 },    // 30sec first, 10min repeat
    };
    
    const { first, interval } = timings[frequency];
    
    const firstTimer = setTimeout(() => {
      triggerEvent('periodic');
    }, first);
    const intervalTimer = setInterval(() => triggerEvent('periodic'), interval);
    return () => { clearTimeout(firstTimer); clearInterval(intervalTimer); };
  }, [isActive, frequency, triggerEvent]);

  return { currentMessage, presencePulse, toastOpacity, triggerEvent };
}
