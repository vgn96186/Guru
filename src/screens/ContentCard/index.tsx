import { CARD_COMPONENTS } from './registry';
import React, { useEffect, useState, useMemo, useCallback } from 'react';

import {
  View,
  TouchableOpacity,
} from 'react-native';
import LinearText from '../../components/primitives/LinearText';
import { Ionicons } from '@expo/vector-icons';






import { isContentFlagged, setContentFlagged } from '../../db/queries/aiCache';
import GuruChatOverlay from '../../components/GuruChatOverlay';
import ErrorBoundary from '../../components/ErrorBoundary';
import { linearTheme as n } from '../../theme/linearTheme';


import LinearSurface from '../../components/primitives/LinearSurface';
import { showInfo } from '../../components/dialogService';
import { s } from './styles';
import { Props } from './types';
import { buildGuruContext } from './guruContext';




interface TopicImageProps {
  topicName: string;
}

export default React.memo(function ContentCardWithBoundary(props: Props) {
  return (
    <ErrorBoundary>
      <ContentCard {...props} />
    </ErrorBoundary>
  );
});

function ContentCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
  onQuizAnswered,
  onQuizComplete,
}: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [liveGuruContext, setLiveGuruContext] = useState<string | undefined>(undefined);
  const hasMountedRef = React.useRef(false);
  const baseGuruContext = useMemo(() => buildGuruContext(content), [content]);
  const guruContext = useMemo(() => {
    if (baseGuruContext && liveGuruContext) {
      return `${baseGuruContext}\n\nCurrent study step:\n${liveGuruContext}`;
    }
    return liveGuruContext ?? baseGuruContext;
  }, [baseGuruContext, liveGuruContext]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    queueMicrotask(() => setLiveGuruContext(undefined));
  }, [content]);

  useEffect(() => {
    if (!topicId && flagged) {
      queueMicrotask(() => setFlagged(false));
    }
  }, [topicId, flagged]);

  useEffect(() => {
    let active = true;
    if (topicId) {
      void isContentFlagged(topicId, content.type).then((val) => {
        if (active) queueMicrotask(() => setFlagged(val));
      });
    } else if (active) {
      setFlagged(false);
    }
    return () => {
      active = false;
    };
  }, [topicId, content.type]);

  function handleFlag() {
    if (!topicId) return;
    const newFlagged = !flagged;
    setFlagged(newFlagged);
    void setContentFlagged(topicId, content.type, newFlagged);
    if (newFlagged) {
      void showInfo(
        'Flagged for review',
        'This content has been flagged. You can review all flagged items in the Flagged Review section.',
      );
    }
  }

  const handleQuizAnswered = useCallback(
    (correct: boolean) => {
      onQuizAnswered?.(correct);
    },
    [onQuizAnswered],
  );

  const Card = CARD_COMPONENTS[content.type];
  const card = Card ? (
    <Card
      content={content}
      topicId={topicId}
      contentType={contentType}
      onDone={onDone}
      onSkip={onSkip}
      onQuizAnswered={handleQuizAnswered}
      onQuizComplete={onQuizComplete}
      onContextChange={setLiveGuruContext}
    />
  ) : null;

  return (
    <LinearSurface padded={false} style={s.sessionCardShell}>
      <View style={s.sessionCardInner}>
        <View style={s.sessionCardBody}>{card}</View>
        <View style={s.cardActions}>
          {topicId ? (
            <TouchableOpacity
              style={[s.flagBtn, flagged && s.flagBtnActive]}
              onPress={handleFlag}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={flagged ? 'Unflag content' : 'Flag for review'}
            >
              <LinearText style={s.flagBtnText}>{flagged ? '🚩 Flagged' : '🏳 Flag'}</LinearText>
            </TouchableOpacity>
          ) : (
            <View />
          )}
        </View>
        {/* Floating Ask Guru FAB */}
        <TouchableOpacity
          style={s.askGuruFab}
          onPress={() => setChatOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Ask Guru about this topic"
        >
          <Ionicons name="sparkles" size={20} color={n.colors.textPrimary} />
        </TouchableOpacity>
        {chatOpen ? (
          <GuruChatOverlay
            visible={chatOpen}
            topicName={content.topicName}
            syllabusTopicId={topicId ?? undefined}
            contextText={guruContext}
            onClose={() => setChatOpen(false)}
          />
        ) : null}
      </View>
    </LinearSurface>
  );
}

// ── Key Points ────────────────────────────────────────────────────
// ── Must Know & Most Tested ──────────────────────────────────────
// ── Concept Chip (inline tap-to-explain) ─────────────────────────
// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────
// ── Story ─────────────────────────────────────────────────────────
// ── Mnemonic ──────────────────────────────────────────────────────
// ── Teach Back ────────────────────────────────────────────────────
// ── Error Hunt ────────────────────────────────────────────────────
// ── Detective ─────────────────────────────────────────────────────
// ── Manual Review ──────────────────────────────────────────────────
// ── SocraticCard ────────────────────────────────────────────────────────────
