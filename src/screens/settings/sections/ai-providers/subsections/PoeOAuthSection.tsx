import React from 'react';
import { View } from 'react-native';
import OAuthCard from '../components/OAuthCard';
import type { OAuthSlot } from '../types';

interface Props {
  poe: OAuthSlot;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function PoeOAuthSection({ poe, styles }: Props) {
  return (
    <View style={{ marginBottom: 16 }}>
      <OAuthCard
        title="Poe Account"
        purpose="Connect to access claude-3-opus, gpt-4, and community bots. Supports free and subscribed accounts."
        iconName="planet-outline"
        slot={poe}
        styles={styles}
      />
    </View>
  );
}
