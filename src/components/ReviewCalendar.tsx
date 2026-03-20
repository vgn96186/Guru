/**
 * ReviewCalendar
 * Shows upcoming review dates on a mini calendar view.
 * Topics appear as dots on their review dates.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getReviewCalendarData, type ReviewDay } from '../db/queries/topics';
import { theme } from '../constants/theme';

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default React.memo(function ReviewCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<ReviewDay | null>(null);
  const [reviewData, setReviewData] = useState<ReviewDay[]>([]);

  useEffect(() => {
    void getReviewCalendarData(year, month).then(setReviewData);
  }, [year, month]);
  const reviewMap = useMemo(() => {
    const m = new Map<string, ReviewDay>();
    for (const d of reviewData) m.set(d.date, d);
    return m;
  }, [reviewData]);

  const todayStr = toLocalDateKey(now);

  // Build calendar grid
  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (number | null)[][] = [];
    let currentWeek: (number | null)[] = Array(firstDay).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push(d);
      if (currentWeek.length === 7) {
        grid.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      grid.push(currentWeek);
    }
    return grid;
  }, [year, month]);

  const changeMonth = (delta: number) => {
    setMonth((prevM) => {
      const nextM = prevM + delta;
      if (nextM < 0) {
        setYear((prevY) => prevY - 1);
        return 11;
      }
      if (nextM > 11) {
        setYear((prevY) => prevY + 1);
        return 0;
      }
      return nextM;
    });
    setSelectedDay(null);
  };

  const totalReviews = reviewData.reduce((s, d) => s + d.count, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => changeMonth(-1)}
          style={styles.navBtn}
          hitSlop={theme.hitSlop}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.monthText}>
            {MONTHS[month]} {year}
          </Text>
          <Text style={styles.reviewCount}>
            {totalReviews} review{totalReviews !== 1 ? 's' : ''} scheduled
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => changeMonth(1)}
          style={styles.navBtn}
          hitSlop={theme.hitSlop}
        >
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Day of week headers */}
      <View style={styles.weekRow}>
        {DAYS_OF_WEEK.map((d, i) => (
          <Text key={i} style={styles.dayHeader}>
            {d}
          </Text>
        ))}
      </View>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <View key={`${year}-${month}-w${wi}`} style={styles.weekRow}>
          {week.map((day, di) => {
            if (day === null) return <View key={`empty-${di}`} style={styles.dayCell} />;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const review = reviewMap.get(dateStr);
            const isToday = dateStr === todayStr;
            const isSelected = selectedDay?.date === dateStr;
            const isPast = dateStr < todayStr;

            return (
              <TouchableOpacity
                key={dateStr}
                style={[
                  styles.dayCell,
                  isToday && styles.todayCell,
                  isSelected && styles.selectedCell,
                ]}
                onPress={() => review && setSelectedDay(isSelected ? null : review)}
                activeOpacity={review ? 0.6 : 1}
                accessibilityRole={review ? 'button' : undefined}
                accessibilityLabel={
                  review
                    ? `${day} ${MONTHS[month]}, ${review.count} review${review.count === 1 ? '' : 's'} scheduled`
                    : `${day} ${MONTHS[month]}, no reviews scheduled`
                }
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dayText,
                    isToday && styles.todayText,
                    isSelected && styles.selectedText,
                    isPast && !isToday && styles.pastText,
                  ]}
                >
                  {day}
                </Text>
                {review && (
                  <View style={styles.dotsRow}>
                    {review.count <= 3 ? (
                      Array.from({ length: review.count }).map((_, i) => (
                        <View
                          key={i}
                          style={[styles.dot, isPast && { backgroundColor: theme.colors.error }]}
                        />
                      ))
                    ) : (
                      <>
                        <View
                          style={[styles.dot, isPast && { backgroundColor: theme.colors.error }]}
                        />
                        <Text style={[styles.dotCount, isPast && { color: theme.colors.error }]}>
                          {review.count}
                        </Text>
                      </>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Selected day detail */}
      {selectedDay && (
        <View style={styles.detailSection}>
          <Text style={styles.detailTitle}>
            {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
            })}
            {' · '}
            {selectedDay.count} topic{selectedDay.count !== 1 ? 's' : ''}
          </Text>
          <ScrollView style={styles.detailScroll}>
            {selectedDay.topics.map((t, i) => (
              <View key={i} style={styles.topicRow}>
                <View
                  style={[
                    styles.confDot,
                    {
                      backgroundColor:
                        t.confidence >= 3
                          ? theme.colors.success
                          : t.confidence >= 2
                            ? theme.colors.warning
                            : theme.colors.error,
                    },
                  ]}
                />
                <Text style={styles.topicName}>{t.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: { padding: 8 },
  headerCenter: { alignItems: 'center' },
  monthText: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  reviewCount: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  weekRow: { flexDirection: 'row' },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    paddingVertical: 6,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    minHeight: 40,
    overflow: 'hidden',
  },
  todayCell: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderRadius: 10,
  },
  selectedCell: {
    backgroundColor: theme.colors.primaryTintMedium,
    borderRadius: 10,
  },
  dayText: { color: theme.colors.textSecondary, fontSize: 12, textAlign: 'center' },
  todayText: { color: theme.colors.primary, fontWeight: '800' },
  selectedText: { color: theme.colors.textPrimary, fontWeight: '800' },
  pastText: { color: theme.colors.textMuted },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.primary,
  },
  dotCount: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 1,
  },
  detailSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
    maxHeight: 160,
  },
  detailTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  detailScroll: { flex: 1 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  confDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  topicName: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
});
