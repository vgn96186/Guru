import React from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { linearTheme } from '../../../../../theme/linearTheme';
import GlassSurface from '../../../../../components/primitives/GlassSurface';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';

interface Props {
  visible: boolean;
  onClose: () => void;
  pasteUrl: string;
  setPasteUrl: (url: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function GitlabPasteModal({
  visible,
  onClose,
  pasteUrl,
  setPasteUrl,
  onSubmit,
  submitting,
  styles,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dropdownBackdrop} onPress={onClose}>
        <Pressable style={{ width: '90%', maxWidth: 400 }}>
          <GlassSurface elevation="high" intensity={80} style={{ padding: 24, borderRadius: 24 }}>
            <Text
              style={{
                color: linearTheme.colors.textPrimary,
                fontSize: 18,
                fontWeight: '700',
                marginBottom: 16,
              }}
            >
              Paste GitLab Redirect URL
            </Text>
            <Text style={{ color: linearTheme.colors.textMuted, fontSize: 14, marginBottom: 20 }}>
              After logging in to GitLab and authorizing Guru, you were redirected to a page that
              said "Site can't be reached". Copy the FULL URL from your browser's address bar and
              paste it here to complete the connection.
            </Text>

            <LinearTextInput
              style={{
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(0,0,0,0.3)',
                padding: 14,
                borderRadius: 12,
                color: '#fff',
                fontSize: 14,
                marginBottom: 24,
              }}
              placeholder="guru://gitlab-oauth?code=..."
              placeholderTextColor={linearTheme.colors.textMuted}
              value={pasteUrl}
              onChangeText={setPasteUrl}
              autoCapitalize="none"
              autoCorrect={false}
              selectTextOnFocus
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity
                style={{ paddingHorizontal: 16, paddingVertical: 12 }}
                onPress={onClose}
              >
                <Text style={{ color: linearTheme.colors.textMuted, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: linearTheme.colors.accent,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 12,
                  opacity: pasteUrl.trim() ? 1 : 0.5,
                  minWidth: 100,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={onSubmit}
                disabled={!pasteUrl.trim() || submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
