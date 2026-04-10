import React from 'react';
import { Switch, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SettingsLabel from '../components/SettingsLabel';
import LinearTextInput from '../../../components/primitives/LinearTextInput';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import { ALL_CONTENT_TYPES } from '../types';

export default function StudySections(props: any) {
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
        <SettingsLabel text="DBMCI One batch start date (YYYY-MM-DD)" />
        <LinearTextInput
          style={styles.input}
          value={dbmciClassStartDate}
          onChangeText={setDbmciClassStartDate}
          placeholder="e.g. 2025-01-06"
          placeholderTextColor={linearTheme.colors.textMuted}
          autoCapitalize="none"
        />
        <LinearText style={styles.hint} variant="body" tone="muted">
          Set this to unlock the live-class position tracker in the Study Plan screen. Guru will
          highlight which subject DBMCI One is covering today.
        </LinearText>
        <SettingsLabel text="BTR (Back to Roots) batch start date (YYYY-MM-DD)" />
        <LinearTextInput
          style={styles.input}
          value={btrStartDate}
          onChangeText={setBtrStartDate}
          placeholder="e.g. 2025-09-01"
          placeholderTextColor={linearTheme.colors.textMuted}
          autoCapitalize="none"
        />
        <LinearText style={styles.hint} variant="body" tone="muted">
          Set this when you start the BTR revision batch. Guru will align your daily revision queue
          with the current BTR subject.
        </LinearText>
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
        <SettingsLabel text="Preferred session length (minutes)" />
        <LinearTextInput
          style={styles.input}
          value={sessionLength}
          onChangeText={setSessionLength}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsLabel text="Daily study goal (minutes)" />
        <LinearTextInput
          style={styles.input}
          value={dailyGoal}
          onChangeText={setDailyGoal}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <View style={[styles.switchRow, { marginTop: 16 }]}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="shield-checkmark" size={16} color={linearTheme.colors.error} />
              <LinearText style={styles.switchLabel} variant="label">
                Strict Mode
              </LinearText>
            </View>
            <LinearText style={styles.hint} variant="body" tone="muted">
              Nag you instantly if you leave the app or are idle. Idle time won't count towards
              session duration.
            </LinearText>
          </View>
          <Switch
            value={strictMode}
            onValueChange={setStrictMode}
            trackColor={{ true: linearTheme.colors.error, false: linearTheme.colors.border }}
            thumbColor={linearTheme.colors.textPrimary}
          />
        </View>
      </SectionToggle>

      <SectionToggle
        id="notifications"
        title="Notifications"
        icon="notifications-outline"
        tint="#FFD700"
      >
        <View style={styles.switchRow}>
          <View>
            <LinearText style={styles.switchLabel} variant="label">
              Enable Guru's reminders
            </LinearText>
            <LinearText style={styles.hint} variant="body" tone="muted">
              Guru will send personalized daily accountability messages
            </LinearText>
          </View>
          <Switch
            value={notifs}
            onValueChange={setNotifs}
            trackColor={{ true: linearTheme.colors.accent, false: linearTheme.colors.border }}
            thumbColor={linearTheme.colors.textPrimary}
          />
        </View>
        <SettingsLabel text="Reminder hour (0–23, e.g. 7 = 7:30 AM)" />
        <LinearTextInput
          style={styles.input}
          value={notifHour}
          onChangeText={setNotifHour}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <LinearText style={styles.hint} variant="body" tone="muted">
          Evening nudge fires ~11 hours after this.
        </LinearText>
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
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <LinearText style={styles.switchLabel} variant="label">
              Guru presence during sessions
            </LinearText>
            <LinearText style={styles.hint} variant="body" tone="muted">
              Ambient toast messages and pulsing dot while you study. Helps with focus.
            </LinearText>
          </View>
          <Switch
            value={bodyDoubling}
            onValueChange={setBodyDoubling}
            trackColor={{ true: linearTheme.colors.accent, false: linearTheme.colors.border }}
            thumbColor={linearTheme.colors.textPrimary}
          />
        </View>
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
                  setBlockedTypes((prev: any) =>
                    isBlocked ? prev.filter((t: any) => t !== type) : [...prev, type],
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
                {isBlocked && (
                  <LinearText style={styles.typeChipX} variant="body">
                    {' '}
                    ✕
                  </LinearText>
                )}
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
          {subjects.map((s: any) => {
            const isFocused = focusSubjectIds.includes(s.id);
            return (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.typeChip,
                  isFocused && { backgroundColor: s.colorHex + '33', borderColor: s.colorHex },
                ]}
                onPress={() =>
                  setFocusSubjectIds((prev: any) =>
                    isFocused ? prev.filter((id: any) => id !== s.id) : [...prev, s.id],
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
        {focusSubjectIds.length > 0 && (
          <TouchableOpacity onPress={() => setFocusSubjectIds([])} style={styles.clearBtn}>
            <LinearText style={styles.clearBtnText} variant="body">
              Clear focus (study all subjects)
            </LinearText>
          </TouchableOpacity>
        )}
      </SectionToggle>

      <SectionToggle id="session" title="Session Timing" icon="timer-outline" tint="#FF9800">
        <SettingsLabel text="Idle timeout (minutes before auto-pause)" />
        <LinearTextInput
          style={styles.input}
          value={idleTimeout}
          onChangeText={setIdleTimeout}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsLabel text="Break duration between topics (minutes)" />
        <LinearTextInput
          style={styles.input}
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
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <LinearText style={styles.switchLabel} variant="label">
              Enable Pomodoro Suggestion
            </LinearText>
            <LinearText style={styles.hint} variant="body" tone="muted">
              Auto-expand the external lecture overlay every interval to suggest a break.
            </LinearText>
          </View>
          <Switch
            value={pomodoroEnabled}
            onValueChange={setPomodoroEnabled}
            trackColor={{ true: linearTheme.colors.accent, false: linearTheme.colors.border }}
            thumbColor={linearTheme.colors.textPrimary}
          />
        </View>
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
        {!hasPomodoroOverlayPermission && (
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
        )}
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
        <SettingsLabel text="Pomodoro interval (minutes)" />
        <LinearTextInput
          style={styles.input}
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
