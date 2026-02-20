const fs = require('fs');
const { SUBJECTS_SEED, TOPICS_SEED } = require('../src/constants/syllabus');
const { VAULT_TOPICS_SEED } = require('../src/constants/vaultTopics');

const backup = {
  version: 1,
  exportedAt: new Date().toISOString(),
  user_profile: { id: 1, display_name: 'Doctor', total_xp: 0, current_level: 1, streak_current: 0, streak_best: 0, daily_goal_minutes: 120, preferred_session_length: 45 },
  topic_progress: [],
  daily_log: [],
  lecture_notes: []
};

const allTopics = [...TOPICS_SEED, ...VAULT_TOPICS_SEED];
allTopics.forEach((t, index) => {
  backup.topic_progress.push({
    topic_id: index + 1,
    status: 'unseen',
    confidence: 0,
    last_studied_at: null,
    times_studied: 0,
    xp_earned: 0,
    next_review_date: null,
    user_notes: ''
  });
});

fs.writeFileSync('guru_seed.json', JSON.stringify(backup, null, 2));
console.log('Generated guru_seed.json with ' + backup.topic_progress.length + ' topics');
