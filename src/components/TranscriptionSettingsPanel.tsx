/**
 * TranscriptionSettingsPanel
 *
 * Collapsible inline panel for configuring transcription providers.
 * Used by Transcript Vault and Recording Vault screens.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../theme/linearTheme';
import LinearChipButton from './primitives/LinearChipButton';
import LinearIconButton from './primitives/LinearIconButton';
import { DEFAULT_HF_TRANSCRIPTION_MODEL } from '../config/appConfig';
import { profileRepository } from '../db/repositories';
import { updateUserProfile } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';
import type { UserProfile } from '../types';
import {
  testGroqConnection,
  testHuggingFaceConnection,
  testDeepgramConnection,
} from '../services/ai/providerHealth';

type TranscriptionProvider = 'auto' | 'groq' | 'huggingface' | 'cloudflare' | 'deepgram' | 'local';
type TestResult = 'ok' | 'fail' | null;

interface TranscriptionSettingsPanelProps {
  embedded?: boolean;
}

export default function TranscriptionSettingsPanel({
  embedded = false,
}: TranscriptionSettingsPanelProps) {
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const [expanded, setExpanded] = useState(embedded);
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
      setDeepgramKey(p.deepgramApiKey ?? '');
      setGroqKey(p.groqApiKey ?? '');
    });
  }, []);

  const autoSave = useCallback(
    (updates: Partial<UserProfile>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await updateUserProfile(updates);
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
      const r = await testHuggingFaceConnection(
        token,
        hfModel.trim() || DEFAULT_HF_TRANSCRIPTION_MODEL,
      );
      setHfResult(r.ok ? 'ok' : 'fail');
    } catch {
      setHfResult('fail');
    } finally {
      setTestingHf(false);
    }
  };

  const testDg = async () => {
    const key = deepgramKey.trim();
    if (!key) return;
    setTestingDg(true);
    try {
      const r = await testDeepgramConnection(key);
      setDgResult(r.ok ? 'ok' : 'fail');
    } catch {
      setDgResult('fail');
    } finally {
      setTestingDg(false);
    }
  };

  const testGroq = async () => {
    const key = groqKey.trim();
    if (!key) return;
    setTestingGroq(true);
    try {
      const r = await testGroqConnection(key);
      setGroqResult(r.ok ? 'ok' : 'fail');
    } catch {
      setGroqResult('fail');
    } finally {
      setTestingGroq(false);
    }
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
    <View style={[s.wrapper, embedded && s.wrapperEmbedded]}>
      {!embedded ? (
        <TouchableOpacity style={s.toggleRow} onPress={toggleExpanded} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={16} color={n.colors.textMuted} />
          <Text style={s.toggleText}>Transcription Settings</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={n.colors.textMuted}
          />
        </TouchableOpacity>
      ) : null}

      <Animated.View
        style={[
          s.body,
          embedded && s.bodyEmbedded,
          {
            maxHeight: embedded
              ? undefined
              : heightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 600] }),
            opacity: embedded ? 1 : heightAnim,
          },
        ]}
      >
        {/* Provider selector */}
        <Text style={s.label}>Provider</Text>
        <View style={s.providerRow}>
          {PROVIDERS.map(([val, label]) => (
            <LinearChipButton
              key={val}
              label={label}
              style={s.providerBtn}
              selected={provider === val}
              selectedStyle={s.providerBtnActive}
              textStyle={s.providerText}
              selectedTextStyle={s.providerTextActive}
              onPress={() => handleProviderChange(val)}
            />
          ))}
        </View>
        <Text style={s.hint}>Auto: Groq → CF → HF → DG → Local</Text>

        {/* Groq */}
        <Text style={s.label}>Groq API Key</Text>
        <View style={s.keyRow}>
          <TextInput
            style={s.input}
            placeholder="gsk_..."
            placeholderTextColor={n.colors.textMuted}
            value={groqKey}
            onChangeText={(v) => {
              setGroqKey(v);
              setGroqResult(null);
              autoSave({ groqApiKey: v.trim() });
            }}
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
            placeholderTextColor={n.colors.textMuted}
            value={hfToken}
            onChangeText={(v) => {
              setHfToken(v);
              setHfResult(null);
              autoSave({ huggingFaceToken: v.trim() });
            }}
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
          placeholderTextColor={n.colors.textMuted}
          value={hfModel}
          onChangeText={(v) => {
            setHfModel(v);
            autoSave({ huggingFaceTranscriptionModel: v.trim() });
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Deepgram */}
        <Text style={s.label}>Deepgram</Text>
        <View style={s.keyRow}>
          <TextInput
            style={s.input}
            placeholder="dg_..."
            placeholderTextColor={n.colors.textMuted}
            value={deepgramKey}
            onChangeText={(v) => {
              setDeepgramKey(v);
              setDgResult(null);
              autoSave({ deepgramApiKey: v.trim() });
            }}
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
    <LinearIconButton
      variant="glass"
      loading={testing}
      spinnerColor={n.colors.accent}
      style={[s.testBtn, result === 'ok' && s.testBtnOk, result === 'fail' && s.testBtnFail]}
      onPress={onPress}
      disabled={testing}
    >
      {!testing ? (
        <Ionicons
          name={
            result === 'ok'
              ? 'checkmark-circle'
              : result === 'fail'
              ? 'close-circle'
              : 'flash-outline'
          }
          size={18}
          color={
            result === 'ok'
              ? n.colors.success
              : result === 'fail'
              ? n.colors.error
              : n.colors.accent
          }
        />
      ) : null}
    </LinearIconButton>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.border,
    overflow: 'hidden',
  },
  wrapperEmbedded: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'visible',
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
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  bodyEmbedded: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    overflow: 'visible',
  },
  label: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 4,
  },
  hint: {
    color: n.colors.textMuted,
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
    backgroundColor: n.colors.card,
  },
  providerBtnActive: {
    backgroundColor: n.colors.accent + '22',
  },
  providerText: { color: n.colors.textMuted, fontSize: 12, fontWeight: '600' },
  providerTextActive: { color: n.colors.accent, fontWeight: '700' },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: n.colors.card,
    borderRadius: n.radius.sm,
    borderWidth: 1,
    borderColor: n.colors.border,
    color: n.colors.textPrimary,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  testBtn: {
    backgroundColor: n.colors.card,
  },
  testBtnOk: {
    borderColor: n.colors.success + '66',
    backgroundColor: n.colors.success + '15',
  },
  testBtnFail: {
    borderColor: n.colors.error + '66',
    backgroundColor: n.colors.error + '15',
  },
});
