import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../../constants/theme';

interface AdvancedToolsSectionProps {
  onExportBackup: () => void;
  onImportBackup: () => void;
  onExportJsonBackup: () => void;
  onImportJsonBackup: () => void;
  onClearCache: () => void;
  onResetProgress: () => void;
  isExporting: boolean;
  isImporting: boolean;
}

function AdvancedToolsSection({
  onExportBackup,
  onImportBackup,
  onExportJsonBackup,
  onImportJsonBackup,
  onClearCache,
  onResetProgress,
  isExporting,
  isImporting,
}: AdvancedToolsSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>ADVANCED TOOLS</Text>
      
      <View style={styles.buttonGroup}>
        <Text style={styles.groupLabel}>Database Backup (SQLite)</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.button} onPress={onExportBackup} disabled={isExporting}>
            {isExporting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.buttonText}>Export .db</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.outlineButton]} onPress={onImportBackup} disabled={isImporting}>
            <Text style={[styles.buttonText, styles.outlineButtonText]}>Import .db</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Binary backup of the entire database. Recommended for full migrations.</Text>
      </View>

      <View style={styles.buttonGroup}>
        <Text style={styles.groupLabel}>Portability Backup (JSON)</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.button} onPress={onExportJsonBackup}>
            <Text style={styles.buttonText}>Export JSON</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.outlineButton]} onPress={onImportJsonBackup}>
            <Text style={[styles.buttonText, styles.outlineButtonText]}>Import JSON</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Human-readable backup. Better for partial restores or sync across platforms.</Text>
      </View>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerLabel}>Danger Zone</Text>
        <TouchableOpacity style={styles.dangerButton} onPress={onClearCache}>
          <Text style={styles.dangerButtonText}>Clear AI Content Cache</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerButton} onPress={onResetProgress}>
          <Text style={styles.dangerButtonText}>Reset All Study Progress</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(AdvancedToolsSection);

const styles = StyleSheet.create({
  section: {
    backgroundColor: theme.colors.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 20,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  buttonGroup: { marginBottom: 20 },
  groupLabel: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  buttonText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  outlineButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.primary },
  outlineButtonText: { color: theme.colors.primary },
  hint: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 6, lineHeight: 16 },
  dangerZone: {
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  dangerLabel: { color: theme.colors.error, fontSize: 12, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase' },
  dangerButton: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  dangerButtonText: { color: theme.colors.textSecondary, fontSize: 14 },
});
