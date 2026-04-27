import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../primitives/LinearText';
import LinearTextInput from '../primitives/LinearTextInput';
import LinearIconButton from '../primitives/LinearIconButton';
import LinearDivider from '../primitives/LinearDivider';
import { linearTheme as n } from '../../theme/linearTheme';
import { elevation } from '../../theme/elevation';
import { blackAlpha, accentAlpha, withAlpha } from '../../theme/colorUtils';
import { ModelOption } from '../../types/chat';

// ── Provider visual identity ─────────────────────────────────────
const PROVIDER_META: Record<string, { icon: string; color: string }> = {
  Local: { icon: 'phone-portrait-outline', color: '#3FB950' },
  'ChatGPT Codex': { icon: 'logo-electron', color: '#74AA9C' },
  'Qwen (Free)': { icon: 'globe-outline', color: '#6366F1' },
  Groq: { icon: 'flash-outline', color: '#F97316' },
  OpenRouter: { icon: 'git-branch-outline', color: '#6D99FF' },
  Gemini: { icon: 'star-outline', color: '#8B5CF6' },
  'Vertex AI': { icon: 'server-outline', color: '#4285F4' },
  Cloudflare: { icon: 'cloud-outline', color: '#F48120' },
  'GitHub Models': { icon: 'logo-github', color: '#A0A0A5' },
  'GitHub Copilot': { icon: 'logo-github', color: '#A0A0A5' },
  'GitLab Duo': { icon: 'git-compare-outline', color: '#E24329' },
  Poe: { icon: 'chatbubbles-outline', color: '#B8A9E8' },
  Kilo: { icon: 'server-outline', color: '#06B6D4' },
  AgentRouter: { icon: 'swap-horizontal-outline', color: '#EC4899' },
};

const DEFAULT_META = { icon: 'server-outline', color: n.colors.textMuted };

interface GroupInfo {
  group: string;
  count: number;
}

interface GuruChatModelSelectorProps {
  visible: boolean;
  onClose: () => void;
  availableModels: ModelOption[];
  /** @deprecated kept for backward compat */
  visibleModelGroups?: ModelOption['group'][];
  chosenModel: string;
  onSelectModel: (modelId: string) => void;
  /** @deprecated kept for backward compat */
  pickerTab?: ModelOption['group'];
  /** @deprecated kept for backward compat */
  onSetPickerTab?: (group: ModelOption['group']) => void;
  localLlmWarning: string | null;
  hasMessages: boolean;
}

