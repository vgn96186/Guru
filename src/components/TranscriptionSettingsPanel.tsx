/**
 * TranscriptionSettingsPanel
 *
 * Collapsible inline panel for configuring transcription providers.
 * Used by Transcript Vault and Recording Vault screens.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { DEFAULT_HF_TRANSCRIPTION_MODEL } from '../config/appConfig';
import { profileRepository } from '../db/repositories';
import { updateUserProfile } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';
import {
  testGroqConnection,
  testHuggingFaceConnection,
  testCloudflareConnection,
  testDeepgramConnection,
} from '../services/ai/providerHealth';

type TranscriptionProvider = 'auto' | 'groq' | 'huggingface' | 'cloudflare' | 'deepgram' | 'local';
type TestResult = 'ok' | 'fail' | null;

export default function TranscriptionSettingsPanel() {
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const [expanded, setExpanded] = useState(false);
  const heightAnim = useRef(new Animated.Value(0)).current;

  // Field state
  const [provider, setProvider] = useState<TranscriptionProvider>('auto');
  const [hfToken, setHfToken] = useState('');
  const [hfModel, setHfModel] = useState(DEFAULT_HF_TRANSCRIPTION_MODEL);
  const [deepgramKey, setDeepgramKey] = useState('');
  const [groqKey, setGroqKey] = useState('');

  // Test state
  const [testingHf, setTestingHf] = useState(false);
  const [hfResult, setHfResult] = useState<TestResult>(null);
  const [testingDg, setTestingDg] = useState(false);
  const [dgResult, setDgResult] = useState<TestResult>(null);
  const [testingGroq, setTestingGroq] = useState(false);
  const [groqResult, setGroqResult] = useState<TestResult>(null);

  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  // Load profile on mount
  useEffect(() => {
    void profileRepository.getProfile().then((p) => {
      setProvider(p.transcriptionProvider ?? 'auto');
      setHfToken(p.huggingFaceToken ?? '');
      setHfModel(p.huggingFaceTranscriptionModel ?? DEFAULT_HF_TRANSCRIPTION_MODEL);
      setDeepgramKey((p as any).deepgramApiKey ?? '');
      setGroqKey(p.groqApiKey ?? '');
    });
  }, []);

  const autoSave = useCallback(
    (updates: Record<string, unknown>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await updateUserProfile(updates as any);
        await refreshProfile();
      }, 600);
    },
    [refreshProfile],
  );

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.timing(heightAnim, {
      toValue: next ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  };

  const handleProviderChange = (p: TranscriptionProvider) => {
    setProvider(p);
    autoSave({ transcriptionProvider: p });
  };

  const testHf = async () => {
    const token = hfToken.trim();
    if (!token) return;
    setTestingHf(true);
    try {
      const r = await testHuggingFaceConnection(token, hfModel.trim() || DEFAULT_HF_TRANSCRIPTION_MODEL);
      setHfResult(r.ok ? 'ok' : 'fail');
    } catch { setHfResult('fail'); }
    finally { setTestingHf(false); }
  };

  const testDg = async () => {
    const key = deepgramKey.trim();
    if (!key) return;
    setTestingDg(true);
    try {
      const r = await testDeepgramConnection(key);
      setDgResult(r.ok ? 'ok' : 'fail');
    } catch { setDgResult('fail'); }
    finally { setTestingDg(false); }
  };

  const testGroq = async () => {
    const key = groqKey.trim();
    if (!key) return;
    setTestingGroq(true);
    try {
      const r = await testGroqConnection(key);
      setGroqResult(r.ok ? 'ok' : 'fail');
    } catch { setGroqResult('fail'); }
    finally { setTestingGroq(false); }
  };

  const PROVIDERS: [TranscriptionProvider, string][] = [
    ['auto', 'Auto'],
    ['groq', 'Groq'],
    ['huggingface', 'HF'],
    ['cloudflare', 'CF'],
    ['deepgram', 'DG'],
    ['local', 'Local'],
  ];

  return (
    <View style={s.wrapper}>
      <TouchableOpacity style={s.toggleRow} onPress={toggleExpanded} activeOpacity={0.7}>
        <Ionicons name="settings-outline" size={16} color={theme.colors.textMuted} />
        <Text style={s.toggleText}>Transcription Settings</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.colors.textMuted}
        />
      </TouchableOpacity>

      <Animated.View
        style={[
          s.body,
          {
            maxHeight: heightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 600] }),
            opacity: heightAnim,
          },
        ]}
      >
        {/* Provider selector */}
        <Text style={s.label}>Provider</Text>
        <View style={s.providerRow}>
          {PROVIDERS.map(([val, label]) => (
            <TouchableOpacity
              key={val}
              style={[s.providerBtn, provider === val && s.providerBtnActive]}
              onPress={() => handleProviderChange(val)}
            >
              <Text style={[s.providerText, provider === val && s.providerTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.hint}>Auto: Groq → CF → HF → DG → Local</Text>

        {/* Groq */}
        <Text style={s.label}>Groq API Key</Text>
        <View style={s.keyRow}>
          <TextInput
            style={s.input}
            placeholder="gsk_..."
            placeholderTextColor={theme.colors.textMuted}
            value={groqKey}
            onChangeText={(v) => { setGroqKey(v); setGroqResult(null); autoSave({ groqApiKey: v.trim() }); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TestButton testing={testingGroq} result={groqResult} onPress={testGroq} />
        </View>

        {/* HF */}
        <Text style={s.label}>Hugging Face Token</Text>
        <View style={s.keyRow}>
          <TextInput
            style={s.input}
            placeholder="hf_..."
            placeholderTextColor={theme.colors.textMuted}
            value={hfToken}
            onChangeText={(v) => { setHfToken(v); setHfResult(null); autoSave({ huggingFaceToken: v.trim() }); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TestButton testing={testingHf} result={hfResult} onPress={testHf} />
        </View>
        <Text style={s.label}>HF Model</Text>
        <TextInput
          style={[s.input, { marginBottom: 8 }]}
          placeholder={DEFAULT_HF_TRANSCRIPTION_MODEL}
          placeholderTextColor={theme.colors.textMuted}
          value={hfModel}
          onChangeText={(v) => { setHfModel(v); autoSave({ huggingFaceTranscriptionModel: v.trim() }); }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Deepgram */}
        <Text style={s.label}>Deepgram</Text>
        <View style={s.keyRow}>
          <TextInput
            style={s.input}
            placeholder="dg_..."
            placeholderTextColor={theme.colors.textMuted}
            value={deepgramKey}
            onChangeText={(v) => { setDeepgramKey(v); setDgResult(null); autoSave({ deepgramApiKey: v.trim() }); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TestButton testing={testingDg} result={dgResult} onPress={testDg} />
        </View>
        <Text style={s.hint}>Nova-2 Medical. Key at console.deepgram.com</Text>
      </Animated.View>
    </View>
  );
}

function TestButton({
  testing,
  result,
  onPress,
}: {
  testing: boolean;
  result: TestResult;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        s.testBtn,
        result === 'ok' && s.testBtnOk,
        result === 'fail' && s.testBtnFail,
      ]}
      onPress={onPress}
      disabled={testing}
    >
      {testing ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <Ionicons
          name={result === 'ok' ? 'checkmark-circle' : result === 'fail' ? 'close-circle' : 'flash-outline'}
          size={18}
          color={result === 'ok' ? theme.colors.success : result === 'fail' ? theme.colors.error : theme.colors.primary}
        />
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  toggleText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 4,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    marginBottom: 4,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  providerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  providerBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '22',
  },
  providerText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  providerTextActive: { color: theme.colors.primary, fontWeight: '700' },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  testBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtnOk: { borderColor: theme.colors.success + '66', backgroundColor: theme.colors.success + '15' },
  testBtnFail: { borderColor: theme.colors.error + '66', backgroundColor: theme.colors.error + '15' },
});
