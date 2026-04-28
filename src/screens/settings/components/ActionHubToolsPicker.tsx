import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme as n } from '../../../theme/linearTheme';
import ProviderOrderEditor from './ProviderOrderEditor';
import {
  ACTION_HUB_TOOL_IDS,
  ACTION_HUB_TOOL_META,
  DEFAULT_ACTION_HUB_TOOLS,
  type ActionHubToolId,
} from '../../../constants/actionHubTools';
import { sanitizeActionHubTools } from '../../../utils/actionHubTools';

type Props = {
  value: ActionHubToolId[];
  onChange: (next: ActionHubToolId[]) => void;
};

export function ActionHubToolsPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const effective = useMemo(() => sanitizeActionHubTools(value), [value]);

  const items = useMemo(
    () =>
      effective.map((id) => ({
        id,
        label: ACTION_HUB_TOOL_META[id].label,
      })),
    [effective],
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={s.selectedRow}>
        {effective.map((id) => (
          <View key={id} style={s.selectedChip}>
            <LinearText variant="meta" style={s.selectedChipText} numberOfLines={1} centered>
              {ACTION_HUB_TOOL_META[id].label}
            </LinearText>
          </View>
        ))}
      </View>

      <View style={s.actionsRow}>
        <Pressable style={s.pickBtn} onPress={() => setOpen(true)}>
          <Ionicons name="grid-outline" size={18} color={n.colors.accent} />
          <LinearText variant="label" style={s.pickBtnText}>
            Choose tools
          </LinearText>
        </Pressable>
      </View>

      <ProviderOrderEditor
        items={items}
        onSave={(orderedIds) => onChange(sanitizeActionHubTools(orderedIds) as ActionHubToolId[])}
        onReset={() => onChange(DEFAULT_ACTION_HUB_TOOLS)}
        resetLabel="Reset default"
      />

      <ToolPickerModal
        visible={open}
        selected={effective}
        onClose={() => setOpen(false)}
        onChange={(next) => onChange(next)}
      />
    </View>
  );
}

function ToolPickerModal({
  visible,
  selected,
  onClose,
  onChange,
}: {
  visible: boolean;
  selected: ActionHubToolId[];
  onClose: () => void;
  onChange: (next: ActionHubToolId[]) => void;
}) {
  const [draft, setDraft] = useState<ActionHubToolId[]>(selected);

  React.useEffect(() => {
    if (visible) setDraft(selected);
  }, [selected, visible]);

  function toggle(id: ActionHubToolId) {
    setDraft((prev) => {
      const has = prev.includes(id);
      if (has) return prev.filter((x) => x !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  }

  const canSave = draft.length === 6;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <LinearText variant="sectionTitle" style={s.modalTitle}>
                Action Hub tools
              </LinearText>
              <LinearText variant="bodySmall" tone="secondary" style={s.modalHint}>
                Pick exactly 6.
              </LinearText>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={22} color={n.colors.textMuted} />
            </Pressable>
          </View>

          <View style={s.modalList}>
            {ACTION_HUB_TOOL_IDS.map((id) => {
              const picked = draft.includes(id);
              const disabled = !picked && draft.length >= 6;
              return (
                <Pressable
                  key={id}
                  onPress={() => toggle(id)}
                  disabled={disabled}
                  style={({ pressed }) => [
                    s.modalRow,
                    picked && s.modalRowPicked,
                    disabled && s.modalRowDisabled,
                    pressed && !disabled && { opacity: 0.7 },
                  ]}
                >
                  <View style={s.modalRowLeft}>
                    <Ionicons
                      name={picked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={picked ? n.colors.accent : n.colors.textMuted}
                    />
                    <LinearText variant="body" style={s.modalRowText}>
                      {ACTION_HUB_TOOL_META[id].label}
                    </LinearText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={s.modalFooter}>
            <Pressable style={s.cancelBtn} onPress={onClose}>
              <LinearText variant="label" tone="secondary">
                Cancel
              </LinearText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                s.saveBtn,
                pressed && { opacity: 0.85 },
                !canSave && s.saveBtnDisabled,
              ]}
              disabled={!canSave}
              onPress={() => {
                onChange(draft);
                onClose();
              }}
            >
              <LinearText variant="label" tone="inverse">
                Save (6)
              </LinearText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  selectedChipText: {
    color: n.colors.textSecondary,
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    backgroundColor: n.colors.surfaceHover,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pickBtnText: {
    color: n.colors.textPrimary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: n.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    color: n.colors.textPrimary,
  },
  modalHint: {
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  modalList: {
    padding: 12,
    gap: 8,
  },
  modalRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  modalRowPicked: {
    borderColor: `${n.colors.accent}66`,
    backgroundColor: `${n.colors.accent}12`,
  },
  modalRowDisabled: {
    opacity: 0.45,
  },
  modalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalRowText: {
    color: n.colors.textPrimary,
  },
  modalFooter: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: n.colors.border,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: n.colors.accent,
    borderWidth: 1,
    borderColor: `${n.colors.accent}88`,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
});
