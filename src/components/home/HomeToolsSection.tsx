import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';

const TILE_MIN_HEIGHT = 92;

export interface ToolItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

interface Props {
  expanded: boolean;
  isTablet: boolean;
  onToggle: () => void;
  tools: ToolItem[];
}

export default function HomeToolsSection({ expanded, isTablet, onToggle, tools }: Props) {
  const animation = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const [renderBody, setRenderBody] = useState(expanded);
  const columns = isTablet ? 3 : 2;
  const rows = Math.ceil(tools.length / columns);
  const expandedHeight =
    rows * TILE_MIN_HEIGHT +
    Math.max(0, rows - 1) * theme.spacing.md +
    theme.spacing.md * 2 +
    StyleSheet.hairlineWidth;

  useEffect(() => {
    if (expanded) {
      setRenderBody(true);
      Animated.timing(animation, {
        toValue: 1,
        duration: 220,
        useNativeDriver: false,
      }).start();
      return;
    }

    Animated.timing(animation, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setRenderBody(false);
    });
  }, [animation, expanded]);

  const bodyHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, expandedHeight],
  });

  return (
    <View style={styles.shell}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        activeOpacity={theme.alpha.subtlePressed}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse Tools' : 'Expand Tools'}
      >
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Tools</Text>
          <Text style={styles.summary}>Shortcuts for momentum, capture, and quick pivots</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textMuted}
        />
      </TouchableOpacity>

      {renderBody ? (
        <Animated.View
          style={[
            styles.bodyWrap,
            {
              height: bodyHeight,
              opacity: animation,
            },
          ]}
        >
          <View style={styles.body}>
            <View style={styles.grid}>
              {tools.map((tool) => (
                <TouchableOpacity
                  key={tool.key}
                  style={[styles.tile, isTablet && styles.tileTablet]}
                  onPress={tool.onPress}
                  activeOpacity={theme.alpha.pressed}
                  accessibilityRole="button"
                  accessibilityLabel={tool.label}
                >
                  <View style={styles.tileIcon}>
                    <Ionicons name={tool.icon} size={18} color={theme.colors.primaryLight} />
                  </View>
                  <Text style={styles.tileLabel}>{tool.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden',
  },
  header: {
    minHeight: 72,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  summary: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    padding: theme.spacing.md,
  },
  bodyWrap: {
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  tile: {
    width: '47%',
    minHeight: TILE_MIN_HEIGHT,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  tileTablet: {
    width: '31%',
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryTintSoft,
  },
  tileLabel: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
});
