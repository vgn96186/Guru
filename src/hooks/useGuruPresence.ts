import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { generateGuruPresenceMessages } from '../services/aiService';
import type { GuruEventType, GuruPresenceMessage } from '../services/aiService';

interface GuruPresenceOptions {
  topicNames: string[];
  apiKey: string;
  orKey?: string;
  isActive: boolean;
}

interface GuruPresenceReturn {
  currentMessage: string | null;
  presencePulse: Animated.Value;
  toastOpacity: Animated.Value;
  triggerEvent: (type: GuruEventType) => void;
}

export function useGuruPresence({ topicNames, apiKey, orKey, isActive }: GuruPresenceOptions): GuruPresenceReturn {
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

  // Periodic ambient messages: first fires at 2 min, then every 20 min
  useEffect(() => {
    if (!isActive) return;
    const firstTimer = setTimeout(() => {
      triggerEvent('periodic');
    }, 2 * 60 * 1000);
    const interval = setInterval(() => triggerEvent('periodic'), 20 * 60 * 1000);
    return () => { clearTimeout(firstTimer); clearInterval(interval); };
  }, [isActive, triggerEvent]);

  return { currentMessage, presencePulse, toastOpacity, triggerEvent };
}
