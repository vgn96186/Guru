import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import { useFocusEffect } from '@react-navigation/native';
import BannerSearchBar from '../components/BannerSearchBar';
import ScreenHeader from '../components/ScreenHeader';
import { ImageLightbox } from '../components/ImageLightbox';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import LinearSurface from '../components/primitives/LinearSurface';
import {
  listGeneratedStudyImages,
  type GeneratedStudyImageContextType,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../db/queries/generatedStudyImages';

type StyleFilter = 'all' | GeneratedStudyImageStyle;
type ContextFilter = 'all' | GeneratedStudyImageContextType;

const STYLE_FILTERS: ReadonlyArray<{ id: StyleFilter; label: string }> = [
  { id: 'all', label: 'All styles' },
  { id: 'illustration', label: 'Illustrations' },
  { id: 'chart', label: 'Charts' },
];

const CONTEXT_FILTERS: ReadonlyArray<{ id: ContextFilter; label: string }> = [
  { id: 'all', label: 'All sources' },
  { id: 'chat', label: 'Chat' },
  { id: 'topic_note', label: 'Topic notes' },
  { id: 'lecture_note', label: 'Lecture notes' },
];

const CONTEXT_LABELS: Record<GeneratedStudyImageContextType, string> = {
  chat: 'Chat',
  topic_note: 'Topic note',
  lecture_note: 'Lecture note',
};

const STYLE_LABELS: Record<GeneratedStudyImageStyle, string> = {
  illustration: 'Illustration',
  chart: 'Chart',
};

function formatRelativeDate(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - ts;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function matchesSearch(image: GeneratedStudyImageRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    image.topicName,
    image.prompt,
    image.provider,
    image.modelUsed,
    CONTEXT_LABELS[image.contextType],
    STYLE_LABELS[image.style],
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export default function ImageVaultScreen() {
  const [images, setImages] = useState<GeneratedStudyImageRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState<StyleFilter>('all');
  const [contextFilter, setContextFilter] = useState<ContextFilter>('all');
  const [selectedImage, setSelectedImage] = useState<GeneratedStudyImageRecord | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const loadImages = useCallback(async () => {
    const rows = await listGeneratedStudyImages(600);
    setImages(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadImages();
    }, [loadImages]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadImages();
    } finally {
      setRefreshing(false);
    }
  }, [loadImages]);

  const visibleImages = useMemo(() => {
    return images.filter((image) => {
      if (styleFilter !== 'all' && image.style !== styleFilter) return false;
      if (contextFilter !== 'all' && image.contextType !== contextFilter) return false;
      return matchesSearch(image, searchQuery);
    });
  }, [contextFilter, images, searchQuery, styleFilter]);

  const illustrationCount = useMemo(
    () => images.filter((image) => image.style === 'illustration').length,
    [images],
  );
  const chartCount = useMemo(
    () => images.filter((image) => image.style === 'chart').length,
    [images],
  );
  const hasActiveFilters = styleFilter !== 'all' || contextFilter !== 'all';
  const hasActiveSearch = searchQuery.trim().length > 0;
  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (styleFilter !== 'all') {
      parts.push(STYLE_LABELS[styleFilter]);
    }
    if (contextFilter !== 'all') {
      parts.push(CONTEXT_LABELS[contextFilter]);
    }
    return parts.length > 0 ? parts.join(' / ') : 'All styles / all sources';
  }, [contextFilter, styleFilter]);

  const copyPrompt = useCallback((prompt: string) => {
    Clipboard.setString(prompt);
    Haptics.selectionAsync();
  }, []);

  const renderImageCard = useCallback(
    ({ item }: { item: GeneratedStudyImageRecord }) => (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => setSelectedImage(item)}
      >
        <Image source={{ uri: item.localUri }} style={styles.thumbnail} resizeMode="cover" />
        <View style={styles.cardBody}>
          <View style={styles.cardChipRow}>
            <View
              style={[
                styles.metaChip,
                item.style === 'chart' ? styles.chartChip : styles.illustrationChip,
              ]}
            >
              <LinearText style={styles.metaChipText}>{STYLE_LABELS[item.style]}</LinearText>
            </View>
            <View style={styles.metaChip}>
              <LinearText style={styles.metaChipText}>
                {CONTEXT_LABELS[item.contextType]}
              </LinearText>
            </View>
          </View>

          <LinearText style={styles.cardTitle} numberOfLines={2}>
            {item.topicName}
          </LinearText>
          <LinearText style={styles.cardMeta} numberOfLines={1}>
            {item.provider} • {item.modelUsed}
          </LinearText>
          <View style={styles.cardFooter}>
            <LinearText style={styles.cardDate}>{formatRelativeDate(item.createdAt)}</LinearText>
            <TouchableOpacity
              style={styles.inlineIconBtn}
              onPress={() => copyPrompt(item.prompt)}
              accessibilityRole="button"
              accessibilityLabel="Copy image prompt"
            >
              <Ionicons name="copy-outline" size={15} color={n.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    ),
    [copyPrompt],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ErrorBoundary>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.flex}>
          <FlatList
            data={visibleImages}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            renderItem={renderImageCard}
            columnWrapperStyle={styles.columnWrap}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <>
                <ScreenHeader
                  title="Image Vault"
                  subtitle={`${images.length} AI-generated image${images.length !== 1 ? 's' : ''} saved`}
                  containerStyle={styles.headerCompact}
                  titleStyle={styles.headerTitleCompact}
                  subtitleStyle={styles.headerSubtitleCompact}
                  searchElement={
                    <BannerSearchBar
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search topic, prompt, provider..."
                    />
                  }
                ></ScreenHeader>

                <View style={styles.summaryRow}>
                  <LinearSurface compact padded={false} style={styles.summaryCard}>
                    <LinearText style={styles.summaryValue}>{images.length}</LinearText>
                    <LinearText style={styles.summaryLabel}>Total</LinearText>
                  </LinearSurface>
                  <LinearSurface compact padded={false} style={styles.summaryCard}>
                    <LinearText style={styles.summaryValue}>{illustrationCount}</LinearText>
                    <LinearText style={styles.summaryLabel}>Illustrations</LinearText>
                  </LinearSurface>
                  <LinearSurface compact padded={false} style={styles.summaryCard}>
                    <LinearText style={styles.summaryValue}>{chartCount}</LinearText>
                    <LinearText style={styles.summaryLabel}>Charts</LinearText>
                  </LinearSurface>
                </View>

                <View style={styles.resultsRow}>
                  <View style={styles.resultsCopy}>
                    <LinearText style={styles.resultsTitle}>
                      {visibleImages.length} result{visibleImages.length !== 1 ? 's' : ''}
                    </LinearText>
                    <LinearText style={styles.resultsSubtitle} numberOfLines={1}>
                      {activeFilterSummary}
                    </LinearText>
                  </View>
                  {hasActiveFilters || hasActiveSearch ? (
                    <TouchableOpacity
                      style={styles.clearFiltersBtn}
                      onPress={() => {
                        setSearchQuery('');
                        setStyleFilter('all');
                        setContextFilter('all');
                      }}
                    >
                      <LinearText style={styles.clearFiltersText}>Clear</LinearText>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  {STYLE_FILTERS.map((filter) => (
                    <TouchableOpacity
                      key={filter.id}
                      style={[
                        styles.filterBtn,
                        styleFilter === filter.id && styles.filterBtnActive,
                      ]}
                      onPress={() => setStyleFilter(filter.id)}
                      activeOpacity={0.8}
                    >
                      <LinearText
                        style={[
                          styles.filterBtnText,
                          styleFilter === filter.id && styles.filterBtnTextActive,
                        ]}
                      >
                        {filter.label}
                      </LinearText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.filterRow, styles.filterRowTight]}
                >
                  {CONTEXT_FILTERS.map((filter) => (
                    <TouchableOpacity
                      key={filter.id}
                      style={[
                        styles.filterBtn,
                        contextFilter === filter.id && styles.filterBtnActive,
                      ]}
                      onPress={() => setContextFilter(filter.id)}
                      activeOpacity={0.8}
                    >
                      <LinearText
                        style={[
                          styles.filterBtnText,
                          contextFilter === filter.id && styles.filterBtnTextActive,
                        ]}
                      >
                        {filter.label}
                      </LinearText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <LinearText style={styles.emptyEmoji}>🖼️</LinearText>
                <LinearText style={styles.emptyTitle}>No Images Saved</LinearText>
                <LinearText style={styles.emptySubtitle}>
                  Medical images you save during study sessions will appear here.
                </LinearText>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={n.colors.textPrimary}
              />
            }
          />

          <Modal
            visible={!!selectedImage}
            transparent
            animationType="slide"
            onRequestClose={() => setSelectedImage(null)}
          >
            <View style={styles.detailOverlay}>
              <LinearSurface padded={false} style={styles.detailSheet}>
                <View style={styles.detailHeader}>
                  <LinearText style={styles.detailTitle} numberOfLines={2}>
                    {selectedImage?.topicName ?? ''}
                  </LinearText>
                  <TouchableOpacity
                    onPress={() => setSelectedImage(null)}
                    style={styles.detailCloseBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Close image details"
                  >
                    <Ionicons name="close" size={20} color={n.colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.detailScrollContent}>
                  {selectedImage ? (
                    <>
                      <Pressable
                        style={styles.detailImageWrap}
                        onPress={() => setLightboxUri(selectedImage.localUri)}
                      >
                        <Image
                          source={{ uri: selectedImage.localUri }}
                          style={styles.detailImage}
                          resizeMode="cover"
                        />
                      </Pressable>

                      <View style={styles.detailMetaWrap}>
                        <View style={styles.detailChip}>
                          <LinearText style={styles.detailChipText}>
                            {STYLE_LABELS[selectedImage.style]}
                          </LinearText>
                        </View>
                        <View style={styles.detailChip}>
                          <LinearText style={styles.detailChipText}>
                            {CONTEXT_LABELS[selectedImage.contextType]}
                          </LinearText>
                        </View>
                        <View style={styles.detailChip}>
                          <LinearText style={styles.detailChipText}>
                            {formatRelativeDate(selectedImage.createdAt)}
                          </LinearText>
                        </View>
                      </View>

                      <LinearSurface padded={false} style={styles.detailInfoCard}>
                        <LinearText style={styles.detailInfoLabel}>Provider</LinearText>
                        <LinearText style={styles.detailInfoValue}>
                          {selectedImage.provider} • {selectedImage.modelUsed}
                        </LinearText>
                      </LinearSurface>

                      <LinearSurface padded={false} style={styles.promptCard}>
                        <View style={styles.promptHeader}>
                          <LinearText style={styles.promptTitle}>Prompt</LinearText>
                          <TouchableOpacity
                            style={styles.promptCopyBtn}
                            onPress={() => copyPrompt(selectedImage.prompt)}
                            accessibilityRole="button"
                            accessibilityLabel="Copy prompt"
                          >
                            <Ionicons
                              name="copy-outline"
                              size={15}
                              color={n.colors.textSecondary}
                            />
                            <LinearText style={styles.promptCopyText}>Copy</LinearText>
                          </TouchableOpacity>
                        </View>
                        <LinearText style={styles.promptText}>{selectedImage.prompt}</LinearText>
                      </LinearSurface>
                    </>
                  ) : null}
                </ScrollView>
              </LinearSurface>
            </View>
          </Modal>

          <ImageLightbox
            visible={!!lightboxUri}
            uri={lightboxUri}
            onClose={() => setLightboxUri(null)}
          />
        </ResponsiveContainer>
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: n.colors.background,
  },
  flex: {
    flex: 1,
  },
  headerCompact: {
    marginBottom: 12,
  },
  headerTitleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  headerSubtitleCompact: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: n.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  summaryValue: {
    color: n.colors.textPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  summaryLabel: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: n.colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
  },
  resultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  resultsCopy: {
    flex: 1,
    minWidth: 0,
  },
  resultsTitle: {
    color: n.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  resultsSubtitle: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  clearFiltersBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: n.colors.accent + '14',
    borderWidth: 1,
    borderColor: n.colors.accent + '32',
  },
  clearFiltersText: {
    color: n.colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  filterRow: {
    paddingTop: 6,
    paddingBottom: 4,
    gap: 8,
  },
  filterRowTight: {
    paddingTop: 2,
    paddingBottom: 12,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  filterBtnActive: {
    backgroundColor: `${n.colors.accent}1A`,
    borderColor: `${n.colors.accent}55`,
  },
  filterBtnText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  filterBtnTextActive: {
    color: n.colors.accent,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  columnWrap: {
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    flexBasis: '48%',
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.lg,
    borderWidth: 1,
    borderColor: n.colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardPressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.99 }],
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: n.colors.surface,
  },
  cardBody: {
    padding: 12,
    gap: 8,
  },
  cardChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  illustrationChip: {
    backgroundColor: 'rgba(108, 156, 255, 0.12)',
    borderColor: 'rgba(108, 156, 255, 0.35)',
  },
  chartChip: {
    backgroundColor: 'rgba(255, 193, 7, 0.14)',
    borderColor: 'rgba(255, 193, 7, 0.35)',
  },
  metaChipText: {
    color: n.colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  cardTitle: {
    color: n.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  cardMeta: {
    color: n.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardDate: {
    color: n.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  inlineIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.surface,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    marginTop: 40,
  },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 0,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: n.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 0,
  },
  detailOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,2,4,0.72)',
    padding: 12,
  },
  detailSheet: {
    maxHeight: '88%',
    borderRadius: 22,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  detailTitle: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  detailCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.surface,
  },
  detailScrollContent: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 28,
    gap: 14,
  },
  detailImageWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: n.colors.surface,
  },
  detailImage: {
    width: '100%',
    aspectRatio: 1,
  },
  detailMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  detailChipText: {
    color: n.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  detailInfoCard: {
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  detailInfoLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  detailInfoValue: {
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  promptCard: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promptTitle: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  promptCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  promptCopyText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  promptText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
