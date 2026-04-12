import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SettingsField from '../components/SettingsField';
import SettingsLabel from '../components/SettingsLabel';
import type { SettingsSectionToggleProps } from '../components/SettingsSectionAccordion';
import SettingsToggleRow from '../components/SettingsToggleRow';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import { ALL_CONTENT_TYPES } from '../types';
import type { ContentType, Subject } from '../../../types';

interface StudySectionsProps {
  styles: Record<string, object>;
  SectionToggle: (props: SettingsSectionToggleProps) => React.ReactElement;
  dbmciClassStartDate: string;
  setDbmciClassStartDate: (value: string) => void;
  btrStartDate: string;
  setBtrStartDate: (value: string) => void;
  homeNoveltyCooldownHours: string;
  setHomeNoveltyCooldownHours: (value: string) => void;
  sessionLength: string;
  setSessionLength: (value: string) => void;
  dailyGoal: string;
  setDailyGoal: (value: string) => void;
  strictMode: boolean;
  setStrictMode: (value: boolean) => void;
  notifs: boolean;
  setNotifs: (value: boolean) => void;
  notifHour: string;
  setNotifHour: (value: string) => void;
  guruFrequency: 'rare' | 'normal' | 'frequent' | 'off';
  setGuruFrequency: (value: 'rare' | 'normal' | 'frequent' | 'off') => void;
  testNotification: () => void;
  bodyDoubling: boolean;
  setBodyDoubling: (value: boolean) => void;
  blockedTypes: ContentType[];
  setBlockedTypes: React.Dispatch<React.SetStateAction<ContentType[]>>;
  subjects: Array<Pick<Subject, 'id' | 'colorHex' | 'shortCode'>>;
  focusSubjectIds: number[];
  setFocusSubjectIds: React.Dispatch<React.SetStateAction<number[]>>;
  idleTimeout: string;
  setIdleTimeout: (value: string) => void;
  breakDuration: string;
  setBreakDuration: (value: string) => void;
  pomodoroEnabled: boolean;
  setPomodoroEnabled: (value: boolean) => void;
  pomodoroLectureQuizReady: boolean;
  hasPomodoroOverlayPermission: boolean;
  hasPomodoroGroqKey: boolean;
  hasPomodoroDeepgramKey: boolean;
  requestPomodoroOverlay: () => void;
  pomodoroInterval: string;
  setPomodoroInterval: (value: string) => void;
}

