import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import LinearTextInput from '../../../components/primitives/LinearTextInput';
import LinearSurface from '../../../components/primitives/LinearSurface';
import { FILTER_OPTIONS, type TopicFilter } from '../logic/topicDetailLogic';
import type { TopicWithProgress } from '../../../types';
import { styles } from '../TopicDetailScreen.styles';

interface TopicFilterControlsProps {
  isSingleTopicView: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: TopicFilter;
  setActiveFilter: (f: TopicFilter) => void;
  filterCounts: Record<TopicFilter, number>;
  dueTopics: TopicWithProgress[];
  highYieldTopics: TopicWithProgress[];
  weakTopics: TopicWithProgress[];
  launchBatch: (topics: TopicWithProgress[], actionType: 'study' | 'review' | 'deep_dive') => void;
}

export function TopicFilterControls({
  isSingleTopicView,
  searchQuery,
  setSearchQuery,
  activeFilter,
  setActiveFilter,
  filterCounts,
  dueTopics,
  highYieldTopics,
  weakTopics,
  launchBatch,
}: TopicFilterControlsProps) {
  if (isSingleTopicView) {
    return (
      <View style={styles.controls}>
        <LinearSurface compact style={styles.singleTopicBanner}>
          <LinearText variant="label" style={styles.singleTopicBannerTitle}>
            Topic page
          </LinearText>
          <LinearText variant="bodySmall" tone="secondary" style={styles.singleTopicBannerText}>
            Start a focused session for this topic or add notes below.
          </LinearText>
        </LinearSurface>
      </View>
    );
  }

  return (
    <View style={styles.controls}>
      <LinearTextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search topics in this subject..."
        containerStyle={styles.searchInputContainer}
        style={styles.searchInput}
        leftIcon={<Ionicons name="search-outline" size={16} color={n.colors.textMuted} />}
      />
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[styles.filterChip, activeFilter === option.key && styles.filterChipActive]}
            onPress={() => setActiveFilter(option.key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Filter: ${option.label} ${filterCounts[option.key]}`}
            accessibilityState={{ selected: activeFilter === option.key }}
          >
            <LinearText
              variant="chip"
              style={[
                styles.filterChipText,
                activeFilter === option.key && styles.filterChipTextActive,
              ]}
            >
              {option.label} {filterCounts[option.key]}
            </LinearText>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.bulkRow}>
        <TouchableOpacity
          style={[styles.bulkChip, styles.bulkDueChip]}
          onPress={() => launchBatch(dueTopics, 'review')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Review all due topics"
        >
          <LinearText variant="chip" style={styles.bulkChipText}>
            Review all due
          </LinearText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bulkChip, styles.bulkHighYieldChip]}
          onPress={() => launchBatch(highYieldTopics, 'study')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Study high yield topics"
        >
          <LinearText variant="chip" style={styles.bulkChipText}>
            Study high yield
          </LinearText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bulkChip, styles.bulkWeakChip]}
          onPress={() => launchBatch(weakTopics, 'deep_dive')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Review weak topics only"
        >
          <LinearText variant="chip" style={styles.bulkChipText}>
            Review weak only
          </LinearText>
        </TouchableOpacity>
      </View>
    </View>
  );
}
