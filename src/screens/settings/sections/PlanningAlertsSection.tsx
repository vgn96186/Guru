import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native';
import SettingsField from '../components/SettingsField';
import SettingsLabel from '../components/SettingsLabel';
import SettingsToggleRow from '../components/SettingsToggleRow';
import LinearText from '../../../components/primitives/LinearText';
import LinearSurface from '../../../components/primitives/LinearSurface';
import { linearTheme } from '../../../theme/linearTheme';
import { fetchExamDates } from '../../../services/aiService';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return new Date();
  }

  return parsed;
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthCells(visibleMonth: Date) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    cells.push({ date: new Date(year, month - 1, previousMonthDays - i), inMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }

  while (cells.length % 7 !== 0 || cells.length < 42) {
    const nextDay = cells.length - firstDay - daysInMonth + 1;
    cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false });
  }

  return cells;
}

function SettingsDatePickerField({
  label,
  value,
  onChange,
  placeholder = 'Pick a date',
  hint,
  styles,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- transitional settings refactor boundary
  styles: any;
}) {
  const [showPicker, setShowPicker] = React.useState(false);
  const selectedDate = React.useMemo(() => parseDateValue(value), [value]);
  const [visibleMonth, setVisibleMonth] = React.useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );
  const today = React.useMemo(() => new Date(), []);
  const monthCells = React.useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);

  React.useEffect(() => {
    if (showPicker) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [selectedDate, showPicker]);

  const moveMonth = React.useCallback((delta: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }, []);

  return (
    <View style={{ marginBottom: 4 }}>
      <SettingsLabel text={label} />
      <TouchableOpacity
        style={[styles.input, { minHeight: 48, justifyContent: 'center' }]}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.8}
      >
        <LinearText variant="body" tone={value ? 'primary' : 'muted'}>
          {value || placeholder}
        </LinearText>
      </TouchableOpacity>
      {hint ? (
        <LinearText style={styles.hint} variant="body" tone="muted">
          {hint}
        </LinearText>
      ) : null}
      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 18,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
          }}
          onPress={() => setShowPicker(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ alignSelf: 'center', width: '100%', maxWidth: 380 }}
          >
            <LinearSurface
              style={{
                borderRadius: 28,
                padding: 18,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.12)',
                backgroundColor: '#121214',
              }}
            >
              <View
                style={{
                  minHeight: 86,
                  borderRadius: 22,
                  padding: 16,
                  marginBottom: 16,
                  justifyContent: 'flex-end',
                  backgroundColor: 'rgba(94, 106, 210, 0.16)',
                  borderWidth: 1,
                  borderColor: 'rgba(94, 106, 210, 0.28)',
                }}
              >
                <LinearText variant="meta" tone="accent" style={{ letterSpacing: 1.1 }}>
                  {label.toUpperCase()}
                </LinearText>
                <LinearText variant="title" style={{ marginTop: 4, fontSize: 24 }}>
                  {value || 'Choose date'}
                </LinearText>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <TouchableOpacity
                  onPress={() => moveMonth(-1)}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: linearTheme.colors.background,
                    borderWidth: 1,
                    borderColor: linearTheme.colors.border,
                  }}
                >
                  <LinearText variant="body" style={{ fontSize: 22 }}>
                    ‹
                  </LinearText>
                </TouchableOpacity>

                <View style={{ alignItems: 'center' }}>
                  <LinearText variant="label">
                    {MONTH_NAMES[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                  </LinearText>
                  <TouchableOpacity
                    onPress={() => {
                      const next = new Date();
                      onChange(formatDateValue(next));
                      setShowPicker(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <LinearText variant="caption" tone="accent" style={{ marginTop: 3 }}>
                      Jump to today
                    </LinearText>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => moveMonth(1)}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: linearTheme.colors.background,
                    borderWidth: 1,
                    borderColor: linearTheme.colors.border,
                  }}
                >
                  <LinearText variant="body" style={{ fontSize: 22 }}>
                    ›
                  </LinearText>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {WEEKDAYS.map((day, index) => (
                  <View key={`${day}-${index}`} style={{ flex: 1, alignItems: 'center' }}>
                    <LinearText variant="caption" tone="muted" style={{ fontWeight: '800' }}>
                      {day}
                    </LinearText>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {monthCells.map(({ date, inMonth }) => {
                  const selected = isSameDate(date, selectedDate);
                  const isToday = isSameDate(date, today);
                  return (
                    <TouchableOpacity
                      key={date.toISOString()}
                      onPress={() => {
                        onChange(formatDateValue(date));
                        setShowPicker(false);
                      }}
                      activeOpacity={0.76}
                      style={{
                        width: `${100 / 7}%`,
                        aspectRatio: 1,
                        padding: 3,
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          borderRadius: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: selected
                            ? linearTheme.colors.accent
                            : isToday
                              ? 'rgba(94, 106, 210, 0.15)'
                              : 'transparent',
                          borderWidth: selected || isToday ? 1 : 0,
                          borderColor: selected
                            ? 'rgba(255,255,255,0.4)'
                            : 'rgba(94, 106, 210, 0.35)',
                        }}
                      >
                        <LinearText
                          variant="body"
                          style={{
                            fontSize: 14,
                            fontWeight: selected || isToday ? '800' : '600',
                            color: selected
                              ? '#FFFFFF'
                              : inMonth
                                ? linearTheme.colors.textPrimary
                                : linearTheme.colors.textMuted,
                            opacity: inMonth ? 1 : 0.42,
                          }}
                        >
                          {date.getDate()}
                        </LinearText>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={() => setShowPicker(false)}
                activeOpacity={0.85}
                style={{
                  marginTop: 14,
                  paddingVertical: 13,
                  alignItems: 'center',
                  borderRadius: 16,
                  backgroundColor: linearTheme.colors.background,
                  borderWidth: 1,
                  borderColor: linearTheme.colors.border,
                }}
              >
                <LinearText variant="body" tone="secondary" style={{ fontWeight: '700' }}>
                  Cancel
                </LinearText>
              </TouchableOpacity>
            </LinearSurface>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

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
        `❌ ${
          (e instanceof Error ? e.message : String(e)) || 'Could not fetch dates. Try manually.'
        }`,
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
        <SettingsDatePickerField
          label="INICET date"
          value={inicetDate}
          onChange={setInicetDate}
          styles={styles}
        />
        <SettingsDatePickerField
          label="NEET-PG date"
          value={neetDate}
          onChange={setNeetDate}
          styles={styles}
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
        <SettingsDatePickerField
          label="DBMCI One batch start date"
          value={dbmciClassStartDate || undefined}
          onChange={setDbmciClassStartDate}
          placeholder="Pick DBMCI start date"
          styles={styles}
        />
        <SettingsDatePickerField
          label="BTR (Back to Roots) batch start date"
          value={btrStartDate || undefined}
          onChange={setBtrStartDate}
          placeholder="Pick BTR start date"
          styles={styles}
        />
      </SectionToggle>

      <SectionToggle
        id="plan_goals"
        title="Session Timings & Goals"
        icon="hourglass"
        tint="#10B981"
      >
        <SettingsField
          label="Session length (min)"
          value={sessionLengthStr}
          onChangeText={(val) => setSessionLength(parseInt(val, 10) || 45)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsField
          label="Daily goal (min)"
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
        <SettingsToggleRow label="Reminders" value={notifs} onValueChange={setNotifs} />
        <SettingsField
          label="Wake up hour (0-23)"
          value={notifHourStr}
          onChangeText={(val) => setNotifHour(parseInt(val, 10) || 7)}
          keyboardType="number-pad"
          placeholderTextColor={linearTheme.colors.textMuted}
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
