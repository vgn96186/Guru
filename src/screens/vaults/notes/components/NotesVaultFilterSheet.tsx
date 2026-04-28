import { View, ScrollView, Pressable, Modal } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearText } from '../../../../components/primitives/LinearText';
import { styles, n } from '../styles';

interface NotesVaultFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  subjectFilter: string;
  setSubjectFilter: (filter: string) => void;
  subjectOptions: string[];
  topicFilter: string;
  setTopicFilter: (filter: string) => void;
  topicOptions: string[];
}

export default function NotesVaultFilterSheet({
  visible,
  onClose,
  subjectFilter,
  setSubjectFilter,
  subjectOptions,
  topicFilter,
  setTopicFilter,
  topicOptions,
}: NotesVaultFilterSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable
          style={styles.sheetBackdrop}
          onPress={onClose}
          accessibilityLabel="Close filter menu"
          accessibilityRole="button"
        />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <LinearText style={styles.sheetTitle}>Filter Notes</LinearText>
              <LinearText style={styles.sheetSubtitle}>
                Narrow down your vault by subject or topic.
              </LinearText>
            </View>
            <Pressable
              style={styles.sheetCloseBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={n.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
            {subjectFilter !== 'all' || topicFilter !== 'all' ? (
              <Pressable
                style={styles.clearFiltersBtn}
                onPress={() => {
                  setSubjectFilter('all');
                  setTopicFilter('all');
                  onClose();
                }}
                accessibilityRole="button"
              >
                <LinearText style={styles.clearFiltersText}>Clear Filters</LinearText>
              </Pressable>
            ) : null}

            {subjectOptions.length > 0 ? (
              <View style={styles.sheetSection}>
                <LinearText style={styles.sheetSectionTitle}>Subject</LinearText>
                <View style={styles.sheetOptions}>
                  <Pressable
                    style={[
                      styles.sheetOption,
                      subjectFilter === 'all' && styles.sheetOptionActive,
                    ]}
                    onPress={() => setSubjectFilter('all')}
                    accessibilityRole="button"
                  >
                    <LinearText
                      style={[
                        styles.sheetOptionText,
                        subjectFilter === 'all' && styles.sheetOptionTextActive,
                      ]}
                    >
                      All Subjects
                    </LinearText>
                    {subjectFilter === 'all' ? (
                      <Ionicons name="checkmark" size={18} color={n.colors.accent} />
                    ) : null}
                  </Pressable>
                  {subjectOptions.map((opt) => (
                    <Pressable
                      key={opt}
                      style={[
                        styles.sheetOption,
                        subjectFilter === opt && styles.sheetOptionActive,
                      ]}
                      onPress={() => setSubjectFilter(opt)}
                      accessibilityRole="button"
                    >
                      <LinearText
                        style={[
                          styles.sheetOptionText,
                          subjectFilter === opt && styles.sheetOptionTextActive,
                        ]}
                      >
                        {opt}
                      </LinearText>
                      {subjectFilter === opt ? (
                        <Ionicons name="checkmark" size={18} color={n.colors.accent} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {topicOptions.length > 0 ? (
              <View style={styles.sheetSection}>
                <LinearText style={styles.sheetSectionTitle}>Top Topics</LinearText>
                <View style={styles.sheetOptions}>
                  <Pressable
                    style={[styles.sheetOption, topicFilter === 'all' && styles.sheetOptionActive]}
                    onPress={() => setTopicFilter('all')}
                    accessibilityRole="button"
                  >
                    <LinearText
                      style={[
                        styles.sheetOptionText,
                        topicFilter === 'all' && styles.sheetOptionTextActive,
                      ]}
                    >
                      All Topics
                    </LinearText>
                    {topicFilter === 'all' ? (
                      <Ionicons name="checkmark" size={18} color={n.colors.accent} />
                    ) : null}
                  </Pressable>
                  {topicOptions.map((opt) => (
                    <Pressable
                      key={opt}
                      style={[styles.sheetOption, topicFilter === opt && styles.sheetOptionActive]}
                      onPress={() => setTopicFilter(opt)}
                      accessibilityRole="button"
                    >
                      <LinearText
                        style={[
                          styles.sheetOptionText,
                          topicFilter === opt && styles.sheetOptionTextActive,
                        ]}
                      >
                        {opt}
                      </LinearText>
                      {topicFilter === opt ? (
                        <Ionicons name="checkmark" size={18} color={n.colors.accent} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
