const fs = require('fs');

let code = fs.readFileSync('../src/screens/HomeScreen.tsx', 'utf-8');

const imports = `import { connectToRoom, sendSyncMessage } from '../services/deviceSyncService';\n`;
if (!code.includes('deviceSyncService')) {
  code = code.replace("import type { TopicWithProgress } from '../types';", imports + "import type { TopicWithProgress } from '../types';");

  const syncEffect = `
  useEffect(() => {
    if (profile?.syncCode) {
      const unsubscribe = connectToRoom(profile.syncCode, (msg) => {
        if (msg.type === 'LECTURE_STARTED') {
          // The other device started a lecture. The phone is now a hostage.
          Alert.alert('Lecture Detected', 'Your tablet just started a lecture. Your phone is now entering Hostage Mode.', [
            { text: 'Okay', onPress: () => navigation.navigate('LectureMode', { subjectId: msg.subjectId }) }
          ]);
          navigation.navigate('LectureMode', { subjectId: msg.subjectId });
        }
      });
      return unsubscribe;
    }
  }, [profile?.syncCode]);
`;

  code = code.replace("function handleStartSession() {", syncEffect + "\n  function handleStartSession() {");
  
  fs.writeFileSync('../src/screens/HomeScreen.tsx', code);
  console.log('Patched HomeScreen with DeviceSyncService Listener');
}
