import { getAllTopicsWithProgress, getAllSubjects, getTopicsDueForReview } from '../db/queries/topics';
import { getUserProfile, getDaysToExam } from '../db/queries/progress';
import { getPreferredStudyHours } from '../db/queries/sessions';
import { useAppStore } from '../store/useAppStore';
import type { TopicWithProgress } from '../types';

export type PlanActionType = 'study' | 'review' | 'deep_dive';

export interface PlanItem {
  id: string; // Unique ID for keying
  topic: TopicWithProgress;
  type: PlanActionType;
  duration: number;
}

export interface DailyPlan {
  date: string;
  dayLabel: string;
  items: PlanItem[];
  totalMinutes: number;
  isRestDay: boolean;
}

export interface StudyPlanSummary {
  totalTopicsLeft: number;
  totalHoursLeft: number;
  daysRemaining: number;
  requiredHoursPerDay: number;
  feasible: boolean;
  message: string;
}

export interface TodayTask {
  timeLabel: string;
  topic: TopicWithProgress;
  type: PlanActionType;
  duration: number;
}

export function getTodaysAgendaWithTimes(): TodayTask[] {
  const { plan } = generateStudyPlan();
  const todayPlan = plan[0];
  if (!todayPlan || todayPlan.items.length === 0) return [];

  // Get user-stated availability from store
  const availability = useAppStore.getState().dailyAvailability;
  
  // 1. Filter items based on availability/capacity
  let items = todayPlan.items;
  
  if (availability !== null) {
    // "Just Checking" -> Show nothing or maybe just 1 quick win
    if (availability === 0) return [];

    // Filter logic
    items = items.filter(item => {
      // If short on time (< 45m), skip Deep Dives
      if (availability < 45 && item.type === 'deep_dive') return false;
      // If very short on time (< 20m), skip New Topics, keep only Reviews
      if (availability < 20 && item.type !== 'review') return false;
      return true;
    });

    // Truncate list to fit availability
    let total = 0;
    const fittingItems: PlanItem[] = [];
    for (const item of items) {
      if (total + item.duration <= availability) {
        fittingItems.push(item);
        total += item.duration;
      }
    }
    items = fittingItems;
  }

  const preferredHours = getPreferredStudyHours();
  const now = new Date();
  const currentHour = now.getHours();
  
  // Filter out hours that have already passed, unless we have no future slots
  let availableHours = preferredHours.filter(h => h >= currentHour);
  if (availableHours.length === 0) {
    // If all preferred times passed, just suggest next hour onwards
    availableHours = [currentHour + 1, currentHour + 2, currentHour + 3];
  }

  const schedule: TodayTask[] = [];
  let hourIndex = 0;
  let currentSlotMinutes = 0;
  
  // Group items into hour blocks
  for (const item of items) {
    const hour = availableHours[hourIndex] ?? (availableHours[availableHours.length-1] + 1 + (hourIndex - availableHours.length));
    
    // Format label: "09:00 - 09:30"
    const startMin = currentSlotMinutes;
    const endMin = startMin + item.duration;
    
    // Simple 24h to AM/PM converter or just HH:MM
    const h = hour % 24;
    const startStr = `${h.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
    const endStr = `${h.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
    
    schedule.push({
      timeLabel: `${startStr} - ${endStr}`,
      topic: item.topic,
      type: item.type,
      duration: item.duration
    });

    currentSlotMinutes += item.duration;
    // If slot > 50 mins, move to next hour
    if (currentSlotMinutes >= 50) {
      hourIndex++;
      currentSlotMinutes = 0;
    }
  }

  return schedule;
}

export function generateStudyPlan(): { plan: DailyPlan[]; summary: StudyPlanSummary } {
  const profile = getUserProfile();
  const allTopics = getAllTopicsWithProgress();
  const subjects = getAllSubjects();
  const subjectWeights = new Map(subjects.map(s => [s.id, s.inicetWeight]));

  // 1. Initial State
  const today = new Date();
  const daysToExam = getDaysToExam(profile.inicetDate);
  const dailyGoal = profile.dailyGoalMinutes > 0 ? profile.dailyGoalMinutes : 120;
  
  // Pending actions queue
  const pendingActions: PlanItem[] = [];

  // 2. Identify Tasks
  
  // A. Overdue Reviews (Priority 1)
  const due = getTopicsDueForReview(1000); // Get all due
  for (const t of due) {
    pendingActions.push({
      id: `rev_${t.id}_init`,
      topic: t,
      type: 'review',
      duration: 15 // Standard review time
    });
  }

  // B. Weak Topics (Priority 2 - Deep Dive)
  // Confidence < 3 AND seen at least once
  const weak = allTopics.filter(t => t.progress.status !== 'unseen' && t.progress.confidence < 3);
  for (const t of weak) {
    // Only add if not already in due list (avoid double booking, prioritize full re-study)
    if (!due.find(d => d.id === t.id)) {
      pendingActions.push({
        id: `dive_${t.id}_init`,
        topic: t,
        type: 'deep_dive',
        duration: t.estimatedMinutes // Full duration for re-study
      });
    }
  }

  // C. New Topics (Priority 3)
  const newTopics = allTopics.filter(t => t.progress.status === 'unseen');
  // Sort new topics by weight
  newTopics.sort((a, b) => {
    const scoreA = (subjectWeights.get(a.subjectId) ?? 5) * 1.5 + a.inicetPriority;
    const scoreB = (subjectWeights.get(b.subjectId) ?? 5) * 1.5 + b.inicetPriority;
    return scoreB - scoreA;
  });

  for (const t of newTopics) {
    pendingActions.push({
      id: `new_${t.id}_init`,
      topic: t,
      type: 'study',
      duration: t.estimatedMinutes
    });
  }

  // Sort Pending Queue: Reviews > Deep Dives > High Yield New
  // We'll just keep them in order of insertion roughly, but let's do a strict sort for the simulation
  // actually, let's keep separate queues for the simulation to interleave
  
  const queueReviews = pendingActions.filter(p => p.type === 'review');
  const queueDeep = pendingActions.filter(p => p.type === 'deep_dive');
  const queueNew = pendingActions.filter(p => p.type === 'study');

  // Simulation State
  const plan: DailyPlan[] = [];
  const futureReviews: Map<number, PlanItem[]> = new Map(); // DayOffset -> Items

  const daysToPlan = Math.min(daysToExam, 60);
  let totalMinutesScheduled = 0;

  for (let i = 0; i < daysToPlan; i++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + i);
    const dateStr = currentDate.toISOString().slice(0, 10);
    
    let label = dateStr;
    if (i === 0) label = "Today";
    else if (i === 1) label = "Tomorrow";
    else label = currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const dayItems: PlanItem[] = [];
    let dayMinutes = 0;

    // 1. Must-do: Future Scheduled Reviews (SRS simulation)
    const scheduledToday = futureReviews.get(i) || [];
    for (const item of scheduledToday) {
      if (dayMinutes + item.duration <= dailyGoal * 1.2) { // Allow slight overflow for reviews
        dayItems.push(item);
        dayMinutes += item.duration;
      } else {
        // Push to tomorrow if absolutely full
        const tomorrow = i + 1;
        const list = futureReviews.get(tomorrow) || [];
        list.unshift(item);
        futureReviews.set(tomorrow, list);
      }
    }

    // 2. Backlog Reviews
    while (queueReviews.length > 0 && dayMinutes < dailyGoal) {
      const item = queueReviews.shift()!;
      dayItems.push(item);
      dayMinutes += item.duration;
    }

    // 3. Deep Dives (Limit 1 per day to avoid burnout, unless day is empty)
    let divesToday = 0;
    while (queueDeep.length > 0 && dayMinutes < dailyGoal) {
      if (divesToday >= 1 && dayMinutes > dailyGoal * 0.6) break; // Balance
      const item = queueDeep.shift()!;
      dayItems.push(item);
      dayMinutes += item.duration;
      divesToday++;
      
      // Schedule follow-up review
      const revDay = i + 2;
      const list = futureReviews.get(revDay) || [];
      list.push({
        id: `rev_${item.topic.id}_post_dive`,
        topic: item.topic,
        type: 'review',
        duration: 15
      });
      futureReviews.set(revDay, list);
    }

    // 4. New Study
    while (queueNew.length > 0 && dayMinutes < dailyGoal) {
      const item = queueNew.shift()!;
      dayItems.push(item);
      dayMinutes += item.duration;

      // Schedule SRS reviews
      // Day + 1
      const r1 = i + 1;
      const l1 = futureReviews.get(r1) || [];
      l1.push({ id: `rev_${item.topic.id}_1`, topic: item.topic, type: 'review', duration: 15 });
      futureReviews.set(r1, l1);

      // Day + 4
      const r2 = i + 4;
      const l2 = futureReviews.get(r2) || [];
      l2.push({ id: `rev_${item.topic.id}_2`, topic: item.topic, type: 'review', duration: 15 });
      futureReviews.set(r2, l2);
    }

    plan.push({
      date: dateStr,
      dayLabel: label,
      items: dayItems,
      totalMinutes: dayMinutes,
      isRestDay: dayMinutes === 0
    });
    
    totalMinutesScheduled += dayMinutes;

    // Break early if queues empty (and no future reviews pending for near future)
    if (queueReviews.length === 0 && queueDeep.length === 0 && queueNew.length === 0 && futureReviews.size === 0) {
      // Continue loop only to flush future reviews? No, effectively done.
      // But we might have reviews scheduled for day 60 when we are at day 5.
      // Let's just run the loop to fill the calendar.
    }
  }

  // Summary Logic
  const totalTopics = allTopics.length;
  const coveredTopics = allTopics.filter(t => t.progress.status === 'mastered' || t.progress.status === 'reviewed').length; // Rough calc
  const left = queueNew.length + queueDeep.length; // Remaining backlog
  
  // Total workload estimation includes the backlog + simulated reviews
  // Simpler: total scheduled / days
  const filledDays = plan.filter(d => d.totalMinutes > 0).length;
  const avgMins = filledDays > 0 ? Math.round(totalMinutesScheduled / filledDays) : 0;
  
  const isFeasible = queueNew.length === 0; // If we emptied the new queue, it's feasible in the timeframe
  
  let message = "On track.";
  if (queueNew.length > 0) message = `Tight! ${queueNew.length} topics didn't fit. Increase daily goal.`;
  else if (avgMins > dailyGoal) message = `Heavy load! Avg ${Math.round(avgMins/60)}h/day required.`;
  else message = "Plan looks solid. Stick to it!";

  return {
    plan,
    summary: {
      totalTopicsLeft: left,
      totalHoursLeft: Math.round(totalMinutesScheduled / 60),
      daysRemaining: daysToExam,
      requiredHoursPerDay: Number((avgMins / 60).toFixed(1)),
      feasible: isFeasible,
      message
    }
  };
}