export default function StudySections(props: StudySectionsProps) {
  const {
    styles,
    SectionToggle,
    dbmciClassStartDate,
    setDbmciClassStartDate,
    btrStartDate,
    setBtrStartDate,
    homeNoveltyCooldownHours,
    setHomeNoveltyCooldownHours,
    sessionLength,
    setSessionLength,
    dailyGoal,
    setDailyGoal,
    strictMode,
    setStrictMode,
    notifs,
    setNotifs,
    notifHour,
    setNotifHour,
    guruFrequency,
    setGuruFrequency,
    testNotification,
    bodyDoubling,
    setBodyDoubling,
    blockedTypes,
    setBlockedTypes,
    subjects,
    focusSubjectIds,
    setFocusSubjectIds,
    idleTimeout,
    setIdleTimeout,
    breakDuration,
    setBreakDuration,
    pomodoroEnabled,
    setPomodoroEnabled,
    pomodoroLectureQuizReady,
    hasPomodoroOverlayPermission,
    hasPomodoroGroqKey,
    hasPomodoroDeepgramKey,
    requestPomodoroOverlay,
    pomodoroInterval,
    setPomodoroInterval,
  } = props;

  return (
    <>
      <LinearText style={styles.categoryLabel} variant="sectionTitle" tone="muted">
        STUDY
      </LinearText>
      <SectionToggle id="live_batch" title="Study Plan" icon="book-outline" tint="#2196F3">
        <SettingsField
          label="DBMCI One batch start date (YYYY-MM-DD)"
          value={dbmciClassStartDate}
          onChangeText={setDbmciClassStartDate}
          placeholder="e.g. 2025-01-06"
          placeholderTextColor={linearTheme.colors.textMuted}
          autoCapitalize="none"
          hint="Set this to unlock the live-class position tracker in the Study Plan screen. Guru will highlight which subject DBMCI One is covering today."
        />
        <SettingsField
          label="BTR (Back to Roots) batch start date (YYYY-MM-DD)"
          value={btrStartDate}
          onChangeText={setBtrStartDate}
          placeholder="e.g. 2025-09-01"
          placeholderTextColor={linearTheme.colors.textMuted}
          autoCapitalize="none"
          hint="Set this when you start the BTR revision batch. Guru will align your daily revision queue with the current BTR subject."
        />
        <SettingsLabel text="Home novelty cooldown (hours)" />
        <View style={styles.frequencyRow}>
          {[2, 4, 6, 8, 12].map((hrs) => {
            const active = (parseInt(homeNoveltyCooldownHours, 10) || 6) === hrs;
            return (
              <TouchableOpacity
                key={hrs}
                style={[styles.frequencyChip, active && styles.frequencyChipActive]}
                onPress={() => setHomeNoveltyCooldownHours(String(hrs))}
                activeOpacity={0.8}
              >
                <LinearText
                  style={[styles.frequencyChipText, active && styles.frequencyChipTextActive]}
                  variant="body"
                >
                  {hrs}h
                </LinearText>
              </TouchableOpacity>
            );
          })}
        </View>
        <LinearText style={styles.hint} variant="body" tone="muted">
          Controls how quickly Home repeats the same topics in DO THIS NOW and UP NEXT. Lower = more
          repetition, higher = more novelty.
        </LinearText>
      </SectionToggle>

      <SectionToggle
        id="study_prefs"
        title="Study Preferences"
        icon="school-outline"
        tint="#E040FB"
      >
        <SettingsField
          label="Preferred session length (minutes)"
          value={sessionLength}
          onChangeText={setSessionLength}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsField
          label="Daily study goal (minutes)"
          value={dailyGoal}
          onChangeText={setDailyGoal}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsToggleRow
          label="Strict Mode"
          hint="Nag you instantly if you leave the app or are idle. Idle time won't count towards session duration."
          value={strictMode}
          onValueChange={setStrictMode}
          activeTrackColor={linearTheme.colors.error}
          style={{ marginTop: 16 }}
          labelIcon={
            <Ionicons name="shield-checkmark" size={16} color={linearTheme.colors.error} />
          }
        />
      </SectionToggle>

      <SectionToggle
        id="notifications"
        title="Notifications"
        icon="notifications-outline"
        tint="#FFD700"
      >
        <SettingsToggleRow
          label="Enable Guru's reminders"
          hint="Guru will send personalized daily accountability messages."
          value={notifs}
          onValueChange={setNotifs}
        />
        <SettingsField
          label="Reminder hour (0-23, e.g. 7 = 7:30 AM)"
          value={notifHour}
          onChangeText={setNotifHour}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
          hint="Evening nudge fires ~11 hours after this."
        />
        <SettingsLabel text="Guru presence frequency" />
        <View style={styles.frequencyRow}>
          {(['rare', 'normal', 'frequent', 'off'] as const).map((freq) => (
            <TouchableOpacity
              key={freq}
              style={[styles.freqBtn, guruFrequency === freq && styles.freqBtnActive]}
              onPress={() => setGuruFrequency(freq)}
            >
              <LinearText
                style={[styles.freqText, guruFrequency === freq && styles.freqTextActive]}
                variant="body"
              >
                {freq.charAt(0).toUpperCase() + freq.slice(1)}
              </LinearText>
            </TouchableOpacity>
          ))}
        </View>
        <LinearText style={styles.hint} variant="body" tone="muted">
          How often Guru sends ambient messages during sessions. Rare: every 30min, Normal: every
          20min, Frequent: every 10min.
        </LinearText>
        <TouchableOpacity style={styles.testBtn} onPress={testNotification} activeOpacity={0.8}>
          <LinearText style={styles.testBtnText} variant="body">
            Schedule Notifications Now
          </LinearText>
        </TouchableOpacity>
      </SectionToggle>

      <SectionToggle id="body_doubling" title="Body Doubling" icon="people-outline" tint="#7ED6A7">
        <SettingsToggleRow
          label="Guru presence during sessions"
          hint="Ambient toast messages and pulsing dot while you study. Helps with focus."
          value={bodyDoubling}
          onValueChange={setBodyDoubling}
        />
      </SectionToggle>

      <SectionToggle
        id="content"
        title="Content Type Preferences"
        icon="layers-outline"
        tint="#FF6B9D"
      >
        <LinearText style={styles.hint} variant="body" tone="muted">
          Block card types you don't want in sessions. Keypoints can't be blocked.
        </LinearText>
        <View style={styles.chipGrid}>
          {ALL_CONTENT_TYPES.map(({ type, label }) => {
            const isBlocked = blockedTypes.includes(type);
            const isLocked = type === 'keypoints';
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeChip,
                  isBlocked && styles.typeChipBlocked,
                  isLocked && styles.typeChipLocked,
                ]}
                onPress={() => {
                  if (isLocked) return;
                  setBlockedTypes((prev) =>
                    isBlocked
                      ? prev.filter((blockedType) => blockedType !== type)
                      : [...prev, type],
                  );
                }}
                activeOpacity={isLocked ? 1 : 0.8}
              >
                <LinearText
                  style={[styles.typeChipText, isBlocked && styles.typeChipTextBlocked]}
                  variant="body"
                >
                  {label}
                </LinearText>
                {isBlocked ? (
                  <LinearText style={styles.typeChipX} variant="body">
                    {' '}
                    X
                  </LinearText>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionToggle>

      <SectionToggle id="focus_subjects" title="Focus Subjects" icon="flask-outline" tint="#2196F3">
        <LinearText style={styles.hint} variant="body" tone="muted">
          Pin subjects to limit sessions to those areas only. Clear all to study everything.
        </LinearText>
        <View style={styles.chipGrid}>
          {subjects.map((s) => {
            const isFocused = focusSubjectIds.includes(s.id);
            return (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.typeChip,
                  isFocused && { backgroundColor: s.colorHex + '33', borderColor: s.colorHex },
                ]}
                onPress={() =>
                  setFocusSubjectIds((prev) =>
                    isFocused ? prev.filter((subjectId) => subjectId !== s.id) : [...prev, s.id],
                  )
                }
                activeOpacity={0.8}
              >
                <LinearText
                  style={[styles.typeChipText, isFocused && { color: s.colorHex }]}
                  variant="body"
                >
                  {s.shortCode}
                </LinearText>
              </TouchableOpacity>
            );
          })}
        </View>
        {focusSubjectIds.length > 0 ? (
          <TouchableOpacity onPress={() => setFocusSubjectIds([])} style={styles.clearBtn}>
            <LinearText style={styles.clearBtnText} variant="body">
              Clear focus (study all subjects)
            </LinearText>
          </TouchableOpacity>
        ) : null}
      </SectionToggle>

      <SectionToggle id="session" title="Session Timing" icon="timer-outline" tint="#FF9800">
        <SettingsField
          label="Idle timeout (minutes before auto-pause)"
          value={idleTimeout}
          onChangeText={setIdleTimeout}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsField
          label="Break duration between topics (minutes)"
          value={breakDuration}
          onChangeText={setBreakDuration}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
      </SectionToggle>

      <SectionToggle
        id="pomodoro"
        title="Pomodoro (Lecture Overlay)"
        icon="alarm-outline"
        tint="#F44336"
      >
        <SettingsToggleRow
          label="Enable Pomodoro Suggestion"
          hint="Auto-expand the external lecture overlay every interval to suggest a break."
          value={pomodoroEnabled}
          onValueChange={setPomodoroEnabled}
        />
        <LinearText
          style={[
            styles.hint,
            {
              color: pomodoroLectureQuizReady
                ? linearTheme.colors.success
                : pomodoroEnabled
                ? linearTheme.colors.error
                : linearTheme.colors.textMuted,
            },
          ]}
          variant="body"
          tone="muted"
        >
          {pomodoroLectureQuizReady
            ? 'Lecture-aware break quizzes are ready.'
            : pomodoroEnabled
            ? 'Currently this will only suggest a break until overlay permission, Groq, and Deepgram are configured.'
            : 'Pomodoro break suggestions are off.'}
        </LinearText>
        {!hasPomodoroOverlayPermission ? (
          <TouchableOpacity
            style={[
              styles.validateBtn,
              { alignSelf: 'flex-start', paddingHorizontal: 14, marginTop: 6 },
            ]}
            onPress={requestPomodoroOverlay}
            activeOpacity={0.8}
          >
            <LinearText style={styles.testBtnText} variant="body">
              Grant Overlay Permission
            </LinearText>
          </TouchableOpacity>
        ) : null}
        <View style={[styles.chipGrid, { marginTop: 10 }]}>
          {[
            { label: 'Overlay', ready: hasPomodoroOverlayPermission },
            { label: 'Groq', ready: hasPomodoroGroqKey },
            { label: 'Deepgram', ready: hasPomodoroDeepgramKey },
          ].map((item) => (
            <View
              key={item.label}
              style={[
                styles.typeChip,
                {
                  backgroundColor: item.ready
                    ? linearTheme.colors.success + '18'
                    : linearTheme.colors.error + '12',
                  borderColor: item.ready ? linearTheme.colors.success : linearTheme.colors.error,
                },
              ]}
            >
              <LinearText
                style={[
                  styles.typeChipText,
                  { color: item.ready ? linearTheme.colors.success : linearTheme.colors.error },
                ]}
                variant="body"
              >
                {item.label}
              </LinearText>
            </View>
          ))}
        </View>
        <SettingsField
          label="Pomodoro interval (minutes)"
          value={pomodoroInterval}
          onChangeText={setPomodoroInterval}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
          editable={pomodoroEnabled}
        />
        <View style={styles.modelChipRow}>
          {['5', '10', '20', '25', '30', '40'].map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.freqBtn, pomodoroInterval === value && styles.freqBtnActive]}
              onPress={() => setPomodoroInterval(value)}
              disabled={!pomodoroEnabled}
              activeOpacity={0.8}
            >
              <LinearText
                style={[
                  styles.freqText,
                  pomodoroInterval === value && styles.freqTextActive,
                  !pomodoroEnabled && { opacity: 0.45 },
                ]}
                variant="body"
              >
                {value}m
              </LinearText>
            </TouchableOpacity>
          ))}
        </View>
        <LinearText style={styles.hint} variant="body" tone="muted">
          Suggested: 20-30 minutes. The overlay can suggest a break without quiz data, but
          lecture-aware quiz breaks need both Groq and Deepgram.
        </LinearText>
      </SectionToggle>
    </>
  );
}
