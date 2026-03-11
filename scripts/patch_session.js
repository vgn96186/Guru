const fs = require('fs');

let code = fs.readFileSync('../src/screens/SessionScreen.tsx', 'utf-8');

// The route params type definition:
// const { mood, mode: forcedMode } = route.params as { mood: Mood; mode?: SessionMode };
code = code.replace(
  "const { mood, mode: forcedMode } = route.params as { mood: Mood; mode?: SessionMode };",
  "const { mood, mode: forcedMode, forcedMinutes } = route.params as { mood: Mood; mode?: SessionMode; forcedMinutes?: number };"
);

// The length logic:
// const sessionLength = forcedMode === 'sprint' ? 10 : (dailyAvailability && dailyAvailability > 0 ? dailyAvailability : (profile.preferredSessionLength ?? 45));
code = code.replace(
  "const sessionLength = forcedMode === 'sprint' ? 10\n        : (dailyAvailability && dailyAvailability > 0 ? dailyAvailability : (profile.preferredSessionLength ?? 45));",
  "const sessionLength = forcedMinutes ? forcedMinutes : (forcedMode === 'sprint' ? 10\n        : (dailyAvailability && dailyAvailability > 0 ? dailyAvailability : (profile.preferredSessionLength ?? 45)));"
);

fs.writeFileSync('../src/screens/SessionScreen.tsx', code);
console.log('Patched SessionScreen.tsx to accept forcedMinutes');
