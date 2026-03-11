const fs = require('fs');

let code = fs.readFileSync('../src/screens/LectureModeScreen.tsx', 'utf-8');

const imports = `import { connectToRoom, sendSyncMessage } from '../services/deviceSyncService';\n`;
if (!code.includes('deviceSyncService')) {
  code = code.replace("import BreakScreen from './BreakScreen';", imports + "import BreakScreen from './BreakScreen';");
  
  // Add state for Doomscroll Alert
  const stateVars = `
  const [partnerDoomscrolling, setPartnerDoomscrolling] = useState(false);
`;
  code = code.replace("const timerRef = useRef", stateVars + "const timerRef = useRef");

  // Sync effect
  const syncEffect = `
  useEffect(() => {
    if (profile?.syncCode) {
      const unsubscribe = connectToRoom(profile.syncCode, (msg) => {
        if (msg.type === 'DOOMSCROLL_DETECTED') {
          setPartnerDoomscrolling(true);
          Vibration.vibrate([0, 500, 200, 500, 200, 1000]);
          setTimeout(() => setPartnerDoomscrolling(false), 10000); // Hide after 10s
        }
      });
      
      // Tell phone we started
      if (selectedSubjectId) {
        sendSyncMessage({ type: 'LECTURE_STARTED', subjectId: selectedSubjectId });
      }

      return () => {
        sendSyncMessage({ type: 'LECTURE_STOPPED' });
        unsubscribe();
      };
    }
  }, [profile?.syncCode, selectedSubjectId]);
`;
  code = code.replace("useEffect(() => {\n    if (!profile) refreshProfile();", "useEffect(() => {\n    if (!profile) refreshProfile();" + syncEffect);

  // Doomscroll broadcast
  code = code.replace(
    "sendImmediateNag(\n          \"🚨 DOOMSCROLL DETECTED\",",
    "sendSyncMessage({ type: 'DOOMSCROLL_DETECTED' });\n        sendImmediateNag(\n          \"🚨 DOOMSCROLL DETECTED\","
  );

  // Overlay render
  const overlay = `
      {partnerDoomscrolling && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,0,0,0.9)', zIndex: 999, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 80, marginBottom: 20 }}>📱❌</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' }}>PUT YOUR PHONE DOWN.</Text>
          <Text style={{ color: '#fff', fontSize: 20, textAlign: 'center', marginTop: 20 }}>You are doomscrolling instead of watching this lecture!</Text>
        </View>
      )}
`;
  code = code.replace("<StatusBar barStyle=", overlay + "<StatusBar barStyle=");
  
  fs.writeFileSync('../src/screens/LectureModeScreen.tsx', code);
  console.log('Patched LectureModeScreen with DeviceSyncService');
}
