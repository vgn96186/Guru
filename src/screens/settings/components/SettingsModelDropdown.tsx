import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { linearTheme } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import SettingsLabel from './SettingsLabel';
import AppBottomSheet from '../../../components/primitives/AppBottomSheet';

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
  const selectedLabel =
    options.find((option) => option.id === value)?.label ?? (value || 'Select...');

  return (
    <>
      <SettingsLabel text={label} />
      <TouchableOpacity
        style={styles.dropdownTrigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <LinearText variant="body" style={styles.dropdownValue} numberOfLines={2}>
          {selectedLabel}
        </LinearText>
        <LinearText variant="body" tone="muted" style={styles.dropdownArrow}>
          ▼
        </LinearText>
      </TouchableOpacity>

      <AppBottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        subtitle="Choose the default model you want Guru to use here."
        snapPoints={['72%']}
        scrollable
      >
        {options.map((option, index) => {
          const showGroup =
            option.group && (index === 0 || options[index - 1]?.group !== option.group);
          return (
            <React.Fragment key={option.id}>
              {showGroup ? (
                <LinearText variant="caption" tone="accent" style={styles.dropdownGroupLabel}>
                  {option.group}
                </LinearText>
              ) : null}
              <TouchableOpacity
                style={[styles.dropdownItem, value === option.id && styles.dropdownItemActive]}
                onPress={() => {
                  onSelect(option.id);
                  setOpen(false);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownItemBody}>
                  <LinearText
                    variant="body"
                    style={[
                      styles.dropdownItemText,
                      value === option.id && styles.dropdownItemTextActive,
                    ]}
                    numberOfLines={2}
                  >
                    {option.label}
                  </LinearText>
                </View>
                {value === option.id ? (
                  <LinearText tone="accent" style={styles.dropdownCheck}>
                    ✓
                  </LinearText>
                ) : null}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </AppBottomSheet>
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
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    flex: 1,
  },
  dropdownArrow: { fontSize: 16, marginLeft: 8 },
  dropdownGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingTop: 14,
    paddingBottom: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  dropdownItemBody: {
    flex: 1,
    minWidth: 0,
  },
  dropdownItemActive: { backgroundColor: linearTheme.colors.primaryTintSoft },
  dropdownItemText: { fontSize: 14, lineHeight: 20, flex: 1 },
  dropdownItemTextActive: { color: linearTheme.colors.accent, fontWeight: '700' },
  dropdownCheck: { fontSize: 16, fontWeight: '700', marginLeft: 8 },
});
