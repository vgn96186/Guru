import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import GlassSurface from '../../../components/primitives/GlassSurface';

export default function SettingsPermissionRow({
  label,
  status,
  onFix,
}: {
  label: string;
  status: string;
  onFix: () => void;
}) {
  const isOk = status === 'granted';

  return (
    <GlassSurface
      elevation="low"
      intensity={20}
      style={styles.card}
      contentContainerStyle={styles.cardContent}
    >
      <View style={styles.copy}>
        <LinearText variant="label" style={styles.permLabel}>
          {label}
        </LinearText>
        <View style={[styles.statusBadge, isOk ? styles.statusBadgeOk : styles.statusBadgeError]}>
          <LinearText
            variant="caption"
            style={[styles.permStatus, isOk ? styles.permOk : styles.permError]}
          >
            {isOk ? '✓ Active' : status === 'denied' ? '✗ Disabled' : '○ Not Set'}
          </LinearText>
        </View>
      </View>
      {!isOk && (
        <TouchableOpacity style={styles.fixBtn} onPress={onFix} activeOpacity={0.8}>
          <LinearText variant="caption" style={styles.fixBtnText}>
            Fix
          </LinearText>
        </TouchableOpacity>
      )}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  cardContent: {
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  copy: {
    flex: 1,
    paddingRight: 16,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  permLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: n.colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeOk: {
    backgroundColor: `${n.colors.success}15`,
    borderColor: `${n.colors.success}33`,
  },
  statusBadgeError: {
    backgroundColor: `${n.colors.error}15`,
    borderColor: `${n.colors.error}33`,
  },
  permStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
  permOk: { color: n.colors.success },
  permError: { color: n.colors.error },
  fixBtn: {
    backgroundColor: n.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: n.colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fixBtnText: {
    color: n.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
});
