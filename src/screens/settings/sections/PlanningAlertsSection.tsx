import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import SettingsField from '../components/SettingsField';
import SettingsLabel from '../components/SettingsLabel';
import SettingsToggleRow from '../components/SettingsToggleRow';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import { BentoCard } from '../../../components/settings/BentoCard';
import { useSettingsState } from '../../../hooks/useSettingsState';

export function PlanningAlertsSection(props: any) {
  const {
    styles,
    testNotification,
    pomodoroLectureQuizReady,
    hasPomodoroOverlayPermission,
    hasPomodoroGroqKey,
    hasPomodoroDeepgramKey,
    requestPomodoroOverlay,
  } = props;

  const [dbmciClassStartDate, setDbmciClassStartDate] = useSettingsState(
    'dbmciClassStartDate',
    null,
  );
  const [btrStartDate, setBtrStartDate] = useSettingsState('btrStartDate', null);
  const [sessionLength, setSessionLength] = useSettingsState('preferredSessionLength', 45);
  const [dailyGoal, setDailyGoal] = useSettingsState('dailyGoalMinutes', 120);
  const [idleTimeout, setIdleTimeout] = useSettingsState('idleTimeoutMinutes', 2);
  const [breakDuration, setBreakDuration] = useSettingsState('breakDurationMinutes', 5);
  const [notifs, setNotifs] = useSettingsState('notificationsEnabled', true);
  const [notifHour, setNotifHour] = useSettingsState('notificationHour', 7);
  const [guruFrequency, setGuruFrequency] = useSettingsState('guruFrequency', 'normal');
  const [homeNoveltyCooldownHours, setHomeNoveltyCooldownHours] = useSettingsState(
    'homeNoveltyCooldownHours',
    6,
  );
  const [pomodoroEnabled, setPomodoroEnabled] = useSettingsState('pomodoroEnabled', true);
  const [pomodoroInterval, setPomodoroInterval] = useSettingsState('pomodoroIntervalMinutes', 20);

  // Convert number to string for text inputs where needed
  const sessionLengthStr = String(sessionLength);
  const dailyGoalStr = String(dailyGoal);
  const idleTimeoutStr = String(idleTimeout);
  const breakDurationStr = String(breakDuration);
  const notifHourStr = String(notifHour);
  const homeNoveltyStr = String(homeNoveltyCooldownHours);
  const pomodoroIntervalStr = String(pomodoroInterval);

  return (
    <>
      <BentoCard title="Study Plan Timeline" className="mb-4">
        <SettingsField
          label="DBMCI One batch start date (YYYY-MM-DD)"
          value={dbmciClassStartDate || undefined}
          onChangeText={(val) => setDbmciClassStartDate(val)}
          placeholder="e.g. 2025-01-06"
          placeholderTextColor={linearTheme.colors.textMuted}
          autoCapitalize="none"
          hint="Set this to unlock the live-class position tracker in the Study Plan screen. Guru will highlight which subject DBMCI One is covering today."
        />
        <SettingsField
          label="BTR (Back to Roots) batch start date (YYYY-MM-DD)"
          value={btrStartDate || undefined}
          onChangeText={(val) => setBtrStartDate(val)}
          placeholder="e.g. 2025-09-01"
          placeholderTextColor={linearTheme.colors.textMuted}
          autoCapitalize="none"
          hint="Set this when you start the BTR revision batch."
        />
      </BentoCard>

      <BentoCard title="Session Timings & Goals" className="mb-4">
        <SettingsField
          label="Preferred session length (minutes)"
          value={sessionLengthStr}
          onChangeText={(val) => setSessionLength(parseInt(val, 10) || 45)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsField
          label="Daily study goal (minutes)"
          value={dailyGoalStr}
          onChangeText={(val) => setDailyGoal(parseInt(val, 10) || 120)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsField
          label="Idle timeout (minutes before auto-pause)"
          value={idleTimeoutStr}
          onChangeText={(val) => setIdleTimeout(parseInt(val, 10) || 2)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsField
          label="Break duration between topics (minutes)"
          value={breakDurationStr}
          onChangeText={(val) => setBreakDuration(parseInt(val, 10) || 5)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
      </BentoCard>

      <BentoCard title="Reminders & Wake Up" className="mb-4">
        <SettingsToggleRow
          label="Enable Guru's reminders"
          hint="Guru will send personalized daily accountability messages."
          value={notifs}
          onValueChange={setNotifs}
        />
        <SettingsField
          label="Reminder/Wake up hour (0-23, e.g. 7 = 7:30 AM)"
          value={notifHourStr}
          onChangeText={(val) => setNotifHour(parseInt(val, 10) || 7)}
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
          How often Guru sends ambient messages during sessions.
        </LinearText>
        <TouchableOpacity style={styles.testBtn} onPress={testNotification} activeOpacity={0.8}>
          <LinearText style={styles.testBtnText} variant="body">
            Schedule Notifications Now
          </LinearText>
        </TouchableOpacity>
      </BentoCard>

      <BentoCard title="Novelty Configuration" className="mb-4">
        <SettingsLabel text="Home novelty cooldown (hours)" />
        <View style={styles.frequencyRow}>
          {[2, 4, 6, 8, 12].map((hrs) => {
            const active = (parseInt(homeNoveltyStr, 10) || 6) === hrs;
            return (
              <TouchableOpacity
                key={hrs}
                style={[styles.frequencyChip, active && styles.frequencyChipActive]}
                onPress={() => setHomeNoveltyCooldownHours(hrs)}
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
          Controls how quickly Home repeats the same topics.
        </LinearText>
      </BentoCard>

      <BentoCard title="Pomodoro (Lecture Overlay)" className="mb-4">
        <SettingsToggleRow
          label="Enable Pomodoro Suggestion"
          hint="Auto-expand the external lecture overlay every interval to suggest a break."
          value={pomodoroEnabled ?? true}
          onValueChange={(val) => setPomodoroEnabled(val)}
        />
        <LinearText
          style={[
            styles.hint,
            {
              color:
                (pomodoroLectureQuizReady ?? false)
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
              ? 'Requires overlay permission, Groq, and Deepgram to be fully featured.'
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
        <SettingsField
          label="Pomodoro interval (minutes)"
          value={pomodoroIntervalStr}
          onChangeText={(val) => setPomodoroInterval(parseInt(val, 10) || 20)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
          editable={pomodoroEnabled}
        />
        <View style={styles.modelChipRow}>
          {['5', '10', '20', '25', '30', '40'].map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.freqBtn, pomodoroIntervalStr === value && styles.freqBtnActive]}
              onPress={() => setPomodoroInterval(parseInt(value, 10))}
              disabled={!pomodoroEnabled}
              activeOpacity={0.8}
            >
              <LinearText
                style={[
                  styles.freqText,
                  pomodoroIntervalStr === value && styles.freqTextActive,
                  !pomodoroEnabled && { opacity: 0.45 },
                ]}
                variant="body"
              >
                {value}m
              </LinearText>
            </TouchableOpacity>
          ))}
        </View>
      </BentoCard>
    </>
  );
}
