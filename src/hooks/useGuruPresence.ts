import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { motion } from '../motion/presets';
import { generateGuruPresenceMessages } from '../services/ai';
import type { GuruEventType, GuruPresenceMessage } from '../services/ai';

interface GuruPresenceOptions {
  currentTopicIdentity?: string | null;
  currentTopicName?: string | null;
  allTopicNames: string[];
  isActive: boolean;
  frequency?: 'rare' | 'normal' | 'frequent' | 'off';
}

interface GuruPresenceReturn {
  currentMessage: string | null;
  presencePulse: Animated.Value;
  toastOpacity: Animated.Value;
  triggerEvent: (type: GuruEventType) => void;
}

export function useGuruPresence({
  currentTopicIdentity,
  currentTopicName,
  allTopicNames,
  isActive,
  frequency = 'normal',
}: GuruPresenceOptions): GuruPresenceReturn {
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const presencePulse = useRef(new Animated.Value(1)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const messagesRef = useRef<GuruPresenceMessage[]>([]);
  const lastGeneratedKeyRef = useRef<string | null>(null);
  const isShowingRef = useRef(false);
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const promptTopicNames = useMemo(() => {
    const trimmedCurrent = currentTopicName?.trim();
    if (trimmedCurrent) return [trimmedCurrent];
    return allTopicNames.slice(0, 1);
  }, [allTopicNames, currentTopicName]);

  const activeTopicKey = useMemo(() => {
    const trimmedIdentity = currentTopicIdentity?.trim();
    if (trimmedIdentity) return trimmedIdentity;
    return promptTopicNames[0] ?? '';
  }, [currentTopicIdentity, promptTopicNames]);

  const allTopicsKey = useMemo(() => allTopicNames.join('|'), [allTopicNames]);

  // Generate presence messages around the active topic and refresh when it changes.
  useEffect(() => {
    if (promptTopicNames.length === 0 || allTopicNames.length === 0) return;
    const generationKey = `${activeTopicKey}::${allTopicsKey}`;
    if (lastGeneratedKeyRef.current === generationKey) return;
    lastGeneratedKeyRef.current = generationKey;
    generateGuruPresenceMessages(promptTopicNames, allTopicNames)
      .then((msgs) => {
        messagesRef.current = msgs;
      })
      .catch((err) => console.warn('[useGuruPresence] Failed to generate ambient messages:', err));
  }, [activeTopicKey, allTopicsKey, allTopicNames, promptTopicNames]);

  // Pulse animation — run when active, pause otherwise
  useEffect(() => {
    if (isActive) {
      const anim = motion.pulseValue(presencePulse, {
        from: 0.8,
        to: 1.2,
        duration: 1000,
        loop: true,
        useNativeDriver: true,
      });
      pulseAnimRef.current = anim;
      anim.start();
      return () => {
        anim.stop();
        pulseAnimRef.current = null;
      };
    } else {
      pulseAnimRef.current?.stop();
      motion.to(presencePulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isActive, presencePulse]);

  const showMessage = useCallback(
    (text: string) => {
      if (isShowingRef.current) return;
      isShowingRef.current = true;
      setCurrentMessage(text);
      Animated.sequence([
        motion.to(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(7000),
        motion.to(toastOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => {
        setCurrentMessage(null);
        isShowingRef.current = false;
      });
    },
    [toastOpacity],
  );

  const triggerEvent = useCallback(
    (type: GuruEventType) => {
      if (isShowingRef.current) return;
      const matching = messagesRef.current.filter((m) => m.trigger === type);
      if (matching.length === 0) return;
      const msg = matching[Math.floor(Math.random() * matching.length)];
      showMessage(msg.text);
    },
    [showMessage],
  );

  // Periodic ambient messages based on frequency setting
  useEffect(() => {
    if (!isActive || frequency === 'off') return;

    // Define timing based on frequency
    const timings = {
      rare: { first: 5 * 60 * 1000, interval: 30 * 60 * 1000 }, // 5min first, 30min repeat
      normal: { first: 2 * 60 * 1000, interval: 20 * 60 * 1000 }, // 2min first, 20min repeat
      frequent: { first: 30 * 1000, interval: 10 * 60 * 1000 }, // 30sec first, 10min repeat
    };

    const { first, interval } = timings[frequency];

    const firstTimer = setTimeout(() => {
      triggerEvent('periodic');
    }, first);
    const intervalTimer = setInterval(() => triggerEvent('periodic'), interval);
    return () => {
      clearTimeout(firstTimer);
      clearInterval(intervalTimer);
    };
  }, [isActive, frequency, triggerEvent]);

  return { currentMessage, presencePulse, toastOpacity, triggerEvent };
}
