import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SettingsToggleRow from '../components/SettingsToggleRow';
import SettingsField from '../components/SettingsField';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import { ALL_CONTENT_TYPES } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function InterventionsSection(props: any) {
  const { styles, subjects, SectionToggle } = props;

  const {
    strictMode,
    setStrictMode,
    doomscrollShield,
    setDoomscrollShield,
    faceTracking,
    setFaceTracking,
    blockedTypes,
    setBlockedTypes,
    focusSubjectIds,
    setFocusSubjectIds,
    idleTimeout,
    setIdleTimeout,
    breakDuration,
    setBreakDuration,
    pomodoroEnabled,
    setPomodoroEnabled,
    pomodoroInterval,
    setPomodoroInterval,
  } = props;

  const idleTimeoutStr = String(idleTimeout);
  const breakDurationStr = String(breakDuration);
  const pomodoroIntervalStr = String(pomodoroInterval);

  return (
    <>
      <SectionToggle
        id="interv_flow"
        title="Interventions & Study Flow"
        icon="shield"
        tint="#F87171"
      >
        <SettingsToggleRow
          label="Strict Mode"
          value={strictMode}
          onValueChange={setStrictMode}
          activeTrackColor={linearTheme.colors.error}
          labelIcon={
            <Ionicons name="shield-checkmark" size={16} color={linearTheme.colors.error} />
          }
        />
        <SettingsToggleRow
          label="Doomscroll Shield"
          value={doomscrollShield}
          onValueChange={setDoomscrollShield}
          style={{ marginTop: 16 }}
        />
        <SettingsToggleRow
          label="Face Tracking"
          value={faceTracking}
          onValueChange={setFaceTracking}
          style={{ marginTop: 16 }}
        />
      </SectionToggle>

      <SectionToggle id="interv_breaks" title="Session Rules & Breaks" icon="cafe" tint="#60A5FA">
        <SettingsField
          label="Idle timeout (min)"
          value={idleTimeoutStr}
          onChangeText={(val) => setIdleTimeout(parseInt(val, 10) || 2)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsField
          label="Break duration (min)"
          value={breakDurationStr}
          onChangeText={(val) => setBreakDuration(parseInt(val, 10) || 5)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
      </SectionToggle>

      <SectionToggle
        id="interv_pomodoro"
        title="Pomodoro (Lecture Overlay)"
        icon="timer"
        tint="#FB923C"
      >
        <SettingsToggleRow
          label="Pomodoro suggestions"
          value={pomodoroEnabled ?? true}
          onValueChange={(val) => setPomodoroEnabled(val)}
        />
        <LinearText
          style={[
            styles.hint,
            {
              color:
                (props.pomodoroLectureQuizReady ?? false)
                  ? linearTheme.colors.success
                  : pomodoroEnabled
                    ? linearTheme.colors.error
                    : linearTheme.colors.textMuted,
            },
          ]}
          variant="body"
          tone="muted"
        >
          {props.pomodoroLectureQuizReady
            ? 'Lecture-aware break quizzes are ready.'
            : pomodoroEnabled
              ? 'Requires overlay permission, Groq, and Deepgram to be fully featured.'
              : 'Pomodoro break suggestions are off.'}
        </LinearText>
        {!props.hasPomodoroOverlayPermission && (
          <TouchableOpacity
            style={[
              styles.validateBtn,
              { alignSelf: 'flex-start', paddingHorizontal: 14, marginTop: 6 },
            ]}
            onPress={props.requestPomodoroOverlay}
            activeOpacity={0.8}
          >
            <LinearText style={styles.testBtnText} variant="body">
              Grant Overlay Permission
            </LinearText>
          </TouchableOpacity>
        )}
        <View style={[styles.chipGrid, { marginTop: 10 }]}>
          {[
            { label: 'Overlay', ready: props.hasPomodoroOverlayPermission },
            { label: 'Groq', ready: props.hasPomodoroGroqKey },
            { label: 'Deepgram', ready: props.hasPomodoroDeepgramKey },
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
      </SectionToggle>

      <SectionToggle id="interv_subjects" title="Focus Subjects" icon="book" tint="#34D399">
        <LinearText style={styles.hint} variant="body" tone="muted">
          Pin subjects to limit sessions to those areas only. Clear all to study everything.
        </LinearText>
        <View style={styles.chipGrid}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- subject chip iteration */}
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
                  setFocusSubjectIds(
                    isFocused
                      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
                        focusSubjectIds.filter((subjectId: any) => subjectId !== s.id)
                      : [...focusSubjectIds, s.id],
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

      <SectionToggle
        id="interv_content"
        title="Content Type Preferences"
        icon="layers"
        tint="#A78BFA"
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
                  setBlockedTypes(
                    isBlocked
                      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
                        blockedTypes.filter((blockedType: any) => blockedType !== type)
                      : [...blockedTypes, type],
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
                    X
                  </LinearText>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionToggle>
    </>
  );
}
