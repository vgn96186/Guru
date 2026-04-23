import React from 'react';
import { TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearText from '../../../components/primitives/LinearText';
import { ResponsiveContainer } from '../../../hooks/useResponsive';
import { styles } from '../LectureModeScreen.styles';

interface LectureResumeScreenProps {
  resumeCountdown: number;
  onResumeNow: () => void;
}

export function LectureResumeScreen({ resumeCountdown, onResumeNow }: LectureResumeScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ResponsiveContainer style={styles.resumeContainer}>
        <LinearText style={styles.resumeTitle}>Ready to resume?</LinearText>
        <LinearText style={styles.resumeTimer}>{resumeCountdown}</LinearText>
        <TouchableOpacity style={styles.resumeBtn} onPress={onResumeNow}>
          <LinearText style={styles.resumeBtnText}>Resume Now</LinearText>
        </TouchableOpacity>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
