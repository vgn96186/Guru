import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './LectureReturnSheet.styles';
import { linearTheme as n } from '../../theme/linearTheme';
import { type LectureAnalysis } from '../../services/transcriptionService';

interface Props {
  phase: string;
  analysis: LectureAnalysis | null;
  appName: string;
  isSaving: boolean;
  quizLoading: boolean;
  subjectSelectionRequired: boolean;
  selectedSubjectName: string | null;
  isWorkingPhase: boolean;
  isIntroPhase: boolean;
  selected: number | null;
  hasQuestion: boolean;
  currentQ: number;
  totalQuestions: number;
  handleMarkAndQuiz: () => void;
  handleMarkStudied: () => void;
  onCreateMindMap?: (topicName: string) => void;
  handleSaveAndClose: () => void;
  handleNextQuestion: () => void;
  cleanupAndClose: () => void;
  handleSkip: () => void;
}

export function LectureReturnActionButtons({
  phase,
  analysis,
  appName,
  isSaving,
  quizLoading,
  subjectSelectionRequired,
  selectedSubjectName,
  isWorkingPhase,
  isIntroPhase,
  selected,
  hasQuestion,
  currentQ,
  totalQuestions,
  handleMarkAndQuiz,
  handleMarkStudied,
  onCreateMindMap,
  handleSaveAndClose,
  handleNextQuestion,
  cleanupAndClose,
  handleSkip,
}: Props) {
  return (
    <View style={styles.actions}>
      {/* Results phase: simplified to 2 CTAs */}
      {phase === 'results' && analysis && analysis.topics.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleMarkAndQuiz}
            disabled={isSaving || (subjectSelectionRequired && !selectedSubjectName)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={
              isSaving
                ? 'Saving'
                : quizLoading
                  ? 'Loading quiz'
                  : 'Mark as studied and take quick quiz'
            }
          >
            {isSaving ? (
              <Text style={styles.primaryBtnText}>
                {isSaving
                  ? 'Saving lecture summary'
                  : quizLoading
                    ? 'Loading Quiz'
                    : 'Mark as Studied + Quick Quiz'}
              </Text>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name="hardware-chip-outline"
                  size={18}
                  color={n.colors.textPrimary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.primaryBtnText}>
                  {quizLoading ? 'Loading Quiz' : 'Mark as Studied + Quick Quiz'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => handleMarkStudied()}
            disabled={isSaving || (subjectSelectionRequired && !selectedSubjectName)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Just mark as studied, ${analysis.topics.length * 8} XP`}
          >
            <Text style={styles.outlineBtnText}>
              ✓ Just Mark as Studied (+{analysis.topics.length * 8} XP)
            </Text>
          </TouchableOpacity>
          {onCreateMindMap && (
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => {
                const topic = analysis.subject || analysis.topics[0] || appName;
                onCreateMindMap(topic);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.outlineBtnText}>🧠 Create Mind Map</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Results phase: no topics detected */}
      {phase === 'results' && analysis && analysis.topics.length === 0 && (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleSaveAndClose}
          disabled={isSaving || (subjectSelectionRequired && !selectedSubjectName)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Save & Done</Text>
        </TouchableOpacity>
      )}

      {/* Quiz phase: next / finish */}
      {phase === 'quiz' && selected !== null && hasQuestion && (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleNextQuestion}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>
            {currentQ < totalQuestions - 1 ? 'Next Question →' : 'See My Score'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Quiz phase: skip if no questions or stuck loading */}
      {phase === 'quiz' && !quizLoading && !hasQuestion && (
        <TouchableOpacity style={styles.primaryBtn} onPress={cleanupAndClose} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Close</Text>
        </TouchableOpacity>
      )}

      {/* Quiz done */}
      {phase === 'quiz_done' && (
        <TouchableOpacity style={styles.primaryBtn} onPress={cleanupAndClose} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      )}

      {/* Dismiss / Skip always available (except quiz_done which has its own Done) */}
      {phase !== 'quiz_done' && !isWorkingPhase && !isIntroPhase && (
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleSkip}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Skip and dismiss"
        >
          <Text style={styles.secondaryBtnText}>
            {phase === 'results' ? 'Skip' : phase === 'quiz' ? 'End Quiz' : 'Dismiss'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
