import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { linearTheme as n } from '../../../theme/linearTheme';
import {
  HOME_GRID_STACK_BREAKPOINT,
  HOME_SECTION_GAP,
  HOME_TILE_HEIGHT,
} from '../../../components/home/homeLayout';
import { styles } from '../HomeScreen.styles';

/** Lightweight skeleton for Home to show during transitions */
export function HomeSkeleton() {
  const { width } = useWindowDimensions();
  const stackHomeGrid = width < HOME_GRID_STACK_BREAKPOINT;
  return (
    <View style={styles.content}>
      {/* Header Skeleton */}
      <View style={[styles.headerRow, { opacity: 0.3 }]}>
        <View>
          <View
            style={{ width: 140, height: 24, backgroundColor: n.colors.border, borderRadius: 4 }}
          />
          {/* Exam Countdown Placeholder */}
          <View
            style={{
              width: 180,
              height: 14,
              backgroundColor: n.colors.border,
              borderRadius: 4,
              marginTop: 10,
              opacity: 0.6,
            }}
          />
        </View>
        <View
          style={{ width: 80, height: 32, backgroundColor: n.colors.border, borderRadius: 16 }}
        />
      </View>

      {/* Hero Button Skeleton */}
      <View style={[styles.heroSection, { opacity: 0.2, marginTop: 10 }]}>
        <View
          style={{ width: '100%', height: 180, backgroundColor: n.colors.border, borderRadius: 24 }}
        />
      </View>

      {/* Stats Bar Skeleton */}
      <View style={{ opacity: 0.2, marginBottom: n.spacing.md }}>
        <View
          style={{ width: '100%', height: 60, backgroundColor: n.colors.border, borderRadius: 12 }}
        />
      </View>

      {/* Grid Skeleton */}
      <View
        style={[
          styles.gridLandscape,
          styles.twoColumnGrid,
          stackHomeGrid && styles.homeGridStacked,
          { opacity: 0.2, marginTop: 16 },
        ]}
      >
        <View style={[styles.leftColumn, stackHomeGrid && styles.homeGridStackedColumn]}>
          <View
            style={{ width: 80, height: 12, backgroundColor: n.colors.border, marginBottom: 12 }}
          />
          <View
            style={{
              width: '100%',
              height: HOME_TILE_HEIGHT,
              backgroundColor: n.colors.border,
              borderRadius: 16,
            }}
          />
          <View
            style={{
              width: 80,
              height: 12,
              backgroundColor: n.colors.border,
              marginTop: HOME_SECTION_GAP,
              marginBottom: 12,
            }}
          />
          <View
            style={{
              width: '100%',
              height: HOME_TILE_HEIGHT,
              backgroundColor: n.colors.border,
              borderRadius: 16,
            }}
          />
        </View>
        <View style={[styles.rightColumn, stackHomeGrid && styles.homeGridStackedColumn]}>
          <View
            style={{ width: 80, height: 12, backgroundColor: n.colors.border, marginBottom: 12 }}
          />
          <View
            style={{
              width: '100%',
              height: HOME_TILE_HEIGHT,
              backgroundColor: n.colors.border,
              borderRadius: 16,
            }}
          />
          <View
            style={{
              width: 80,
              height: 12,
              backgroundColor: n.colors.border,
              marginTop: HOME_SECTION_GAP,
              marginBottom: 12,
            }}
          />
          <View
            style={{
              width: '100%',
              height: HOME_TILE_HEIGHT,
              backgroundColor: n.colors.border,
              borderRadius: 16,
            }}
          />
        </View>
      </View>
    </View>
  );
}
