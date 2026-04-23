import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SidebarNavItemProps {
  label: string;
  iconName?: any;
  icon?: React.ReactNode;
  badge?: string;
  isActive?: boolean;
  onPress: () => void;
  isCollapsed?: boolean;
}

export function SidebarNavItem({
  label,
  iconName,
  icon,
  badge,
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
    </TouchableOpacity>
  );
}
