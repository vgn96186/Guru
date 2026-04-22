import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SidebarNavItem } from './SidebarNavItem';
import { SettingsCategory } from '../../screens/SettingsScreen';
import { linearTheme } from '../../theme/linearTheme';

export const SETTINGS_CATEGORIES: {
  id: SettingsCategory;
  label: string;
  badge?: string;
  iconName: string;
}[] = [
  { id: 'general', label: 'General Overview', iconName: 'grid-outline' },
  { id: 'ai', label: 'AI & Inference', iconName: 'sparkles-outline' },
  { id: 'interventions', label: 'Interventions', badge: 'Active', iconName: 'shield-outline' },
  { id: 'integrations', label: 'App Integrations', iconName: 'apps-outline' },
  { id: 'planning', label: 'Planning & Alerts', iconName: 'calendar-outline' },
  { id: 'sync', label: 'Device Sync', iconName: 'sync-outline' },
  { id: 'storage', label: 'Data & Storage', iconName: 'server-outline' },
];

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onSelectCategory: (category: SettingsCategory) => void;
  isCollapsed: boolean;
  profileName?: string;
  totalXp?: number;
  onLogout?: () => void;
}

export function SettingsSidebar({
  activeCategory,
  onSelectCategory,
  isCollapsed,
  profileName = 'User',
  totalXp = 0,
  onLogout,
}: SettingsSidebarProps) {
  const level = Math.floor(Math.sqrt(totalXp / 100)) + 1; // Simple dummy logic

  return (
    <View
      style={{
        borderRightWidth: 1,
        borderRightColor: 'rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        flexShrink: 0,
        flexDirection: 'column',
        height: '100%',
        zIndex: 20,
        width: isCollapsed ? 64 : 256,
      }}
      className={` ${isCollapsed ? 'w-16' : 'w-64'}`}
    >
      {/* User Profile Minimal */}
      <View
        style={{
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.05)',
          flexShrink: 0,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: '#5E6AD2',
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 1,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: 'bold', color: 'white' }}>
            {profileName.charAt(0)}
          </Text>
        </View>
        {!isCollapsed && (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#E8E8E8' }} numberOfLines={1}>
              {profileName}'s Workspace
            </Text>
            <Text style={{ fontSize: 11, color: '#8A8F98' }} numberOfLines={1}>
              Level {level}
            </Text>
          </View>
        )}
      </View>

      {/* Navigation Categories */}
      <ScrollView
        style={{
          flex: 1,
          paddingVertical: 16,
          paddingHorizontal: 12,
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {!isCollapsed && (
          <View style={{ paddingHorizontal: 8, marginBottom: 4 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: '#5E626B',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Settings
            </Text>
          </View>
        )}

        {SETTINGS_CATEGORIES.map((category) => (
          <SidebarNavItem
            key={category.id}
            label={category.label}
            badge={category.badge}
            iconName={category.iconName}
            isActive={activeCategory === category.id}
            isCollapsed={isCollapsed}
            onPress={() => onSelectCategory(category.id)}
          />
        ))}
      </ScrollView>

      {/* Footer */}
      {!isCollapsed && (
        <View
          style={{ padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)' }}
        >
          <TouchableOpacity
            onPress={onLogout}
            style={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#F87171' }}>Log out</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
