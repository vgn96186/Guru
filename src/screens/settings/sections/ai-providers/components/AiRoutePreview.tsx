import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../../../components/primitives/LinearText';
import { linearTheme as n } from '../../../../../theme/linearTheme';
import { PROVIDER_DISPLAY_NAMES } from '../../../../../types';
import { sanitizeProviderOrder } from '../../../../../utils/providerOrder';
import type { AiProvidersProps } from '../types';

type Props = {
  routing: AiProvidersProps['routing'];
  localAi: AiProvidersProps['localAi'];
  guruChatDefaultModel: string;
  formatModelChipLabel: (value: string) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- transitional settings refactor boundary
  styles: any;
};

export default function AiRoutePreview({
  routing,
  guruChatDefaultModel,
  formatModelChipLabel,
  styles,
}: Props) {
  const providerRoute = sanitizeProviderOrder(routing.providerOrder).slice(0, 4);
  const route = providerRoute.map((provider) => PROVIDER_DISPLAY_NAMES[provider] ?? provider);
  const modelLabel =
    guruChatDefaultModel === 'auto'
      ? 'Auto-select best available'
      : formatModelChipLabel(guruChatDefaultModel);

  return (
    <View style={styles.aiRouteCard}>
      <View style={styles.aiRouteHeader}>
        <View style={styles.aiRouteIcon}>
          <Ionicons name="git-network-outline" size={20} color={n.colors.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <LinearText variant="meta" tone="accent" style={{ letterSpacing: 1 }}>
            CURRENT AI ROUTE
          </LinearText>
          <LinearText variant="title" style={{ marginTop: 4 }}>
            {modelLabel}
          </LinearText>
        </View>
      </View>

      <View style={styles.aiRoutePath}>
        {route.map((label, index) => (
          <React.Fragment key={`${label}-${index}`}>
            <View style={[styles.aiRouteNode, index === 0 && styles.aiRouteNodePrimary]}>
              <LinearText variant="caption" tone={index === 0 ? 'accent' : 'secondary'}>
                {label}
              </LinearText>
            </View>
            {index < route.length - 1 ? (
              <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
            ) : null}
          </React.Fragment>
        ))}
      </View>

      <LinearText variant="caption" tone="muted" style={{ marginTop: 12 }}>
        Guru tries the leftmost ready option first, then falls back across the route.
      </LinearText>
    </View>
  );
}
