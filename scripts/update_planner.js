const fs = require('fs');
let code = fs.readFileSync('../src/services/sessionPlanner.ts', 'utf-8');

const replacement = `function scoreTopicForSession(topic: TopicWithProgress, mood: Mood): number {
  let score = 0;

  // Base: INICET priority (1-10 scale)
  score += topic.inicetPriority * 1.5;

  // FSRS Scoring
  if (topic.progress.status === 'unseen') {
    score += 15; // Highest priority for new cards
  } else if (topic.progress.fsrsDue) {
    const dueTime = new Date(topic.progress.fsrsDue).getTime();
    const nowTime = Date.now();
    
    if (nowTime > dueTime) {
      // Overdue cards get a massive boost based on how overdue they are, capped
      const daysOverdue = (nowTime - dueTime) / 86400000;
      score += 10 + Math.min(daysOverdue * 2, 10);
    } else {
      // Not due yet, penalty
      const daysUntilDue = (dueTime - nowTime) / 86400000;
      score -= (daysUntilDue * 5);
    }
  }

  // Recency penalty: avoid immediate repetition (within 24 hours unless due)
  if (topic.progress.lastStudiedAt) {
    const hoursSince = (Date.now() - topic.progress.lastStudiedAt) / 3600000;
    if (hoursSince < 12) score -= 20;
  }

  // Mood adjustments
  if (mood === 'tired' || mood === 'stressed') {
    if (topic.progress.status === 'unseen') score -= 10;
    if (topic.progress.status === 'mastered') score += 5; // easy win
  }
  if (mood === 'energetic') {
    if (topic.progress.status === 'unseen') score += 5;
    if (topic.inicetPriority >= 8) score += 5;
  }

  return score;
}`;

// I will just replace the old scoreTopicForSession function
code = code.replace(/function scoreTopicForSession[\s\S]*?return score;\n\}/, replacement);

fs.writeFileSync('../src/services/sessionPlanner.ts', code);
console.log('sessionPlanner.ts updated with FSRS scoring');
