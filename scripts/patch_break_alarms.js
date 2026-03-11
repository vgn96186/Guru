const fs = require('fs');
let code = fs.readFileSync('../src/services/notificationService.ts', 'utf-8');

const breakAlarms = `
export async function scheduleBreakEndAlarms(durationSeconds: number): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await cancelAllNotifications(); // Clear existing to prevent duplicates
    
    const messages = [
      "🚨 BREAK IS OVER. Return to the tablet now.",
      "Are you ignoring me? Close Instagram immediately.",
      "Every second you waste is a lower INICET score.",
      "I told you this would happen. Go back to studying.",
      "Your 5 minutes are up. Stop scrolling.",
      "Get up. Walk to the tablet. Press play.",
      "This is pathetic. Drop the phone.",
      "I will not stop buzzing. Resume the lecture.",
      "Resume the lecture on the tablet to silence me."
    ];

    const startTime = Date.now() + (durationSeconds * 1000);
    
    // Schedule aggressive notifications 15 seconds apart immediately after the break ends
    for (let i = 0; i < messages.length; i++) {
      const triggerTime = new Date(startTime + (i * 15 * 1000));
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 BREAK OVER',
          body: messages[i],
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 500, 200, 500, 200, 1000],
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerTime },
      });
    }
  } catch (error) {
    console.warn('Failed to schedule break alarms:', error);
  }
}
`;

code = code.replace("export async function cancelAllNotifications", breakAlarms + "\nexport async function cancelAllNotifications");
fs.writeFileSync('../src/services/notificationService.ts', code);
console.log('Added Break Alarms to notificationService');
