import React from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import { PROVIDER_DISPLAY_NAMES } from '../../../../../types';
import type { ProviderId } from '../../../../../types';

interface Props {
  routing: {
    providerOrder: ProviderId[];
    moveProvider: (fromIndex: number, toIndex: number) => void;
    setProviderOrder: (order: ProviderId[]) => void;
  };
  DEFAULT_PROVIDER_ORDER: ProviderId[];
  sanitizeProviderOrder: (order: ProviderId[]) => ProviderId[];
  updateUserProfile: (patch: any) => Promise<void>;
  refreshProfile: () => Promise<void>;
  SubSectionToggle: any;
  styles: any;
}

export default function RoutingSection({
  routing,
  DEFAULT_PROVIDER_ORDER,
  sanitizeProviderOrder,
  updateUserProfile,
  refreshProfile,
  SubSectionToggle,
  styles,
}: Props) {
  const { providerOrder, moveProvider, setProviderOrder } = routing;

  return (
    <SubSectionToggle id="ai_routing" title="PROVIDER ROUTING">
      <Text style={styles.hint}>
        Drag to reorder. Guru uses the highest available provider for generation.
      </Text>
      <View style={[styles.providerListContainer, { marginTop: 8 }]}>
        {providerOrder.map((providerId, index) => {
          const isTop = index === 0;
          return (
            <View key={providerId} style={[styles.providerRow, isTop && styles.providerRowTop]}>
              <View style={styles.providerRowLeft}>
                <View style={styles.providerNumberBadge}>
                  <Text style={styles.providerNumberText}>{index + 1}</Text>
                </View>
                <Text style={[styles.providerName, isTop && styles.providerNameTop]}>
                  {PROVIDER_DISPLAY_NAMES[providerId] || providerId}
                </Text>
                {isTop && (
                  <View style={styles.topBadge}>
                    <Text style={styles.topBadgeText}>Primary</Text>
                  </View>
                )}
              </View>
              <View style={styles.providerActions}>
                <Pressable
                  disabled={index === 0}
                  onPress={() => moveProvider(index, 0)}
                  style={({ pressed }) => [
                    styles.providerActionBtn,
                    index === 0 && styles.providerActionBtnDisabled,
                    pressed && !isTop && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons
                    name="chevron-up"
                    size={20}
                    color={
                      index === 0 ? linearTheme.colors.textMuted : linearTheme.colors.textPrimary
                    }
                  />
                </Pressable>
                <Pressable
                  disabled={index === 0}
                  onPress={() => moveProvider(index, index - 1)}
                  style={({ pressed }) => [
                    styles.providerActionBtn,
                    index === 0 && styles.providerActionBtnDisabled,
                    pressed && index > 0 && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons
                    name="arrow-up"
                    size={20}
                    color={
                      index === 0 ? linearTheme.colors.textMuted : linearTheme.colors.textPrimary
                    }
                  />
                </Pressable>
                <Pressable
                  disabled={index === providerOrder.length - 1}
                  onPress={() => moveProvider(index, index + 1)}
                  style={({ pressed }) => [
                    styles.providerActionBtn,
                    index === providerOrder.length - 1 && styles.providerActionBtnDisabled,
                    pressed && index < providerOrder.length - 1 && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons
                    name="arrow-down"
                    size={20}
                    color={
                      index === providerOrder.length - 1
                        ? linearTheme.colors.textMuted
                        : linearTheme.colors.textPrimary
                    }
                  />
                </Pressable>
                <Pressable
                  disabled={index === providerOrder.length - 1}
                  onPress={() => moveProvider(index, providerOrder.length - 1)}
                  style={({ pressed }) => [
                    styles.providerActionBtn,
                    index === providerOrder.length - 1 && styles.providerActionBtnDisabled,
                    pressed && index < providerOrder.length - 1 && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={
                      index === providerOrder.length - 1
                        ? linearTheme.colors.textMuted
                        : linearTheme.colors.textPrimary
                    }
                  />
                </Pressable>
              </View>
            </View>
          );
        })}
        <TouchableOpacity
          style={[styles.testBtn, { marginTop: 4, marginBottom: 12 }]}
          onPress={() => {
            const reset = [...DEFAULT_PROVIDER_ORDER];
            setProviderOrder(reset);
            void updateUserProfile({ providerOrder: sanitizeProviderOrder(reset) })
              .then(() => refreshProfile())
              .catch((err: unknown) => {
                if (__DEV__) console.warn('[Settings] Failed to reset provider order:', err);
              });
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.testBtnText}>Reset to Default Order</Text>
        </TouchableOpacity>
      </View>
    </SubSectionToggle>
  );
}
