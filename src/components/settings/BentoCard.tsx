import React from 'react';
import { View, ViewProps, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface BentoCardProps extends ViewProps {
  title?: string;
  icon?: React.ReactNode;
  headerElement?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function BentoCard({
  title,
  icon,
  headerElement,
  children,
  className = '',
  ...props
}: BentoCardProps) {
  return (
    <LinearGradient
      colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.01)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: 20,
        flex: 1,
      }}
      {...props}
    >
      {(title || icon || headerElement) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {icon}
            {title && (
              <Text style={{ fontWeight: '600', fontSize: 14, color: '#E8E8E8' }}>{title}</Text>
            )}
          </View>
          {headerElement}
        </View>
      )}
      <View style={{ flex: 1 }}>{children}</View>
    </LinearGradient>
  );
}
