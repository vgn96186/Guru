import React from 'react';
import { View, Switch } from 'react-native';
import OAuthCard from '../components/OAuthCard';
import type { ChatGptSlotState } from '../types';

interface Props {
  chatgpt: ChatGptSlotState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function ChatGptOAuthSection({ chatgpt, styles }: Props) {
  const { connectingSlot, deviceCode, accounts, setAccounts, connect, disconnect } = chatgpt;

  return (
    <View style={{ marginBottom: 16 }}>
      {(['primary', 'secondary'] as const).map((slot) => {
        const slotState = accounts[slot];
        const isConnecting = connectingSlot === slot;

        return (
          <View key={slot}>
            <OAuthCard
              title={slot === 'primary' ? 'ChatGPT (Primary)' : 'ChatGPT (Secondary)'}
              purpose={
                slot === 'primary'
                  ? 'OpenAI account for transcription and chat.'
                  : 'Secondary OpenAI account slot.'
              }
              iconName="chatbubbles-outline"
              slot={{
                connecting: isConnecting,
                connected: slotState.connected,
                deviceCode: isConnecting ? deviceCode : null,
                connect: () => connect(slot),
                disconnect: () => disconnect(slot),
              }}
              secondaryAction={
                <Switch
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(52, 211, 153, 0.4)' }}
                  thumbColor={slotState.enabled ? '#34D399' : '#888'}
                  ios_backgroundColor="rgba(255,255,255,0.1)"
                  value={slotState.enabled}
                  style={{ transform: [{ scale: 0.8 }] }}
                  onValueChange={(val) =>
                    setAccounts((prev) => ({
                      ...prev,
                      [slot]: { ...prev[slot], enabled: val },
                    }))
                  }
                />
              }
              styles={styles}
            />
          </View>
        );
      })}
    </View>
  );
}
