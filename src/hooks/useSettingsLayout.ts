import { useState, useCallback } from 'react';
import { useWindowDimensions } from 'react-native';
import type { SettingsCategory } from '../types';

export function useSettingsLayout(initialCategory: SettingsCategory = 'dashboard') {
  const { width } = useWindowDimensions();
  const isTabletLayout = width >= 980;
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleExpandedSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    isTabletLayout,
    activeCategory,
    setActiveCategory,
    expandedSections,
    toggleExpandedSection,
  };
}
