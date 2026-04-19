import React, { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../primitives/LinearText';
import { AppFlashList } from '../primitives/AppFlashList';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha, blackAlpha, accentAlpha } from '../../theme/colorUtils';
import { ModelOption } from '../../types/chat';

interface GuruChatModelSelectorProps {
  visible: boolean;
  onClose: () => void;
  availableModels: ModelOption[];
  visibleModelGroups: ModelOption['group'][];
  chosenModel: string;
  onSelectModel: (modelId: string) => void;
  pickerTab: ModelOption['group'];
  onSetPickerTab: (group: ModelOption['group']) => void;
  localLlmWarning: string | null;
  hasMessages: boolean;
}

export const GuruChatModelSelector = memo(function GuruChatModelSelector({
  visible,
  onClose,
  availableModels,
  visibleModelGroups,
  chosenModel,
  onSelectModel,
  pickerTab,
  onSetPickerTab,
  localLlmWarning,
  hasMessages,
}: GuruChatModelSelectorProps) {
  if (!visible) return null;

  const handleSelectModel = (modelId: string) => {
    if (hasMessages && modelId !== chosenModel) {
      // In the full implementation, this would show a confirmation dialog
      // For now, we just call onSelectModel
      onSelectModel(modelId);
    } else {
      onSelectModel(modelId);
    }
    onClose();
  };

  const renderModelItem = ({ item: model }: { item: ModelOption }) => (
    <Pressable
      style={({ pressed }) => [
        styles.modelItem,
        chosenModel === model.id && styles.modelItemActive,
        pressed && styles.pressed,
      ]}
      android_ripple={{ color: `${n.colors.accent}22` }}
      onPress={() => handleSelectModel(model.id)}
    >
      <LinearText
        style={[styles.modelItemText, chosenModel === model.id && styles.modelItemTextActive]}
      >
        {model.name}
      </LinearText>
      {chosenModel === model.id ? (
        <Ionicons name="checkmark-circle" size={18} color={n.colors.accent} />
      ) : null}
    </Pressable>
  );

  return (
    <View style={styles.sheetOverlay} pointerEvents="box-none">
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheetContent}>
        <LinearText style={styles.sheetEyebrow}>Model</LinearText>
        <LinearText style={styles.sheetTitle}>Choose a model</LinearText>
        {localLlmWarning ? (
          <LinearText style={styles.warningText}>{localLlmWarning}</LinearText>
        ) : null}

        {/* Provider tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabStrip}
          contentContainerStyle={styles.tabStripContent}
        >
          {visibleModelGroups.map((group) => (
            <Pressable
              key={group}
              style={[styles.tabChip, pickerTab === group && styles.tabChipActive]}
              onPress={() => onSetPickerTab(group)}
            >
              <LinearText
                style={[styles.tabChipText, pickerTab === group && styles.tabChipTextActive]}
              >
                {group}
              </LinearText>
            </Pressable>
          ))}
        </ScrollView>

        {/* Models for selected tab */}
        <AppFlashList
          data={availableModels.filter((m) => m.group === pickerTab)}
          keyExtractor={(m) => m.id}
          style={styles.modelList}
          renderItem={renderModelItem}
        />

        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          onPress={onClose}
        >
          <LinearText style={styles.closeBtnText}>Cancel</LinearText>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: blackAlpha['56'],
  },
  sheetContent: {
    backgroundColor: n.colors.surface,
    borderRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 18,
    maxHeight: '74%',
    width: '94%',
    maxWidth: 560,
    alignSelf: 'center',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  sheetEyebrow: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  sheetTitle: {
    ...n.typography.title,
    color: n.colors.textPrimary,
    marginBottom: 14,
    textAlign: 'center',
    fontSize: 22,
  },
  warningText: {
    ...n.typography.caption,
    color: n.colors.warning,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  tabStrip: {
    flexGrow: 0,
    marginBottom: 12,
  },
  tabStripContent: {
    gap: 6,
    paddingHorizontal: 2,
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  tabChipActive: {
    backgroundColor: accentAlpha['10'],
    borderColor: accentAlpha['25'],
  },
  tabChipText: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tabChipTextActive: {
    color: n.colors.accent,
  },
  modelList: {
    maxHeight: 320,
  },
  modelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 6,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  modelItemActive: {
    backgroundColor: accentAlpha['10'],
    borderColor: accentAlpha['20'],
  },
  modelItemText: {
    color: n.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modelItemTextActive: {
    color: n.colors.textPrimary,
  },
  closeBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  closeBtnText: {
    color: n.colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  pressed: {
    opacity: n.alpha.pressed,
  },
});
