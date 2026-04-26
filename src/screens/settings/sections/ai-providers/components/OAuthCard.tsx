import React from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearText from '../../../../../components/primitives/LinearText';
import type { OAuthSlot } from '../types';

interface Props {
  title: string;
  purpose?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  slot: OAuthSlot;
  secondaryAction?: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
  children?: React.ReactNode;
}

export default function OAuthCard({
  title,
  purpose,
  iconName = 'link-outline',
  slot,
  secondaryAction,
  styles,
  children,
}: Props) {
  const { connecting, deviceCode, connected, connect, disconnect } = slot;

  const statusLabel = connected ? 'Connected' : 'Not set';
  const statusTone = connected ? 'success' : 'muted';
  const { width } = useWindowDimensions();
  const stackValidate = width < 520;

  return (
    <View style={[styles.apiKeyCard, { marginBottom: 8 }]}>
      {/* ── Header ──────────────────────────── */}
      <View
        style={[
          styles.apiKeyCardHeader,
          { marginBottom: (deviceCode && !connected) || children ? 10 : 0 },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 10 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: connected
                ? linearTheme.colors.success + '18'
                : 'rgba(255,255,255,0.04)',
            }}
          >
            <Ionicons
              name={iconName}
              size={15}
              color={connected ? linearTheme.colors.success : linearTheme.colors.textMuted}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <LinearText variant="label" style={{ fontWeight: '700' }}>
              {title}
            </LinearText>
            {purpose ? (
              <LinearText variant="caption" tone="muted" style={{ marginTop: 1 }}>
                {purpose}
              </LinearText>
            ) : null}
          </View>
        </View>

        {/* ── Secondary Action (e.g. Enable Switch) ── */}
        {secondaryAction}

        {/* ── Action Button (Replaces Status Pill) ── */}
        <TouchableOpacity
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 6,
              marginLeft: 10,
              minWidth: 90,
            },
            connected
              ? {
                  backgroundColor: linearTheme.colors.error + '11',
                  borderColor: linearTheme.colors.error + '44',
                }
              : {
                  backgroundColor: linearTheme.colors.accent + '11',
                  borderColor: linearTheme.colors.accent + '44',
                },
          ]}
          onPress={connected ? disconnect : connect}
          disabled={connecting}
          activeOpacity={0.8}
        >
          {connecting ? (
            <ActivityIndicator size="small" color={linearTheme.colors.accent} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons
                name={connected ? 'log-out-outline' : 'cloud-outline'}
                size={14}
                color={connected ? linearTheme.colors.error : linearTheme.colors.accent}
              />
              <Text
                style={{
                  color: connected ? linearTheme.colors.error : linearTheme.colors.accent,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {connected ? 'Disconnect' : 'Connect'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Device Code ──────── */}
      {deviceCode && !connected ? (
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
            Enter this code at{' '}
            {new URL(deviceCode.verification_uri || 'https://example.com').hostname}:
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
              Open login page
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {children}
    </View>
  );
}
