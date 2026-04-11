import React, { type ComponentProps } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import { whiteAlpha } from '../../../theme/colorUtils';

export type SettingsSectionIconName = ComponentProps<typeof Ionicons>['name'];

export interface SettingsSectionToggleProps {
  id: string;
  title: string;
  icon: SettingsSectionIconName;
  tint: string;
  children: React.ReactNode;
}

interface SettingsSectionAccordionProps extends Omit<SettingsSectionToggleProps, 'id'> {
  expanded: boolean;
  onToggle: () => void;
}

export interface SettingsSubSectionToggleProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

interface SettingsSubSectionAccordionProps extends Omit<SettingsSubSectionToggleProps, 'id'> {
  expanded: boolean;
  onToggle: () => void;
}

export function SettingsSectionAccordion({
  title,
  icon,
  tint,
  expanded,
  onToggle,
  children,
}: SettingsSectionAccordionProps) {
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={styles.sectionHeaderLeft}>
          <View
            style={[
              styles.sectionIconWrap,
              { backgroundColor: `${tint}18`, borderColor: `${tint}55` },
            ]}
          >
            <Ionicons name={icon} size={18} color={tint} />
          </View>
          <LinearText style={styles.sectionTitle}>{title}</LinearText>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={linearTheme.colors.textMuted}
        />
      </TouchableOpacity>
      {expanded ? (
        <LinearSurface padded={false} style={styles.sectionContent}>
          {children}
        </LinearSurface>
      ) : null}
    </View>
  );
}

export function SettingsSubSectionAccordion({
  title,
  expanded,
  onToggle,
  children,
}: SettingsSubSectionAccordionProps) {
  return (
    <View style={styles.subSectionPanel}>
      <TouchableOpacity style={styles.subSectionHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={styles.subSectionHeaderLeft}>
          <View style={styles.subSectionAccent} />
          <LinearText style={styles.subSectionLabel}>{title}</LinearText>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={linearTheme.colors.accent}
        />
      </TouchableOpacity>
      {expanded ? <View style={styles.subSectionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: linearTheme.spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: linearTheme.colors.border,
    backgroundColor: linearTheme.colors.surface,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: linearTheme.spacing.lg,
    paddingVertical: 14,
    minHeight: 68,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: linearTheme.spacing.md,
    flex: 1,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionTitle: {
    color: linearTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionContent: {
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: linearTheme.colors.border,
    padding: linearTheme.spacing.lg,
    backgroundColor: whiteAlpha['1.5'],
  },
  subSectionPanel: {
    backgroundColor: linearTheme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: linearTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  subSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: linearTheme.spacing.sm,
    minHeight: 34,
  },
  subSectionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subSectionAccent: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: linearTheme.colors.accent,
  },
  subSectionLabel: {
    color: linearTheme.colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subSectionBody: {
    paddingTop: 10,
  },
});
