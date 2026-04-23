import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';
import { useProfileQuery, useLevelInfo } from '../../../hooks/queries/useProfile';
import { PROVIDER_DISPLAY_NAMES } from '../../../types';
import { sanitizeProviderOrder } from '../../../utils/providerOrder';
import { linearTheme as n } from '../../../theme/linearTheme';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function DashboardOverview(props: any) {
  const { setActiveCategory, isTablet } = props;
  const { data: profile } = useProfileQuery();
  const levelInfo = useLevelInfo();

  const name = profile?.displayName || 'Doctor';
  const initial = name.charAt(0).toUpperCase();
  const xp = profile?.totalXp || 0;
  const level = profile?.currentLevel || 1;
  const streak = profile?.streakCurrent || 0;

  const xpProgress = levelInfo ? levelInfo.progress * 100 : 0;

  // Determine next exam
  let examName = 'Target Exam';
  let daysLeft = null;
  const now = Date.now();

  if (profile?.inicetDate) {
    const ms = new Date(profile.inicetDate).getTime() - now;
    if (ms > 0) {
      examName = 'INICET';
      daysLeft = Math.ceil(ms / 86400000);
    }
  }

  if (daysLeft === null && profile?.neetDate) {
    const ms = new Date(profile.neetDate).getTime() - now;
    if (ms > 0) {
      examName = 'NEET-PG';
      daysLeft = Math.ceil(ms / 86400000);
    }
  }

  const isStrict = profile?.strictModeEnabled;
  const faceTrack = profile?.faceTrackingEnabled ?? true;

  const topProvider = sanitizeProviderOrder(profile?.providerOrder)[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  const topProviderName = (PROVIDER_DISPLAY_NAMES as any)[topProvider] ?? 'Auto';
  const isLocalReady = profile?.useLocalModel && profile?.localModelPath;

  const renderGridChip = (
    category: string,
    icon: keyof typeof Ionicons.glyphMap,
    color: string,
    title: string,
    subtitle: string,
  ) => (
    <View style={{ flexBasis: isTablet ? '48%' : '100%', flexGrow: 1 }}>
      <TouchableOpacity
        style={styles.gridChip}
        onPress={() => setActiveCategory(category)}
        activeOpacity={0.8}
      >
        <View style={styles.chipHeader}>
          <View style={[styles.iconWrap, { backgroundColor: `${color}15` }]}>
            <Ionicons name={icon} size={18} color={color} />
          </View>
          <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.2)" />
        </View>
        <View style={{ marginTop: 'auto' }}>
          <LinearText variant="title" style={{ fontSize: 18, color: '#E8E8E8' }}>
            {title}
          </LinearText>
          <LinearText
            variant="meta"
            tone="muted"
            style={{ fontSize: 12, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            {subtitle}
          </LinearText>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <View
      style={{
        flexDirection: isTablet ? 'row' : 'column',
        gap: 16,
        marginBottom: 16,
        alignItems: 'stretch',
      }}
    >
      {/* Left Column: Player Card */}
      <View style={{ flex: isTablet ? 1 : undefined }}>
        <LinearSurface compact style={[styles.playerCard, { flex: 1 }]}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <View style={styles.avatarLarge}>
                <LinearText variant="title" style={{ fontSize: 28, color: '#FFFFFF' }}>
                  {initial}
                </LinearText>
              </View>
              <View style={{ flex: 1 }}>
                <LinearText variant="title" style={{ fontSize: 24, marginBottom: 4 }}>
                  {name}
                </LinearText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <LinearText variant="meta" tone="secondary" style={{ fontSize: 14 }}>
                    {levelInfo?.name || 'Novice'}
                  </LinearText>
                  <View style={styles.dot} />
                  <LinearText variant="meta" tone="secondary" style={{ fontSize: 14 }}>
                    Level {level}
                  </LinearText>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View>
                <LinearText variant="title" style={{ fontSize: 20 }}>
                  {xp.toLocaleString()}
                </LinearText>
                <LinearText variant="meta" tone="muted" style={styles.statLabel}>
                  TOTAL XP
                </LinearText>
              </View>
              <View
                style={{ width: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', height: '100%' }}
              />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="flame" size={18} color={n.colors.warning} />
                  <LinearText variant="title" style={{ fontSize: 20 }}>
                    {streak}
                  </LinearText>
                </View>
                <LinearText variant="meta" tone="muted" style={styles.statLabel}>
                  DAY STREAK
                </LinearText>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 24 }}>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}
            >
              <LinearText variant="meta" tone="muted" style={{ fontSize: 12, fontWeight: '600' }}>
                LEVEL PROGRESS
              </LinearText>
              <LinearText variant="meta" tone="muted" style={{ fontSize: 12 }}>
                {levelInfo ? `${(levelInfo.xpForNext - xp).toLocaleString()} to Next` : ''}
              </LinearText>
            </View>
            <View style={styles.track}>
              <View
                style={[styles.fill, { width: `${Math.min(100, Math.max(0, xpProgress))}%` }]}
              />
            </View>
          </View>
        </LinearSurface>
      </View>

      {/* Right Column: 2x2 Action Grid */}
      <View style={{ flex: isTablet ? 1.3 : undefined }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, height: '100%' }}>
          {renderGridChip(
            'planning',
            'calendar',
            n.colors.accent,
            daysLeft !== null ? `${daysLeft} Days` : 'No Target',
            `Until ${examName}`,
          )}
          {renderGridChip(
            'planning',
            'time',
            n.colors.warning,
            `${profile?.dailyGoalMinutes || 120} Mins`,
            'Daily Study Goal',
          )}
          {renderGridChip(
            'interventions',
            isStrict ? 'shield' : 'shield-checkmark',
            isStrict ? '#F87171' : '#10B981',
            isStrict ? 'Strict Mode' : faceTrack ? 'Tracking Active' : 'No Guardrails',
            'Session Rules',
          )}
          {renderGridChip(
            'ai',
            'git-network',
            '#3B82F6',
            topProviderName,
            isLocalReady ? 'Local + Cloud AI' : 'Cloud Routing',
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  playerCard: {
    padding: 24,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'space-between',
    minHeight: 240,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#5E6AD2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  track: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#5E6AD2',
    borderRadius: 3,
  },
  gridChip: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    minHeight: 130,
  },
  chipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
