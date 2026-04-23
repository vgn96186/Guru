import React, { type ComponentProps } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassSurface from '../../../components/primitives/GlassSurface';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';

// Enable LayoutAnimation on Android (Skip on New Architecture to avoid warnings)
const isFabric = typeof global !== 'undefined' && !!((global as any).nativeFabricUIManager || (global as any).RN$Bridgeless);
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental && !isFabric) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <GlassSurface
      elevation="medium"
      intensity={30}
      style={[styles.section, expanded && styles.sectionExpanded]}
      contentContainerStyle={{ padding: 0 }}
    >
      <TouchableOpacity style={styles.sectionHeader} onPress={handleToggle} activeOpacity={0.7}>
        <View style={styles.sectionHeaderLeft}>
          <View
            style={[
              styles.sectionIconWrap,
              { backgroundColor: `${tint}15`, borderColor: `${tint}40` },
            ]}
          >
            <Ionicons name={icon} size={18} color={tint} />
          </View>
          <LinearText style={styles.sectionTitle}>{title}</LinearText>
        </View>
        <View style={styles.sectionHeaderRight}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={expanded ? linearTheme.colors.accent : linearTheme.colors.textMuted}
          />
        </View>
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.sectionContent}>
          <View
            style={{
              paddingHorizontal: linearTheme.spacing.lg,
              paddingBottom: linearTheme.spacing.lg,
            }}
          >
            {children}
          </View>
        </View>
      ) : null}
    </GlassSurface>
  );
}

export function SettingsSubSectionAccordion({
  title,
  expanded,
  onToggle,
  children,
}: SettingsSubSectionAccordionProps) {
  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <View style={styles.subSectionPanel}>
      <TouchableOpacity style={styles.subSectionHeader} onPress={handleToggle} activeOpacity={0.7}>
        <View style={styles.subSectionHeaderLeft}>
          <LinearText style={[styles.subSectionLabel, expanded && styles.subSectionLabelExpanded]}>
            {title}
          </LinearText>
        </View>
        <View style={styles.subSectionHeaderLine} />
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={expanded ? linearTheme.colors.accent : linearTheme.colors.borderHighlight}
        />
      </TouchableOpacity>
      {expanded ? <View style={styles.subSectionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: linearTheme.spacing.md,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionExpanded: {},
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: linearTheme.spacing.lg,
    paddingVertical: 18,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: linearTheme.spacing.md,
    flex: 1,
  },
  sectionHeaderRight: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionTitle: {
    color: linearTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionContent: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: linearTheme.spacing.md,
  },
  subSectionPanel: {
    marginBottom: 16,
    marginTop: 8,
  },
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: linearTheme.spacing.md,
    paddingVertical: 12,
  },
  subSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subSectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  subSectionLabel: {
    color: linearTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  subSectionLabelExpanded: {
    color: linearTheme.colors.accent,
  },
  subSectionBody: {
    paddingTop: 8,
  },
});
