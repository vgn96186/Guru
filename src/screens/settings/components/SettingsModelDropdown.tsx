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

  // Group options by their `group` property.
  const groupedOptions = React.useMemo(() => {
    const groups: { name: string; items: SettingsModelOption[] }[] = [];
    const ungrouped: SettingsModelOption[] = [];

    options.forEach((opt) => {
      if (!opt.group) {
        ungrouped.push(opt);
        return;
      }
      let g = groups.find((x) => x.name === opt.group);
      if (!g) {
        g = { name: opt.group, items: [] };
        groups.push(g);
      }
      g.items.push(opt);
    });

    return { groups, ungrouped };
  }, [options]);

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
        snapPoints={['85%']}
        scrollable
      >
        <View style={{ paddingBottom: 40 }}>
          {/* Ungrouped items */}
          {groupedOptions.ungrouped.map((option) => (
            <DropdownItem
              key={option.id}
              option={option}
              isActive={value === option.id}
              onPress={() => {
                onSelect(option.id);
                setOpen(false);
              }}
            />
          ))}

          {/* Collapsible groups */}
          {groupedOptions.groups.map((group) => (
            <CollapsibleGroup
              key={group.name}
              name={group.name}
              items={group.items}
              currentValue={value}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </AppBottomSheet>
    </>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function CollapsibleGroup({
  name,
  items,
  currentValue,
  onSelect,
}: {
  name: string;
  items: SettingsModelOption[];
  currentValue: string;
  onSelect: (id: string) => void;
}) {
  // Auto-expand if the currently selected value is in this group
  const isSelectedInGroup = items.some((i) => i.id === currentValue);
  const [expanded, setExpanded] = React.useState(isSelectedInGroup);

  const toggle = () => {
    // Requires UIManager.setLayoutAnimationEnabledExperimental(true) globally on Android
    // Assuming it's enabled in the app root or ApiKeysSection.
    const { LayoutAnimation } = require('react-native');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={{ marginBottom: 4 }}>
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: linearTheme.colors.background,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: expanded ? linearTheme.colors.borderHighlight : 'transparent',
        }}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LinearText
            variant="label"
            style={{
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontSize: 12,
            }}
          >
            {name}
          </LinearText>
          <View
            style={{
              backgroundColor: linearTheme.colors.primaryTintSoft,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 999,
            }}
          >
            <LinearText variant="caption" tone="accent" style={{ fontWeight: '700', fontSize: 10 }}>
              {items.length}
            </LinearText>
          </View>
        </View>
        <LinearText variant="caption" tone="muted">
          {expanded ? '▲' : '▼'}
        </LinearText>
      </TouchableOpacity>

      {expanded && (
        <View style={{ marginTop: 4, paddingLeft: 8 }}>
          {items.map((option) => (
            <DropdownItem
              key={option.id}
              option={option}
              isActive={currentValue === option.id}
              onPress={() => onSelect(option.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function DropdownItem({
  option,
  isActive,
  onPress,
}: {
  option: SettingsModelOption;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.dropdownItemBody}>
        <LinearText
          variant="body"
          style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]}
          numberOfLines={2}
        >
          {option.label}
        </LinearText>
      </View>
      {isActive ? (
        <LinearText tone="accent" style={styles.dropdownCheck}>
          ✓
        </LinearText>
      ) : null}
    </TouchableOpacity>
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
