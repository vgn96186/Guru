import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import type { OAuthSlot } from '../types';

interface Props {
  qwen: OAuthSlot;
  SubSectionToggle: any;
  styles: any;
}

export default function QwenOAuthSection({ qwen, SubSectionToggle, styles }: Props) {
  const { connecting, deviceCode, connected, connect, disconnect } = qwen;

  return (
    <SubSectionToggle id="qwen_oauth" title="QWEN (FREE OAUTH)">
      <Text style={styles.hint}>
        Connect your Qwen.ai account for free access to qwen-coder-plus, qwen-coder-flash, and
        qwen-vl-plus. 1,000 requests/day, 60 req/min. No API key needed.
      </Text>
      {connecting && deviceCode ? (
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
            Enter this code at chat.qwen.ai:
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              textAlign: 'center',
              color: linearTheme.colors.accent,
              letterSpacing: 4,
              marginVertical: 8,
              fontFamily: 'Inter_400Regular',
            }}
            selectable
          >
            {deviceCode.user_code}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
            }}
          >
            <ActivityIndicator size="small" color={linearTheme.colors.accent} />
            <Text style={[styles.hint, { marginTop: 0 }]}>Waiting for authorization...</Text>
          </View>
          <TouchableOpacity
            style={{ marginTop: 12, alignSelf: 'center' }}
            onPress={() =>
              deviceCode &&
              Linking.openURL(
                (deviceCode.verification_uri_complete || deviceCode.verification_uri) as string,
              )
            }
            activeOpacity={0.7}
          >
            <Text
              style={{
                color: linearTheme.colors.accent,
                textDecorationLine: 'underline',
                fontSize: 13,
              }}
            >
              Open login page again
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ marginTop: 12 }}>
          {connected ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderWidth: 1,
                borderColor: linearTheme.colors.success + '44',
                borderRadius: 12,
                backgroundColor: linearTheme.colors.success + '11',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color={linearTheme.colors.success} />
                <Text style={{ color: linearTheme.colors.success, fontWeight: '700' }}>
                  Connected
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: linearTheme.colors.error + '22',
                }}
                onPress={disconnect}
                activeOpacity={0.8}
              >
                <Text style={{ color: linearTheme.colors.error, fontWeight: '700', fontSize: 13 }}>
                  Disconnect
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 14,
                borderWidth: 1,
                borderColor: linearTheme.colors.accent + '66',
                borderRadius: 12,
                backgroundColor: linearTheme.colors.accent + '11',
              }}
              onPress={connect}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-outline" size={20} color={linearTheme.colors.accent} />
              <Text style={{ color: linearTheme.colors.accent, fontWeight: '700', fontSize: 14 }}>
                Connect Qwen (Free)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SubSectionToggle>
  );
}
