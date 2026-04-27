import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme as n } from '../../../theme/linearTheme';

export interface SettingsCommandProps {
  providerReadyCount: number;
  permissionReadyCount: number;
  planningAnchorCount: number;
  topProviderLabel: string;
  oauthConnectionCount: number;
  localAiSummary: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles?: any;
}

export default function SettingsCommand({
  providerReadyCount,
  permissionReadyCount,
  planningAnchorCount,
  topProviderLabel,
  oauthConnectionCount,
  localAiSummary,
}: SettingsCommandProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        <View style={styles.chip}>
          <Ionicons name="cellular" size={14} color={n.colors.textMuted} style={styles.icon} />
          <LinearText variant="caption" style={styles.chipLabel}>
            Providers:
          </LinearText>
          <LinearText variant="caption" tone="accent" style={styles.chipValue}>
            {providerReadyCount}
          </LinearText>
        </View>

        <View style={styles.chip}>
          <Ionicons
            name="shield-checkmark"
            size={14}
            color={n.colors.textMuted}
            style={styles.icon}
          />
          <LinearText variant="caption" style={styles.chipLabel}>
            Permissions:
          </LinearText>
          <LinearText variant="caption" tone="success" style={styles.chipValue}>
            {permissionReadyCount}/4
          </LinearText>
        </View>

        <View style={styles.chip}>
          <Ionicons name="calendar" size={14} color={n.colors.textMuted} style={styles.icon} />
          <LinearText variant="caption" style={styles.chipLabel}>
            Plan anchors:
          </LinearText>
          <LinearText variant="caption" tone="warning" style={styles.chipValue}>
            {planningAnchorCount}/4
          </LinearText>
        </View>

        <View style={styles.chip}>
          <Ionicons name="git-network" size={14} color={n.colors.textMuted} style={styles.icon} />
          <LinearText variant="caption" style={styles.chipLabel}>
            Routing:
          </LinearText>
          <LinearText variant="caption" tone="accent" style={styles.chipValue}>
            {topProviderLabel}
          </LinearText>
        </View>

        <View style={styles.chip}>
          <Ionicons name="link" size={14} color={n.colors.textMuted} style={styles.icon} />
          <LinearText variant="caption" style={styles.chipLabel}>
            OAuth connects:
          </LinearText>
          <LinearText variant="caption" tone="success" style={styles.chipValue}>
            {oauthConnectionCount}
          </LinearText>
        </View>

        <View style={styles.chip}>
          <Ionicons name="server" size={14} color={n.colors.textMuted} style={styles.icon} />
          <LinearText variant="caption" style={styles.chipLabel}>
            Local AI:
          </LinearText>
          <LinearText variant="caption" tone="warning" style={styles.chipValue}>
            {localAiSummary}
          </LinearText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  icon: {
    marginRight: 6,
  },
  chipLabel: {
    color: n.colors.textSecondary,
    marginRight: 4,
    fontSize: 12,
  },
  chipValue: {
    fontWeight: '700',
    fontSize: 12,
  },
});
