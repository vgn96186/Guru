import React from 'react';
import { View, Text, Switch } from 'react-native';
import OAuthCard from '../components/OAuthCard';
import type { ChatGptSlotState } from '../types';

interface Props {
  chatgpt: ChatGptSlotState;
  SectionToggle: any;
  styles: any;
}

export default function ChatGptOAuthSection({ chatgpt, SectionToggle, styles }: Props) {
  const { connectingSlot, deviceCode, accounts, setAccounts, connect, disconnect } = chatgpt;

  return (
    <SectionToggle id="chatgpt_oauth" title="CHATGPT (OAUTH)">
      <Text style={styles.hint}>
        Link your ChatGPT account (Plus or Free) for transcription and live chat using your own
        quota.
      </Text>
      {(['primary', 'secondary'] as const).map((slot) => {
        const slotState = accounts[slot];
        const isConnecting = connectingSlot === slot;

        return (
          <View key={slot} style={{ marginTop: slot === 'secondary' ? 16 : 0 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 8,
                justifyContent: 'space-between',
              }}
            >
              <Text style={styles.label}>
                {slot === 'primary' ? 'Primary Account' : 'Secondary Account'}
              </Text>
              <Switch
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(52, 211, 153, 0.4)' }}
                thumbColor={slotState.enabled ? '#34D399' : '#888'}
                ios_backgroundColor="rgba(255,255,255,0.1)"
                value={slotState.enabled}
                onValueChange={(val) =>
                  setAccounts((prev) => ({
                    ...prev,
                    [slot]: { ...prev[slot], enabled: val },
                  }))
                }
              />
            </View>
            <OAuthCard
              title={slot === 'primary' ? 'ChatGPT (Primary)' : 'ChatGPT (Secondary)'}
              slot={{
                connecting: isConnecting,
                connected: slotState.connected,
                deviceCode: isConnecting ? deviceCode : null,
                connect: () => connect(slot),
                disconnect: () => disconnect(slot),
              }}
              styles={styles}
            />
          </View>
        );
      })}
    </SectionToggle>
  );
}
