import React from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearText from '../../../../../components/primitives/LinearText';
import LinearSurface from '../../../../../components/primitives/LinearSurface';
import type { OAuthSlot } from '../types';

interface Props {
  title: string;
  slot: OAuthSlot;
  styles: any;
  children?: React.ReactNode;
}

export default function OAuthCard({ title, slot, styles, children }: Props) {
  const { connecting, deviceCode, connected, connect, disconnect } = slot;

  return (
    <LinearSurface style={styles.providerCard}>
      <View style={styles.providerHeader}>
        <View style={styles.providerTitle}>
          <LinearText variant="title" style={{ fontSize: 16 }}>
            {title}
          </LinearText>
          {connected ? (
            <View style={styles.connectedBadge}>
              <LinearText style={styles.connectedText}>Connected</LinearText>
            </View>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.connectBtn, connected && styles.disconnectBtn]}
          onPress={connected ? disconnect : connect}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <LinearText style={styles.connectBtnText}>
              {connected ? 'Disconnect' : 'Connect'}
            </LinearText>
          )}
        </TouchableOpacity>
      </View>

      {deviceCode && !connected ? (
        <View style={styles.authInstructions}>
          <LinearText style={styles.authStep}>
            1. Copy this code:{' '}
            <LinearText style={{ fontWeight: '700', color: linearTheme.colors.textPrimary }}>
              {deviceCode.user_code}
            </LinearText>
          </LinearText>
          <LinearText style={styles.authStep}>
            2. Go to {deviceCode.verification_uri} and paste it.
          </LinearText>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={linearTheme.colors.accent} />
            <LinearText style={styles.loadingText}>Waiting for authorization...</LinearText>
          </View>
        </View>
      ) : null}

      {children}
    </LinearSurface>
  );
}
