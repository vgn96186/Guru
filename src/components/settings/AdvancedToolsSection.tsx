import React from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from '../primitives/LinearText';

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
      <LinearText variant="sectionTitle" tone="muted" style={styles.sectionTitle}>
        ADVANCED TOOLS
      </LinearText>

      <View style={styles.buttonGroup}>
        <LinearText variant="label" style={styles.groupLabel}>
          Database Backup (SQLite)
        </LinearText>
        <View style={styles.row}>
          <TouchableOpacity style={styles.button} onPress={onExportBackup} disabled={isExporting}>
            {isExporting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <LinearText variant="body" style={styles.buttonText}>
                Export .db
              </LinearText>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.outlineButton]}
            onPress={onImportBackup}
            disabled={isImporting}
          >
            <LinearText variant="body" style={[styles.buttonText, styles.outlineButtonText]}>
              Import .db
            </LinearText>
          </TouchableOpacity>
        </View>
        <LinearText variant="bodySmall" tone="muted" style={styles.hint}>
          Binary backup of the entire database. Recommended for full migrations.
        </LinearText>
      </View>

      <View style={styles.buttonGroup}>
        <LinearText variant="label" style={styles.groupLabel}>
          Portability Backup (JSON)
        </LinearText>
        <View style={styles.row}>
          <TouchableOpacity style={styles.button} onPress={onExportJsonBackup}>
            <LinearText variant="body" style={styles.buttonText}>
              Export JSON
            </LinearText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.outlineButton]}
            onPress={onImportJsonBackup}
          >
            <LinearText variant="body" style={[styles.buttonText, styles.outlineButtonText]}>
              Import JSON
            </LinearText>
          </TouchableOpacity>
        </View>
        <LinearText variant="bodySmall" tone="muted" style={styles.hint}>
          Human-readable backup. Better for partial restores or sync across platforms.
        </LinearText>
      </View>

      <View style={styles.dangerZone}>
        <LinearText variant="badge" tone="error" style={styles.dangerLabel}>
          Danger Zone
        </LinearText>
        <TouchableOpacity style={styles.dangerButton} onPress={onClearCache}>
          <LinearText variant="body" style={styles.dangerButtonText}>
            Clear AI Content Cache
          </LinearText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerButton} onPress={onResetProgress}>
          <LinearText variant="body" style={styles.dangerButtonText}>
            Reset All Study Progress
          </LinearText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(AdvancedToolsSection);

const styles = StyleSheet.create({
  section: {
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginBottom: 20,
  },
  sectionTitle: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  buttonGroup: { marginBottom: 20 },
  groupLabel: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    backgroundColor: n.colors.accent,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  buttonText: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  outlineButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: n.colors.accent },
  outlineButtonText: { color: n.colors.accent },
  hint: { color: n.colors.textSecondary, fontSize: 11, marginTop: 6, lineHeight: 16 },
  dangerZone: {
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: n.colors.border,
  },
  dangerLabel: {
    color: n.colors.error,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  dangerButton: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  dangerButtonText: { color: n.colors.textSecondary, fontSize: 14 },
});
