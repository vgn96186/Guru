import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface PermissionRowProps {
  label: string;
  status: string;
  onFix: () => void;
}

export default function PermissionRow({ label, status, onFix }: PermissionRowProps) {
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  left: { flex: 1 },
  label: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 2, fontWeight: '700' },
  granted: { color: theme.colors.success },
  denied: { color: theme.colors.error },
  fixBtn: {
    backgroundColor: `${theme.colors.primary}22`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  fixBtnText: { color: theme.colors.primary, fontSize: 12, fontWeight: '700' },
});
