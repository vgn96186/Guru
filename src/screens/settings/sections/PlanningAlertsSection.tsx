import React from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import SettingsField from '../components/SettingsField';
import SettingsLabel from '../components/SettingsLabel';
import SettingsToggleRow from '../components/SettingsToggleRow';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import { fetchExamDates } from '../../../services/aiService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function PlanningAlertsSection(props: any) {
  const { styles, testNotification, SectionToggle } = props;

  const {
    inicetDate,
    setInicetDate,
    neetDate,
    setNeetDate,
    dbmciClassStartDate,
    setDbmciClassStartDate,
    btrStartDate,
    setBtrStartDate,
    sessionLength,
    setSessionLength,
    dailyGoal,
    setDailyGoal,
    notifs,
    setNotifs,
    notifHour,
    setNotifHour,
    guruFrequency,
    setGuruFrequency,
    homeNoveltyCooldownHours,
    setHomeNoveltyCooldownHours,
  } = props;

  const [fetchingDates, setFetchingDates] = React.useState(false);
  const [fetchDatesMsg, setFetchDatesMsg] = React.useState('');

  async function handleAutoFetchDates() {
    setFetchingDates(true);
    setFetchDatesMsg('');
    try {
      const dates = await fetchExamDates('', undefined);
      setInicetDate(dates.inicetDate);
      setNeetDate(dates.neetDate);
      setFetchDatesMsg(
        `✅ Fetched: INICET ${dates.inicetDate} · NEET-PG ${dates.neetDate}. Verify and save.`,
      );
    } catch (e: unknown) {
      setFetchDatesMsg(
        `❌ ${(e instanceof Error ? e.message : String(e)) || 'Could not fetch dates. Try manually.'}`,
      );
    } finally {
      setFetchingDates(false);
    }
  }

  // Convert number to string for text inputs where needed
  const sessionLengthStr = String(sessionLength);
  const dailyGoalStr = String(dailyGoal);
  const notifHourStr = String(notifHour);
  const homeNoveltyStr = String(homeNoveltyCooldownHours);

  return (
    <>
      <SectionToggle id="plan_exams" title="Target Exams" icon="calendar" tint="#F6AD55">
        <SettingsField
          label="INICET date (YYYY-MM-DD)"
          value={inicetDate}
          onChangeText={setInicetDate}
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsField
          label="NEET-PG date (YYYY-MM-DD)"
          value={neetDate}
          onChangeText={setNeetDate}
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <TouchableOpacity
          style={[
            {
              marginTop: 8,
              width: '100%',
              alignItems: 'center',
              paddingVertical: 12,
              backgroundColor: 'rgba(94, 106, 210, 0.05)',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(94, 106, 210, 0.2)',
            },
            fetchingDates && { opacity: 0.5 },
          ]}
          onPress={handleAutoFetchDates}
          disabled={fetchingDates}
          activeOpacity={0.8}
        >
          {fetchingDates ? (
            <ActivityIndicator size="small" color={linearTheme.colors.accent} />
          ) : (
            <LinearText
              variant="body"
              style={{ fontSize: 13, fontWeight: '500', color: '#5E6AD2' }}
            >
              Auto-fetch dates via AI
            </LinearText>
          )}
        </TouchableOpacity>
        {fetchDatesMsg ? (
          <LinearText
            variant="body"
            style={[
              { fontSize: 12, marginTop: 8 },
              styles.hint,
              fetchDatesMsg.toLowerCase().includes('success') ||
              fetchDatesMsg.toLowerCase().includes('updated')
                ? { color: linearTheme.colors.success }
                : { color: linearTheme.colors.error },
            ]}
          >
            {fetchDatesMsg}
          </LinearText>
        ) : (
          <LinearText
            variant="body"
            tone="muted"
            style={{ fontSize: 12, color: '#8A8F98', marginTop: 8 }}
          >
            Uses AI to estimate upcoming exam dates. Always verify on nbe.edu.in.
          </LinearText>
        )}
      </SectionToggle>

      <SectionToggle id="plan_timeline" title="Study Plan Timeline" icon="time" tint="#A78BFA">
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
      </SectionToggle>

      <SectionToggle
        id="plan_goals"
        title="Session Timings & Goals"
        icon="hourglass"
        tint="#10B981"
      >
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
      </SectionToggle>

      <SectionToggle
        id="plan_reminders"
        title="Reminders & Wake Up"
        icon="notifications"
        tint="#F472B6"
      >
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
      </SectionToggle>

      <SectionToggle id="plan_novelty" title="Novelty Configuration" icon="refresh" tint="#38BDF8">
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
      </SectionToggle>
    </>
  );
}
