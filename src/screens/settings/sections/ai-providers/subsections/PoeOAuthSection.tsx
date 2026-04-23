import React from 'react';
import { Text } from 'react-native';
import OAuthCard from '../components/OAuthCard';
import type { OAuthSlot } from '../types';

interface Props {
  poe: OAuthSlot;
  SubSectionToggle: any;
  styles: any;
}

export default function PoeOAuthSection({ poe, SubSectionToggle, styles }: Props) {
  return (
    <SubSectionToggle id="poe_oauth" title="POE OAUTH">
      <Text style={styles.hint}>
        Connect your Poe account to access claude-3-opus, gpt-4, and millions of community bots.
        Supports both free and subscribed Poe accounts.
      </Text>
      <OAuthCard title="Poe Account" slot={poe} styles={styles} />
    </SubSectionToggle>
  );
}
