const fs = require('fs');

let nav = fs.readFileSync('../src/navigation/RootNavigator.tsx', 'utf-8');
if (!nav.includes('BreakEnforcerScreen')) {
  nav = nav.replace(
    "import DeviceLinkScreen from '../screens/DeviceLinkScreen';",
    "import DeviceLinkScreen from '../screens/DeviceLinkScreen';\nimport BreakEnforcerScreen from '../screens/BreakEnforcerScreen';"
  );
  nav = nav.replace(
    "</Stack.Navigator>",
    "  <Stack.Screen name=\"BreakEnforcer\" component={BreakEnforcerScreen} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />\n    </Stack.Navigator>"
  );
  fs.writeFileSync('../src/navigation/RootNavigator.tsx', nav);
}

let home = fs.readFileSync('../src/screens/HomeScreen.tsx', 'utf-8');
if (!home.includes("msg.type === 'BREAK_STARTED'")) {
  const breakNav = `
        if (msg.type === 'BREAK_STARTED') {
          navigation.navigate('BreakEnforcer', { durationSeconds: msg.durationSeconds });
        }
`;
  home = home.replace(
    "if (msg.type === 'LECTURE_STARTED') {",
    breakNav + "        if (msg.type === 'LECTURE_STARTED') {"
  );
  fs.writeFileSync('../src/screens/HomeScreen.tsx', home);
}

let lecture = fs.readFileSync('../src/screens/LectureModeScreen.tsx', 'utf-8');
if (!lecture.includes("type: 'BREAK_STARTED'")) {
  lecture = lecture.replace(
    "setOnBreak(true);\n    setBreakCountdown((profile?.breakDurationMinutes ?? 5) * 60);",
    "setOnBreak(true);\n    const breakSecs = (profile?.breakDurationMinutes ?? 5) * 60;\n    setBreakCountdown(breakSecs);\n    sendSyncMessage({ type: 'BREAK_STARTED', durationSeconds: breakSecs });"
  );
  lecture = lecture.replace(
    "setOnBreak(false);\n      // Main timer resumes automatically",
    "setOnBreak(false);\n      sendSyncMessage({ type: 'LECTURE_RESUMED' });\n      // Main timer resumes automatically"
  );
  fs.writeFileSync('../src/screens/LectureModeScreen.tsx', lecture);
}

console.log('Registered BreakEnforcerScreen and wired events');
