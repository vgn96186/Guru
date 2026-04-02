import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';

interface PermissionRowProps {
  label: string;
  status: string;
  onFix: () => void;
}

function PermissionRow({ label, status, onFix }: PermissionRowProps) {
  const isGranted = status === 'granted';
  
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.status, isGranted ? styles.granted : styles.denied]}>
          {isGranted ? 'Granted' : 'Missing'}
        </Text>
      </View>
      {!isGranted && (
        <TouchableOpacity style={styles.fixBtn} onPress={onFix}>
          <Text style={styles.fixBtnText}>Fix</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default React.memo(PermissionRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  left: { flex: 1 },
  label: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 2, fontWeight: '700' },
  granted: { color: n.colors.success },
  denied: { color: n.colors.error },
  fixBtn: {
    backgroundColor: `${n.colors.accent}22`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: n.colors.accent,
  },
  fixBtnText: { color: n.colors.accent, fontSize: 12, fontWeight: '700' },
});
