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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { ImageLightbox } from '../components/ImageLightbox';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { theme } from '../constants/theme';
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
              <Text style={styles.metaChipText}>{STYLE_LABELS[item.style]}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{CONTEXT_LABELS[item.contextType]}</Text>
            </View>
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.topicName}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {item.provider} • {item.modelUsed}
          </Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardDate}>{formatRelativeDate(item.createdAt)}</Text>
            <TouchableOpacity
              style={styles.inlineIconBtn}
              onPress={() => copyPrompt(item.prompt)}
              accessibilityRole="button"
              accessibilityLabel="Copy image prompt"
            >
              <Ionicons name="copy-outline" size={15} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    ),
    [copyPrompt],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScreenHeader
          title="Image Vault"
          subtitle={`${images.length} AI-generated image${images.length !== 1 ? 's' : ''} saved`}
        />

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{images.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{illustrationCount}</Text>
            <Text style={styles.summaryLabel}>Illustrations</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{chartCount}</Text>
            <Text style={styles.summaryLabel}>Charts</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search topic, prompt, provider..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
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
              style={[styles.filterBtn, styleFilter === filter.id && styles.filterBtnActive]}
              onPress={() => setStyleFilter(filter.id)}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.filterBtnText, styleFilter === filter.id && styles.filterBtnTextActive]}
              >
                {filter.label}
              </Text>
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
              style={[styles.filterBtn, contextFilter === filter.id && styles.filterBtnActive]}
              onPress={() => setContextFilter(filter.id)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterBtnText,
                  contextFilter === filter.id && styles.filterBtnTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {visibleImages.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {searchQuery || styleFilter !== 'all' || contextFilter !== 'all'
                ? 'No matching images'
                : 'No images yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || styleFilter !== 'all' || contextFilter !== 'all'
                ? 'Try a different search or filter.'
                : 'Generate illustrations or charts from Guru Chat or topic notes and they will appear here.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={visibleImages}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            renderItem={renderImageCard}
            columnWrapperStyle={styles.columnWrap}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.textPrimary}
              />
            }
          />
        )}

        <Modal
          visible={!!selectedImage}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedImage(null)}
        >
          <View style={styles.detailOverlay}>
            <View style={styles.detailSheet}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailTitle} numberOfLines={2}>
                  {selectedImage?.topicName ?? ''}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedImage(null)}
                  style={styles.detailCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close image details"
                >
                  <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
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
                        <Text style={styles.detailChipText}>
                          {STYLE_LABELS[selectedImage.style]}
                        </Text>
                      </View>
                      <View style={styles.detailChip}>
                        <Text style={styles.detailChipText}>
                          {CONTEXT_LABELS[selectedImage.contextType]}
                        </Text>
                      </View>
                      <View style={styles.detailChip}>
                        <Text style={styles.detailChipText}>
                          {formatRelativeDate(selectedImage.createdAt)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailInfoCard}>
                      <Text style={styles.detailInfoLabel}>Provider</Text>
                      <Text style={styles.detailInfoValue}>
                        {selectedImage.provider} • {selectedImage.modelUsed}
                      </Text>
                    </View>

                    <View style={styles.promptCard}>
                      <View style={styles.promptHeader}>
                        <Text style={styles.promptTitle}>Prompt</Text>
                        <TouchableOpacity
                          style={styles.promptCopyBtn}
                          onPress={() => copyPrompt(selectedImage.prompt)}
                          accessibilityRole="button"
                          accessibilityLabel="Copy prompt"
                        >
                          <Ionicons name="copy-outline" size={15} color={theme.colors.textSecondary} />
                          <Text style={styles.promptCopyText}>Copy</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.promptText}>{selectedImage.prompt}</Text>
                    </View>
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <ImageLightbox
          visible={!!lightboxUri}
          uri={lightboxUri}
          onClose={() => setLightboxUri(null)}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  summaryValue: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    padding: 0,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterRowTight: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterBtnActive: {
    backgroundColor: `${theme.colors.primary}1A`,
    borderColor: `${theme.colors.primary}55`,
  },
  filterBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterBtnTextActive: {
    color: theme.colors.primaryLight,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  columnWrap: {
    gap: 12,
  },
  card: {
    flex: 1,
    maxWidth: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardPressed: {
    opacity: theme.alpha.pressed,
    transform: [{ scale: 0.99 }],
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: theme.colors.surfaceAlt,
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
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  cardMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardDate: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  inlineIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 16,
  },
  emptySubtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  detailOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
    padding: 12,
  },
  detailSheet: {
    maxHeight: '88%',
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
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
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.surfaceAlt,
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
    backgroundColor: theme.colors.surfaceAlt,
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
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  detailChipText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  detailInfoCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 6,
  },
  detailInfoLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  detailInfoValue: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  promptCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promptTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  promptCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  promptCopyText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  promptText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
