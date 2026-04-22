import React, { useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import SettingsField from '../components/SettingsField';
import type { SettingsSectionToggleProps } from '../components/SettingsSectionAccordion';
import ProfileSection from './ProfileSection';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import { BentoCard } from '../../../components/settings/BentoCard';
import SettingsToggleRow from '../components/SettingsToggleRow';
import { useSettingsState } from '../../../hooks/useSettingsState';
import { fetchExamDates } from '../../../services/aiService';

export function GeneralOverviewSection(props: any) {
  const { styles, SectionToggle, navigation } = props;

  const [name, setName] = useSettingsState('displayName', 'Doctor');
  const [inicetDate, setInicetDate] = useSettingsState('inicetDate', '');
  const [neetDate, setNeetDate] = useSettingsState('neetDate', '');
  const [loadingOrbStyle, setLoadingOrbStyle] = useSettingsState('loadingOrbStyle', 'classic');

  const [fetchingDates, setFetchingDates] = useState(false);
  const [fetchDatesMsg, setFetchDatesMsg] = useState('');

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
    } catch (e: any) {
      setFetchDatesMsg(`❌ ${e?.message || 'Could not fetch dates. Try manually.'}`);
    } finally {
      setFetchingDates(false);
    }
  }

  return (
    <>
      <BentoCard title="Profile Settings" className="mb-6">
        <ProfileSection
          SectionToggle={SectionToggle}
          styles={styles}
          onNavigateDeviceLink={() => navigation.navigate('DeviceLink')}
          name={name}
          setName={setName}
        />
      </BentoCard>

      <BentoCard title="App Appearance" className="mb-6">
        <SettingsToggleRow
          label="Turbulent Loading Orb"
          hint="Use the hyper-smooth fluid dynamics orb instead of the classic rings."
          value={loadingOrbStyle === 'turbulent'}
          onValueChange={(val: boolean) => setLoadingOrbStyle(val ? 'turbulent' : 'classic')}
        />
      </BentoCard>

      <BentoCard title="Exam Dates" className="mb-6">
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
            { marginTop: 8 },
            {
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
      </BentoCard>
    </>
  );
}
