import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';
import SkeletonPlaceholder from '../../../components/primitives/SkeletonPlaceholder';
import { useProfileQuery, useLevelInfo } from '../../../hooks/queries/useProfile';
import { PROVIDER_DISPLAY_NAMES } from '../../../types';
import { sanitizeProviderOrder } from '../../../utils/providerOrder';
import { linearTheme as n } from '../../../theme/linearTheme';
import { dailyLogRepository } from '../../../db/repositories';
import { updateUserProfile } from '../../../db/queries/progress';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function DashboardOverview(props: any) {
  const { setActiveCategory, isTablet } = props;
  const { data: profile, isLoading } = useProfileQuery();
  const levelInfo = useLevelInfo();
  const queryClient = useQueryClient();

  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: dailyLog } = useQuery({
    queryKey: ['dailyLog', todayIso],
    queryFn: () => dailyLogRepository.getDailyLog(todayIso),
  });
  const todayMins = dailyLog?.totalMinutes || 0;
  const goalMins = profile?.dailyGoalMinutes || 120;
  const goalProgress = Math.min(100, Math.max(0, (todayMins / goalMins) * 100));

  const name = profile?.displayName || 'Doctor';
  const initial = name.charAt(0).toUpperCase();
  const xp = profile?.totalXp || 0;
  const level = profile?.currentLevel || 1;
  const streak = profile?.streakCurrent || 0;

  const xpProgress = levelInfo ? levelInfo.progress * 100 : 0;

  const hour = new Date().getHours();
  let greeting = 'Good Evening';
  if (hour < 12) greeting = 'Good Morning';
  else if (hour < 17) greeting = 'Good Afternoon';
  else if (hour > 22) greeting = 'Late Night Grind';

  // Determine next exam — pick nearest upcoming exam regardless of type
  let examName = 'Target Exam';
  let daysLeft = null;
  const now = Date.now();

  const candidates: Array<{ name: string; ms: number }> = [];
  if (profile?.inicetDate) {
    const ms = new Date(profile.inicetDate).getTime() - now;
    if (ms > 0) candidates.push({ name: 'INICET', ms });
  }
  if (profile?.neetDate) {
    const ms = new Date(profile.neetDate).getTime() - now;
    if (ms > 0) candidates.push({ name: 'NEET-PG', ms });
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.ms - b.ms);
    const next = candidates[0];
    examName = next.name;
    daysLeft = Math.ceil(next.ms / 86400000);
  }
  const isStrict = profile?.strictModeEnabled;
  const topProvider = sanitizeProviderOrder(profile?.providerOrder)[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  const topProviderName = (PROVIDER_DISPLAY_NAMES as any)[topProvider] ?? 'Auto';
  const isLocalReady = profile?.useLocalModel && profile?.localModelPath;

  const handleToggleStrict = async () => {
    await updateUserProfile({ strictModeEnabled: !isStrict });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const renderGridChip = (
    category: string,
    icon: keyof typeof Ionicons.glyphMap,
    color: string,
    title: string,
    subtitle: string,
    progress?: number,
    onPressOverride?: () => void,
  ) => (
    <View style={{ flexBasis: isTablet ? '48%' : '100%', flexGrow: 1 }}>
      <TouchableOpacity
        style={styles.gridChip}
        onPress={onPressOverride || (() => setActiveCategory(category))}
        activeOpacity={0.8}
      >
        <View style={styles.chipHeader}>
          <View style={[styles.iconWrap, { backgroundColor: `${color}15` }]}>
            <Ionicons name={icon} size={18} color={color} />
          </View>
          <Ionicons
            name={onPressOverride ? 'swap-horizontal' : 'arrow-forward'}
            size={16}
            color="rgba(255,255,255,0.2)"
          />
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
          {progress !== undefined && (
            <View
              style={[
                styles.track,
                { marginTop: 8, height: 4, backgroundColor: 'rgba(255,255,255,0.05)' },
              ]}
            >
              <View style={[styles.fill, { width: `${progress}%`, backgroundColor: color }]} />
            </View>
          )}
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
          {isLoading ? (
            <DashboardSkeleton />
          ) : (
            <>
              <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <View style={styles.avatarLarge}>
                <LinearText variant="title" style={{ fontSize: 28, color: '#FFFFFF' }}>
                  {initial}
                </LinearText>
              </View>
              <View style={{ flex: 1 }}>
                <LinearText
                  variant="meta"
                  tone="accent"
                  style={{ fontSize: 11, letterSpacing: 0.5, marginBottom: 2 }}
                >
                  {greeting.toUpperCase()}
                </LinearText>
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

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              <LinearText variant="meta" tone="muted" style={{ fontSize: 10 }}>
                {isLocalReady ? '🟢 LOCAL LLM' : '🟡 CLOUD AI'}
              </LinearText>
              <LinearText variant="meta" tone="muted" style={{ fontSize: 10 }}>
                {profile?.syncCode ? 'SYNCED' : 'STANDALONE'}
              </LinearText>
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
            </>
          )}
        </LinearSurface>
      </View>

      {/* Right Column: 2x2 Action Grid */}
      <View style={{ flex: isTablet ? 1.3 : undefined }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
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
            `${todayMins} / ${goalMins} m`,
            'Daily Goal Progress',
            goalProgress,
          )}
          {renderGridChip(
            'interventions',
            isStrict ? 'shield' : 'shield-checkmark',
            isStrict ? '#F87171' : '#10B981',
            isStrict ? 'Strict Mode ON' : 'Strict Mode OFF',
            'Tap to toggle',
            undefined,
            handleToggleStrict,
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

function DashboardSkeleton() {
  return (
    <View>
      {/* Avatar + name area */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <SkeletonPlaceholder circle size={64} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonPlaceholder width="30%" height={10} borderRadius={4} />
          <SkeletonPlaceholder width="55%" height={20} borderRadius={6} />
          <SkeletonPlaceholder width="40%" height={12} borderRadius={4} />
        </View>
      </View>

      {/* Status tags */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        <SkeletonPlaceholder width={80} height={10} borderRadius={4} />
        <SkeletonPlaceholder width={65} height={10} borderRadius={4} />
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
        <View style={{ gap: 6 }}>
          <SkeletonPlaceholder width={60} height={18} borderRadius={6} />
          <SkeletonPlaceholder width={50} height={10} borderRadius={4} />
        </View>
        <View style={{ width: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
        <View style={{ gap: 6 }}>
          <SkeletonPlaceholder width={40} height={18} borderRadius={6} />
          <SkeletonPlaceholder width={55} height={10} borderRadius={4} />
        </View>
      </View>

      {/* Level progress bar */}
      <View style={{ marginTop: 24, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <SkeletonPlaceholder width="30%" height={10} borderRadius={4} />
          <SkeletonPlaceholder width="20%" height={10} borderRadius={4} />
        </View>
        <SkeletonPlaceholder width="100%" height={6} borderRadius={3} />
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
    backgroundColor: n.colors.card,
    borderWidth: 1,
    borderColor: n.colors.border,
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
