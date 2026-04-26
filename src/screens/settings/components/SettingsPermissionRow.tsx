import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import GlassSurface from '../../../components/primitives/GlassSurface';

export default function SettingsPermissionRow({
  label,
  hint,
  icon = 'key-outline',
  status,
  onFix,
}: {
  label: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
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
      <View style={[styles.iconWrap, isOk ? styles.iconWrapOk : styles.iconWrapTodo]}>
        <Ionicons name={icon} size={18} color={isOk ? n.colors.success : n.colors.warning} />
      </View>
      <View style={styles.copy}>
        <LinearText variant="label" style={styles.permLabel}>
          {label}
        </LinearText>
        {hint ? (
          <LinearText variant="caption" tone="muted" style={styles.permHint}>
            {hint}
          </LinearText>
        ) : null}
        <View style={[styles.statusBadge, isOk ? styles.statusBadgeOk : styles.statusBadgeError]}>
          <LinearText
            variant="caption"
            style={[styles.permStatus, isOk ? styles.permOk : styles.permError]}
          >
            {isOk ? 'Active' : status === 'denied' ? 'Disabled' : 'Not set'}
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
    borderRadius: 18,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  cardContent: {
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconWrapOk: {
    backgroundColor: `${n.colors.success}12`,
    borderColor: `${n.colors.success}33`,
  },
  iconWrapTodo: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.32)',
  },
  copy: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  permLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: n.colors.textPrimary,
  },
  permHint: {
    lineHeight: 17,
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
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.32)',
  },
  permStatus: {
    fontSize: 11,
    fontWeight: '800',
  },
  permOk: { color: n.colors.success },
  permError: { color: n.colors.warning },
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
    fontWeight: '800',
  },
});
