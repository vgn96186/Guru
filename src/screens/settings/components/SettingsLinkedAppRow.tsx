import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import GlassSurface from '../../../components/primitives/GlassSurface';

export default function SettingsLinkedAppRow({
  label,
  linked,
  since,
}: {
  label: string;
  linked: boolean;
  since?: string | null;
}) {
  return (
    <GlassSurface
      elevation="low"
      intensity={20}
      style={styles.card}
      contentContainerStyle={styles.cardContent}
    >
      <View style={[styles.iconWrap, linked ? styles.iconWrapOk : styles.iconWrapTodo]}>
        <Ionicons
          name={linked ? 'link' : 'unlink'}
          size={18}
          color={linked ? n.colors.success : n.colors.textMuted}
        />
      </View>
      <View style={styles.copy}>
        <LinearText variant="label" style={styles.label}>
          {label}
        </LinearText>
        <View style={[styles.statusBadge, linked ? styles.statusBadgeOk : styles.statusBadgeIdle]}>
          <LinearText
            variant="caption"
            style={[styles.status, linked ? styles.statusOk : styles.statusIdle]}
          >
            {linked && since ? `Linked · ${since}` : linked ? 'Linked' : 'Not linked'}
          </LinearText>
        </View>
      </View>
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
    alignItems: 'center',
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  copy: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
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
  statusBadgeIdle: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  status: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusOk: { color: n.colors.success },
  statusIdle: { color: n.colors.textMuted },
});
