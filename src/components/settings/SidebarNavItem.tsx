import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SidebarNavItemProps {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  iconName?: any;
  icon?: React.ReactNode;
  badge?: string;
  /** Optional colored dot for at-a-glance category health. */
  statusDotColor?: string;
  isActive?: boolean;
  onPress: () => void;
  isCollapsed?: boolean;
}

export function SidebarNavItem({
  label,
  iconName,
  icon,
  badge,
  statusDotColor,
  isActive,
  onPress,
  isCollapsed,
}: SidebarNavItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon ?? <Ionicons name={iconName} size={16} color={isActive ? '#E8E8E8' : '#5E626B'} />}
        {!isCollapsed && (
          <Text
            style={{ fontSize: 13, fontWeight: '500', color: isActive ? '#E8E8E8' : '#8A8F98' }}
          >
            {label}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {statusDotColor && !isCollapsed ? (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: statusDotColor,
            }}
          />
        ) : null}
        {!isCollapsed && badge && (
          <View
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.2)',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '500', color: '#F87171' }}>{badge}</Text>
          </View>
        )}
        {isCollapsed && statusDotColor ? (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: statusDotColor,
            }}
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

