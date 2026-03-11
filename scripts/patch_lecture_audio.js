const fs = require('fs');

let code = fs.readFileSync('../src/screens/LectureModeScreen.tsx', 'utf-8');

const imports = `
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { transcribeAndSummarizeAudio } from '../services/aiService';
`;

// Insert the new imports near the top
code = code.replace("import * as Haptics from 'expo-haptics';", "import * as Haptics from 'expo-haptics';\n" + imports);

const stateVars = `
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
`;

code = code.replace("const [proofOfLifeCountdown, setProofOfLifeCountdown] = useState(0);", "const [proofOfLifeCountdown, setProofOfLifeCountdown] = useState(0);\n" + stateVars);

const audioFunctions = `
  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone Access', 'Need microphone to auto-transcribe lectures.');
      } else {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    })();
  }, []);

  async function startRecording() {
    try {
      if (recording) await recording.stopAndUnloadAsync();
      
      const { recording: newRec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRec);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function processRecording() {
    if (!recording || !profile?.openrouterApiKey) return;
    setIsTranscribing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        // Transcribe
        const text = await transcribeAndSummarizeAudio(base64, profile.openrouterApiKey);
        if (text && text !== 'NO_CONTENT' && !text.includes('NO_CONTENT')) {
          saveLectureNote(selectedSubjectId, text.trim());
          setNotes(n => [...n, text.trim()]);
          
          // Reset Proof of Life because the AI proved the lecture is happening
          setProofOfLifeActive(false);
        }
        
        // Delete temp file
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (err) {
      console.error('Transcription failed:', err);
    } finally {
      setIsTranscribing(false);
      // Restart recording immediately if still enabled
      if (isRecordingEnabled && !onBreak && elapsed > 0) {
        startRecording();
      }
    }
  }

  // Effect to handle the 3-minute recording loop
  useEffect(() => {
    if (isRecordingEnabled && !onBreak) {
      if (!recording && !isTranscribing) {
        startRecording();
      }
      
      // Every 3 minutes (180 seconds), process the chunk
      const interval = setInterval(() => {
        if (recording) {
          processRecording();
        }
      }, 180 * 1000);
      
      return () => clearInterval(interval);
    } else if (!isRecordingEnabled || onBreak) {
      if (recording) {
        recording.stopAndUnloadAsync().then(() => setRecording(null)).catch(() => {});
      }
    }
  }, [isRecordingEnabled, onBreak, recording, isTranscribing]);

  function toggleAutoScribe() {
    if (!isRecordingEnabled && !profile?.openrouterApiKey) {
      Alert.alert('API Key Required', 'You need an AI API key to transcribe lectures.');
      return;
    }
    setIsRecordingEnabled(!isRecordingEnabled);
  }
`;

// Insert the audio functions before stopLecture
code = code.replace("function stopLecture() {", audioFunctions + "\n  function stopLecture() {");

// Clean up recording on unmount or stop
code = code.replace(
  "if (timerRef.current) clearInterval(timerRef.current);",
  "if (timerRef.current) clearInterval(timerRef.current);\n    if (recording) recording.stopAndUnloadAsync().catch(() => {});\n    setIsRecordingEnabled(false);"
);

// Add toggle button to UI
const toggleButtonHtml = `
        <TouchableOpacity 
          style={[styles.transcribeBtn, isRecordingEnabled && styles.transcribeBtnActive]}
          onPress={toggleAutoScribe}
          activeOpacity={0.8}
        >
          <Text style={styles.transcribeBtnText}>
            {isRecordingEnabled ? '🎙️ AUTO-SCRIBE ACTIVE (Listening...)' : '🎙️ Enable Auto-Scribe'}
          </Text>
          {isTranscribing && <Text style={{color:'#fff', fontSize: 10}}>Processing...</Text>}
        </TouchableOpacity>
`;

code = code.replace(
  "{/* Note input */}",
  "{/* Note input */}\n" + toggleButtonHtml
);

// Add styles
const stylesAddition = `
  transcribeBtn: { backgroundColor: '#1A1A24', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#6C63FF', marginBottom: 12, alignItems: 'center' },
  transcribeBtnActive: { backgroundColor: '#2A1A1A', borderColor: '#F44336' },
  transcribeBtnText: { color: '#6C63FF', fontWeight: '800', fontSize: 14 },
`;
code = code.replace("noteSection: {", stylesAddition + "\n  noteSection: {");

fs.writeFileSync('../src/screens/LectureModeScreen.tsx', code);
console.log('Added Audio Transcription logic');
