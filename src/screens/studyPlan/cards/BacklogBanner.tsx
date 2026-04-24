import React from 'react';
import { View } from 'react-native';

import { type StudyPlanSummary } from '../../../services/studyPlanner';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';

export default /** Red/amber banner when the review backlog is large enough to gate new topics. */
function BacklogBanner({ summary }: { summary: StudyPlanSummary }) {
  if (summary.overdueBacklogDays < 2) return null;
  const severe = summary.overdueBacklogDays > 4;
  return (
    <View
      style={{
        backgroundColor: severe ? 'rgba(224,82,82,0.15)' : 'rgba(240,180,50,0.15)',
        borderRadius: n.radius.sm,
        padding: n.spacing.md,
        marginBottom: n.spacing.md,
      }}
    >
      <LinearText
        style={[
          { fontSize: 13, fontWeight: '700' },
          { color: severe ? n.colors.error : n.colors.warning },
        ]}
      >
        {summary.overdueBacklogDays}d overdue reviews
        {severe ? ' — new topics throttled' : ' — clear before new topics'}
      </LinearText>
    </View>
  );
}
