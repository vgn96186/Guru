import React from 'react';
import { View } from 'react-native';
import OAuthCard from '../components/OAuthCard';
import type { OAuthSlot } from '../types';

interface Props {
  qwen: OAuthSlot;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function QwenOAuthSection({ qwen, styles }: Props) {
  return (
    <View style={{ marginBottom: 16 }}>
      <OAuthCard
        title="Qwen (Free)"
        purpose="Connect your Qwen account for free access to qwen-coder. No API key needed."
        iconName="cloud-outline"
        slot={qwen}
        styles={styles}
      />
    </View>
  );
}
