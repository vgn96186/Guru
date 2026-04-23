import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './LectureReturnSheet.styles';
import { linearTheme as n } from '../../theme/linearTheme';

interface Props {
  bottomOffset: number;
  phase: string;
  isWorkingPhase: boolean;
  isIntroPhase: boolean;
  stageMessage: string | null;
  progressLabel: string | null;
  progressProvider: string | null;
  compactTitle: string;
  compactSubtitle: string;
  setIsExpanded: (expanded: boolean) => void;
  cleanupAndClose: () => void;
}

export function LectureReturnCompactBubble({
  bottomOffset,
  phase,
  isWorkingPhase,
  isIntroPhase,
  stageMessage,
  progressLabel,
  progressProvider,
  compactTitle,
  compactSubtitle,
  setIsExpanded,
  cleanupAndClose,
}: Props) {
  return (
    <View pointerEvents="box-none" style={styles.bubbleDock}>
      <View style={[styles.bubblePositioner, { paddingBottom: bottomOffset }]}>
        <TouchableOpacity
          style={[
            styles.bubbleRow,
            phase === 'error' && styles.bubbleError,
            phase === 'results' && styles.bubbleReady,
          ]}
          onPress={() => setIsExpanded(true)}
          activeOpacity={0.85}
        >
          <View style={styles.bubbleIconWrap}>
            <Ionicons
              name={
                phase === 'error'
                  ? 'alert-circle'
                  : phase === 'results' || phase === 'quiz' || phase === 'quiz_done'
                    ? 'checkmark-circle'
                    : 'mic'
              }
              size={18}
              color={
                phase === 'error'
                  ? n.colors.error
                  : phase === 'results' || phase === 'quiz' || phase === 'quiz_done'
                    ? n.colors.success
                    : n.colors.accent
              }
            />
            {isWorkingPhase ? (
              <ActivityIndicator
                style={styles.bubbleSpinner}
                color={n.colors.accent}
                size="small"
              />
            ) : null}
          </View>
          <View style={styles.bubbleTextWrap}>
            <Text style={styles.bubbleTitle}>
              {isWorkingPhase ? stageMessage || compactTitle : compactTitle}
            </Text>
            <Text style={styles.bubbleSub}>
              {isWorkingPhase && progressLabel
                ? `${progressLabel}${progressProvider ? ` · ${progressProvider}` : ''}`
                : isIntroPhase
                  ? 'Tap to start transcription'
                  : compactSubtitle}
            </Text>
          </View>
          {!isWorkingPhase && (
            <TouchableOpacity
              style={styles.bubbleDismiss}
              onPress={() => void cleanupAndClose()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.bubbleDismissText}>{'×'}</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
