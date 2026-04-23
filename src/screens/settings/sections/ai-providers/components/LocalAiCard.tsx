import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SettingsToggleRow from '../../../components/SettingsToggleRow';

interface Props {
  title: string;
  iconName: any;
  iconColor: string;
  isActive: boolean;
  onToggle?: (val: boolean) => void;
  hint: string;
  disableToggle?: boolean;
  extraInfo?: string;
  showToggle?: boolean;
  styles: any;
}

export default function LocalAiCard({
  title,
  iconName,
  iconColor,
  isActive,
  onToggle,
  hint,
  disableToggle,
  extraInfo,
  showToggle = true,
  styles,
}: Props) {
  return (
    <View style={styles.localAiCard}>
      <View style={styles.localAiCardHeader}>
        <View style={styles.localAiCardLabelRow}>
          <View style={[styles.localAiCardIcon, { backgroundColor: iconColor + '22' }]}>
            <Ionicons name={iconName} size={16} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { marginBottom: 0 }]}>{title}</Text>
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.localAiBadge, isActive ? null : styles.localAiBadgeMuted]}>
            <Text style={[styles.localAiBadgeText, isActive ? null : styles.localAiBadgeMutedText]}>
              {isActive ? 'Active' : 'Off'}
            </Text>
          </View>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        {showToggle && onToggle && (
          <SettingsToggleRow
            label=""
            value={isActive}
            onValueChange={onToggle}
            disabled={disableToggle}
          />
        )}
      </View>
      {extraInfo && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.hint}>{extraInfo}</Text>
        </View>
      )}
    </View>
  );
}
