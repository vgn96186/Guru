import React from 'react';
import { View } from 'react-native';
import HomeSectionHeader from '../../../components/home/HomeSectionHeader';

interface SectionProps {
  label: string;
  children: React.ReactNode;
  accessibilityLabel?: string;
  headerAction?: React.ReactNode;
}

export function HomeSection({ label, children, accessibilityLabel, headerAction }: SectionProps) {
  return (
    <View accessibilityRole="summary" accessibilityLabel={accessibilityLabel ?? label}>
      <HomeSectionHeader label={label} action={headerAction} />
      {children}
    </View>
  );
}
