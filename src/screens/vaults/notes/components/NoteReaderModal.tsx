import { View, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { LinearText } from '../../../../components/primitives/LinearText';
import { MarkdownRender } from '../../../../components/MarkdownRender';
import { showInfo } from '../../../../components/Toast';
import { styles, n } from '../styles';
import type { NoteItem } from '../types';

interface NoteReaderModalProps {
  content: string | null;
  title: string;
  note: NoteItem | null;
  onClose: () => void;
  onAskGuru: (note: NoteItem) => void;
}

export default function NoteReaderModal({
  content,
  title,
  note,
  onClose,
  onAskGuru,
}: NoteReaderModalProps) {
  return (
    <Modal visible={!!content} animationType="slide" onRequestClose={onClose}>
      <View style={styles.readerContainer}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: n.colors.background }} />
        <View style={styles.readerHeader}>
          <TouchableOpacity onPress={onClose} style={styles.readerCloseBtn}>
            <Ionicons name="close" size={24} color={n.colors.textPrimary} />
          </TouchableOpacity>
          <LinearText style={styles.readerHeaderTitle} numberOfLines={1}>
            {title || 'Note'}
          </LinearText>
          <TouchableOpacity
            onPress={() => {
              if (content) {
                Clipboard.setStringAsync(content);
                void showInfo('Copied', 'Note copied to clipboard');
              }
            }}
            style={styles.readerCopyBtn}
          >
            <Ionicons name="copy-outline" size={20} color={n.colors.textMuted} />
          </TouchableOpacity>
        </View>
        {note ? (
          <TouchableOpacity
            style={styles.readerAskGuruBtn}
            onPress={() => onAskGuru(note)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Ask Guru from this note"
          >
            <Ionicons name="sparkles-outline" size={16} color={n.colors.accent} />
            <LinearText style={styles.readerAskGuruText}>Ask Guru From This Note</LinearText>
          </TouchableOpacity>
        ) : null}
        <ScrollView
          style={styles.readerScroll}
          contentContainerStyle={styles.readerScrollContent}
          showsVerticalScrollIndicator
        >
          <MarkdownRender content={content ?? ''} />
        </ScrollView>
      </View>
    </Modal>
  );
}
