import React from 'react';
import { View, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearButton from '../primitives/LinearButton';
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
          <LinearButton
            label="Export .db"
            style={styles.button}
            textStyle={styles.buttonText}
            onPress={onExportBackup}
            loading={isExporting}
          />
          <LinearButton
            label="Import .db"
            variant="secondary"
            style={styles.button}
            textTone="accent"
            textStyle={styles.buttonText}
            onPress={onImportBackup}
            disabled={isImporting}
          />
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
          <LinearButton
            label="Export JSON"
            style={styles.button}
            textStyle={styles.buttonText}
            onPress={onExportJsonBackup}
          />
          <LinearButton
            label="Import JSON"
            variant="secondary"
            style={styles.button}
            textTone="accent"
            textStyle={styles.buttonText}
            onPress={onImportJsonBackup}
          />
        </View>
        <LinearText variant="bodySmall" tone="muted" style={styles.hint}>
          Human-readable backup. Better for partial restores or sync across platforms.
        </LinearText>
      </View>

      <View style={styles.dangerZone}>
        <LinearText variant="badge" tone="error" style={styles.dangerLabel}>
          Danger Zone
        </LinearText>
        <View style={styles.dangerActions}>
          <LinearButton
            label="Clear AI Content Cache"
            variant="secondary"
            textTone="error"
            style={styles.dangerButton}
            textStyle={styles.dangerButtonText}
            onPress={onClearCache}
          />
          <LinearButton
            label="Reset All Study Progress"
            variant="secondary"
            textTone="error"
            style={styles.dangerButton}
            textStyle={styles.dangerButtonText}
            onPress={onResetProgress}
          />
        </View>
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
  },
  buttonText: { fontSize: 13 },
  hint: { color: n.colors.textSecondary, fontSize: 11, marginTop: 6, lineHeight: 16 },
  dangerZone: {
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: n.colors.border,
  },
  dangerActions: { gap: 10 },
  dangerLabel: {
    color: n.colors.error,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  dangerButton: {
    width: '100%',
  },
  dangerButtonText: { fontSize: 14 },
});
