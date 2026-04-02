import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { linearTheme } from '../../../theme/linearTheme';

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
    <View style={styles.permRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.permLabel}>{label}</Text>
        <Text style={[styles.permStatus, isOk ? styles.permOk : styles.permError]}>
          {isOk ? '✓ Active' : status === 'denied' ? '✗ Disabled' : '○ Not Set'}
        </Text>
      </View>
      {!isOk && (
        <TouchableOpacity style={styles.fixBtn} onPress={onFix}>
          <Text style={styles.fixBtnText}>Fix</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: linearTheme.colors.border,
  },
  permLabel: { color: linearTheme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  permStatus: { fontSize: 12, marginTop: 2 },
  permOk: { color: linearTheme.colors.success },
  permError: { color: linearTheme.colors.error },
  fixBtn: {
    backgroundColor: linearTheme.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: linearTheme.colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fixBtnText: { color: linearTheme.colors.accent, fontSize: 12, fontWeight: '800' },
});
