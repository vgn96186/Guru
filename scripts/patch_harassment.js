const fs = require('fs');
let code = fs.readFileSync('../src/services/notificationService.ts', 'utf-8');

const harassmentFunc = `
export async function scheduleHarassment(): Promise<void> {
  if (!areNotificationsSupported) return;
  try {
    await cancelAllNotifications(); // Clear existing to prevent duplicates
    
    const messages = [
      "Open the app. Now.",
      "You're doomscrolling again, aren't you?",
      "Every minute you scroll, your competition is studying Pathology.",
      "I will literally keep buzzing until you open this app.",
      "Just 1 flashcard. Stop ignoring me.",
      "INICET does not care about your Instagram feed.",
      "This is your last warning. Open the app.",
      "Still scrolling? Pathetic.",
      "Do you want to be a doctor or a professional scroller?",
      "5 minutes. That's all I'm asking for. Open me."
    ];

    // Schedule 10 notifications, starting 5 minutes from now, spaced 3 minutes apart
    for (let i = 0; i < messages.length; i++) {
      const triggerTime = new Date(Date.now() + (i * 3 + 1) * 60000); // 1m, 4m, 7m, 10m...
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 DOOMSCROLL DETECTED',
          body: messages[i],
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 500, 200, 500],
        },
        trigger: triggerTime, // Direct Date trigger
      });
    }
  } catch (error) {
    console.warn('Failed to schedule harassment:', error);
  }
}
`;

code = code.replace("export async function cancelAllNotifications", harassmentFunc + "\nexport async function cancelAllNotifications");
fs.writeFileSync('../src/services/notificationService.ts', code);
console.log('Added Harassment Mode to notificationService');