export const GuruChatModelSelector = memo(function GuruChatModelSelector({
  visible,
  onClose,
  availableModels,
  chosenModel,
  onSelectModel,
  localLlmWarning,
  hasMessages,
}: GuruChatModelSelectorProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string>('Local');

  // ── Derive groups with counts ─────────────────────────────────
  const groupInfos = useMemo<GroupInfo[]>(() => {
    const map = new Map<string, number>();
    for (const m of availableModels) {
      map.set(m.group, (map.get(m.group) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([group, count]) => ({ group, count }));
  }, [availableModels]);

  // ── Auto-select group of current model on open ────────────────
  useEffect(() => {
    if (!visible) return;
    const found = availableModels.find((m) => m.id === chosenModel);
    if (found && found.group !== activeGroup) {
      setTimeout(() => setActiveGroup(found.group), 0);
    }
  }, [visible, availableModels, chosenModel, activeGroup]);

  // ── Models for active group, filtered by search ───────────────
  const filteredModels = useMemo(() => {
    const inGroup = availableModels.filter((m) => m.group === activeGroup);
    const q = search.trim().toLowerCase();
    if (!q) return inGroup;
    return inGroup.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [availableModels, activeGroup, search]);

  // ── Current model info ────────────────────────────────────────
  const currentModel = useMemo(
    () => availableModels.find((m) => m.id === chosenModel),
    [availableModels, chosenModel],
  );

  const handleSelect = useCallback(
    (modelId: string) => {
      onSelectModel(modelId);
      setSearch('');
    },
    [onSelectModel],
  );

  // ── Sheet width: narrower on tablet ───────────────────────────
  const sheetWidth = screenW >= 700 ? Math.min(screenW * 0.42, 520) : screenW;

  // ── Model row renderer ────────────────────────────────────────
  const renderModelRow = useCallback(
    ({ item }: { item: ModelOption }) => {
      const active = chosenModel === item.id;
      const showId = item.id !== item.name && !item.id.startsWith('auto');

      return (
        <Pressable
          onPress={() => handleSelect(item.id)}
          android_ripple={{ color: accentAlpha['10'] }}
          accessibilityRole="button"
          accessibilityLabel={`Select model ${item.name}`}
        >
          <View style={[styles.row, active && styles.rowActive]}>
            {active ? <View style={styles.rowStripe} /> : null}
            <View style={styles.rowBody}>
              <LinearText
                variant="bodySmall"
                tone={active ? 'primary' : 'secondary'}
                style={active ? styles.rowNameBold : undefined}
                numberOfLines={1}
              >
                {item.name}
              </LinearText>
              {showId ? (
                <LinearText variant="caption" tone="muted" style={styles.rowIdSub} numberOfLines={1}>
                  {item.id}
                </LinearText>
              ) : null}
            </View>
            {active ? (
              <Ionicons name="checkmark-circle" size={18} color={n.colors.accent} />
            ) : (
              <View style={styles.rowRadio} />
            )}
          </View>
        </Pressable>
      );
    },
    [chosenModel, handleSelect],
  );

  const keyExtractor = useCallback((item: ModelOption) => item.id, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { width: sheetWidth, maxHeight: screenH * 0.75 }]}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <LinearText variant="sectionTitle" tone="primary">Models</LinearText>
            <LinearIconButton
              variant="ghost"
              shape="round"
              size="sm"
              onPress={onClose}
              accessibilityLabel="Close model picker"
            >
              <Ionicons name="close" size={16} color={n.colors.textMuted} />
            </LinearIconButton>
          </View>

          {/* Pinned current model */}
          {currentModel ? (
            <View style={styles.pinnedCard}>
              <View style={styles.pinnedStripe} />
              <View style={styles.pinnedBody}>
                <LinearText variant="badge" tone="accent" style={styles.pinnedLabel}>CURRENT</LinearText>
                <LinearText variant="bodySmall" tone="primary" style={styles.pinnedNameWeight} numberOfLines={1}>
                  {currentModel.name}
                </LinearText>
              </View>
              <View style={styles.pinnedBadge}>
                <LinearText variant="badge" tone="secondary">{currentModel.group}</LinearText>
              </View>
            </View>
          ) : null}

          {/* Notices */}
          {hasMessages ? (
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={13} color={n.colors.textMuted} />
              <LinearText variant="caption" tone="muted" style={styles.noticeFlex}>
                Switching mid-chat starts a fresh context.
              </LinearText>
            </View>
          ) : null}

          {localLlmWarning ? (
            <View style={styles.warning}>
              <Ionicons name="warning-outline" size={13} color={n.colors.warning} />
              <LinearText variant="caption" tone="warning" style={styles.noticeFlex}>
                {localLlmWarning}
              </LinearText>
            </View>
          ) : null}

          {/* ── Provider chip grid (wrapping, side by side) ──────── */}
          <View style={styles.chipScrollOuter}>
            <View style={styles.chipScrollContent}>
              <View style={styles.chipGrid}>
              {groupInfos.map(({ group, count }) => {
                const meta = PROVIDER_META[group] ?? DEFAULT_META;
                const selected = activeGroup === group;
                return (
                  <Pressable
                    key={group}
                    onPress={() => { setActiveGroup(group); setSearch(''); }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <View
                      style={[
                        styles.chip,
                        selected && { backgroundColor: withAlpha(meta.color, 0.15), borderColor: withAlpha(meta.color, 0.3) },
                      ]}
                    >
                      <View style={[styles.chipDot, { backgroundColor: meta.color }]} />
                      <LinearText
                        variant="chip"
                        tone="secondary"
                        style={selected ? { color: meta.color } : undefined}
                        numberOfLines={1}
                      >
                        {group}
                      </LinearText>
                      <LinearText variant="badge" tone="muted" style={selected ? { color: withAlpha(meta.color, 0.7) } : undefined}>
                        {count}
                      </LinearText>
                    </View>
                  </Pressable>
                );
              })}
              </View>
            </View>
          </View>

          {/* ── Search (scoped to selected provider) ─────────────── */}
          <View style={styles.searchWrap}>
            <LinearTextInput
              placeholder={`Search in ${activeGroup}...`}
              placeholderTextColor={n.colors.textMuted}
              value={search}
              onChangeText={setSearch}
              leftIcon={<Ionicons name="search" size={14} color={n.colors.textMuted} />}
              rightIcon={
                search.length > 0 ? (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={14} color={n.colors.textMuted} />
                  </Pressable>
                ) : undefined
              }
              containerStyle={styles.searchField}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          {/* ── Model list for selected provider ─────────────────── */}
          <FlatList
            data={filteredModels}
            keyExtractor={keyExtractor}
            renderItem={renderModelRow}
            ItemSeparatorComponent={ItemSeparator}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={22} color={n.colors.textMuted} />
                <LinearText variant="bodySmall" tone="muted">
                  {search ? `No models matching "${search}"` : `No models in ${activeGroup}`}
                </LinearText>
              </View>
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            maxToRenderPerBatch={15}
          />
        </View>
      </View>
    </Modal>
  );
});

const ItemSeparator = () => <LinearDivider style={styles.separatorInset} />;

const styles = StyleSheet.create({
  // ── Overlay ───────────────────────────────────────────────────
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: blackAlpha['60'],
  },

  // ── Sheet ─────────────────────────────────────────────────────
  sheet: {
    backgroundColor: 'rgba(6, 8, 14, 0.98)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: n.spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 36 : n.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: elevation.e2.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 24,
    overflow: 'hidden',
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: n.colors.borderHighlight,
    alignSelf: 'center',
    marginBottom: n.spacing.sm + 2,
  },

  // ── Header ────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: n.spacing.md,
    marginBottom: n.spacing.sm,
  },

  // ── Pinned current ────────────────────────────────────────────
  pinnedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: n.spacing.md,
    marginBottom: n.spacing.sm,
    paddingVertical: n.spacing.sm,
    paddingHorizontal: n.spacing.md - 4,
    borderRadius: n.radius.md,
    backgroundColor: accentAlpha['6'],
    borderWidth: 1,
    borderColor: accentAlpha['15'],
  },
  pinnedStripe: {
    width: 2.5,
    height: 24,
    borderRadius: 2,
    backgroundColor: n.colors.accent,
    marginRight: n.spacing.sm + 2,
  },
  pinnedBody: {
    flex: 1,
    minWidth: 0,
  },
  pinnedLabel: {
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  pinnedNameWeight: {
    fontWeight: '600',
  },
  pinnedBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: n.radius.sm - 2,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginLeft: n.spacing.sm - 2,
  },

  // ── Notices ───────────────────────────────────────────────────
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.xs + 1,
    marginHorizontal: n.spacing.md,
    paddingHorizontal: n.spacing.sm + 2,
    paddingVertical: n.spacing.xs + 2,
    marginBottom: n.spacing.xs + 2,
    borderRadius: n.radius.sm,
    backgroundColor: n.colors.surface,
  },
  noticeFlex: {
    flex: 1,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.xs + 1,
    marginHorizontal: n.spacing.md,
    paddingHorizontal: n.spacing.sm + 2,
    paddingVertical: n.spacing.xs + 2,
    marginBottom: n.spacing.xs + 2,
    borderRadius: n.radius.sm,
    backgroundColor: withAlpha(n.colors.warning, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(n.colors.warning, 0.15),
  },

  // ── Provider chip grid ────────────────────────────────────────
  chipScrollOuter: {
    marginBottom: n.spacing.xs,
  },
  chipScrollContent: {
    paddingHorizontal: n.spacing.md,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: n.spacing.xs + 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.xs + 1,
    paddingHorizontal: n.spacing.sm + 2,
    paddingVertical: n.spacing.xs + 2,
    borderRadius: n.radius.sm,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  // ── Search ────────────────────────────────────────────────────
  searchWrap: {
    paddingHorizontal: n.spacing.md,
  },
  searchField: {
    minHeight: 34,
    borderRadius: n.radius.sm,
  },

  // ── Model rows ────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.sm + 2,
    paddingVertical: n.spacing.sm + 3,
    paddingHorizontal: n.spacing.md,
  },
  rowActive: {
    backgroundColor: accentAlpha['8'],
  },
  rowStripe: {
    position: 'absolute',
    left: n.spacing.xs,
    top: n.spacing.sm,
    bottom: n.spacing.sm,
    width: 2.5,
    borderRadius: 2,
    backgroundColor: n.colors.accent,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowNameBold: {
    fontWeight: '600',
  },
  rowIdSub: {
    fontSize: 10,
    marginTop: 1,
    opacity: 0.6,
  },
  rowRadio: {
    width: 16,
    height: 16,
    borderRadius: n.radius.full,
    borderWidth: 1.5,
    borderColor: n.colors.border,
    flexShrink: 0,
  },

  // ── Separator ─────────────────────────────────────────────────
  separatorInset: {
    marginHorizontal: n.spacing.md,
  },

  // ── List ──────────────────────────────────────────────────────
  listContent: {
    paddingTop: 2,
    paddingBottom: n.spacing.lg,
  },

  // ── Empty ─────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: n.spacing.xs + 2,
    paddingVertical: n.spacing.xl,
  },
});
