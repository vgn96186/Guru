import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { linearTheme as n } from '../../../theme/linearTheme';

export type ProviderOrderItem = {
  id: string;
  label: string;
};

interface Props {
  items: ProviderOrderItem[];
  onSave: (orderedIds: string[]) => void;
  onReset?: () => void;
  resetLabel?: string;
}

export default function ProviderOrderEditor({
  items,
  onSave,
  onReset,
  resetLabel = 'Reset',
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ProviderOrderItem[]>(items);

  React.useEffect(() => {
    if (open) setDraft(items);
  }, [items, open]);

  return (
    <View>
      <View style={[s.actionsRow, { marginBottom: 12 }]}>
        <TouchableOpacity style={s.primaryBtn} onPress={() => setOpen(true)} activeOpacity={0.85}>
          <Ionicons name="reorder-three" size={18} color={n.colors.accent} />
          <Text style={s.primaryBtnText}>Reorder</Text>
        </TouchableOpacity>
        {onReset ? (
          <TouchableOpacity style={s.resetBtn} onPress={onReset} activeOpacity={0.8}>
            <Text style={s.resetBtnText}>{resetLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.listGrid}>
        {items.map((it, index) => {
          const isTop = index === 0;
          return (
            <View key={it.id} style={[s.row, s.rowGridItem, isTop && s.rowTop]}>
              <View style={[s.numBadge, isTop && s.numBadgeTop]}>
                <Text style={[s.numText, isTop && s.numTextTop]}>{index + 1}</Text>
              </View>
              <Text style={[s.name, isTop && s.nameTop]} numberOfLines={1}>
                {it.label}
              </Text>
            </View>
          );
        })}
      </View>

      <ReorderModal
        visible={open}
        order={draft}
        setOrder={setDraft}
        onCancel={() => setOpen(false)}
        onSave={() => {
          onSave(draft.map((it) => it.id));
          setOpen(false);
        }}
      />
    </View>
  );
}

function ReorderModal({
  visible,
  order,
  setOrder,
  onCancel,
  onSave,
}: {
  visible: boolean;
  order: ProviderOrderItem[];
  setOrder: (order: ProviderOrderItem[]) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const renderItem = React.useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<ProviderOrderItem>) => {
      const index = getIndex() ?? 0;
      const isTop = index === 0;
      return (
        <ScaleDecorator>
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={drag}
            disabled={isActive}
            delayLongPress={170}
            style={[s.row, isTop && s.rowTop, isActive && s.rowDragging]}
          >
            <View style={[s.numBadge, isTop && s.numBadgeTop]}>
              <Text style={[s.numText, isTop && s.numTextTop]}>{index + 1}</Text>
            </View>
            <Text style={[s.name, isTop && s.nameTop]} numberOfLines={1}>
              {item.label}
            </Text>
            <Ionicons name="reorder-three" size={22} color={n.colors.textMuted} />
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={{ flex: 1 }} {...({ unstable_forceActive: true } as object)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Reorder providers</Text>
                <Text style={s.modalHint}>Long-press a row, then drag.</Text>
              </View>
              <TouchableOpacity onPress={onCancel} style={s.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={n.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <DraggableFlatList
              data={order}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              onDragEnd={({ data }) => setOrder(data as ProviderOrderItem[])}
              activationDistance={8}
              autoscrollThreshold={40}
              autoscrollSpeed={40}
              containerStyle={s.dragList}
              contentContainerStyle={s.dragListContent}
            />

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={onSave} activeOpacity={0.85}>
                <Text style={s.saveBtnText}>Save order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  list: {
    gap: 6,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    gap: 12,
    marginBottom: 6,
  },
  rowGridItem: {
    width: '48%',
    flexGrow: 1,
    marginBottom: 0,
  },
  rowTop: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.primaryTintSoft,
  },
  rowDragging: {
    borderColor: n.colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  numBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.background,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  numBadgeTop: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
  },
  numText: {
    fontSize: 12,
    fontWeight: '700',
    color: n.colors.textMuted,
  },
  numTextTop: {
    color: '#FFFFFF',
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: n.colors.textPrimary,
  },
  nameTop: {
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: n.colors.accent,
    backgroundColor: n.colors.primaryTintSoft,
  },
  primaryBtnText: {
    color: n.colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  resetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.background,
  },
  resetBtnText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    borderRadius: 24,
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.background,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: n.colors.textPrimary,
  },
  modalHint: {
    marginTop: 4,
    color: n.colors.textMuted,
    fontSize: 12,
  },
  dragList: {
    flexGrow: 0,
    minHeight: 120,
  },
  dragListContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: n.colors.background,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  cancelBtnText: {
    color: n.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: n.colors.accent,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
