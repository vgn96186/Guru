import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { linearTheme } from '../../../theme/linearTheme';
import SettingsLabel from './SettingsLabel';

export interface SettingsModelOption {
  id: string;
  label: string;
  group?: string;
}

export default function SettingsModelDropdown({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: SettingsModelOption[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.id === value)?.label ?? (value || 'Select...');

  return (
    <>
      <SettingsLabel text={label} />
      <TouchableOpacity
        style={styles.dropdownTrigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.dropdownValue} numberOfLines={2}>
          {selectedLabel}
        </Text>
        <Text style={styles.dropdownArrow}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownSheetTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator>
              {options.map((opt, idx) => {
                const showGroup = opt.group && (idx === 0 || options[idx - 1]?.group !== opt.group);
                return (
                  <React.Fragment key={opt.id}>
                    {showGroup && <Text style={styles.dropdownGroupLabel}>{opt.group}</Text>}
                    <TouchableOpacity
                      style={[styles.dropdownItem, value === opt.id && styles.dropdownItemActive]}
                      onPress={() => {
                        onSelect(opt.id);
                        setOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          value === opt.id && styles.dropdownItemTextActive,
                        ]}
                        numberOfLines={2}
                      >
                        {opt.label}
                      </Text>
                      {value === opt.id && <Text style={styles.dropdownCheck}>✓</Text>}
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: linearTheme.colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: linearTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  dropdownValue: {
    color: linearTheme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    flex: 1,
  },
  dropdownArrow: { color: linearTheme.colors.textMuted, fontSize: 16, marginLeft: 8 },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  dropdownSheet: {
    backgroundColor: linearTheme.colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    maxHeight: '80%',
  },
  dropdownSheetTitle: {
    color: linearTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: linearTheme.colors.border,
  },
  dropdownGroupLabel: {
    color: linearTheme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemActive: { backgroundColor: linearTheme.colors.primaryTintSoft },
  dropdownItemText: { color: linearTheme.colors.textPrimary, fontSize: 14, lineHeight: 20, flex: 1 },
  dropdownItemTextActive: { color: linearTheme.colors.accent, fontWeight: '700' },
  dropdownCheck: { color: linearTheme.colors.accent, fontSize: 16, fontWeight: '700', marginLeft: 8 },
});
