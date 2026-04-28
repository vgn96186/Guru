import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../../components/primitives/LinearText';
import { styles } from '../styles';

interface SelectionBannerProps {
  selectedCount: number;
  onCancel: () => void;
  onDelete: () => void;
}

export default function NotesVaultSelectionBanner({
  selectedCount,
  onCancel,
  onDelete,
}: SelectionBannerProps) {
  if (selectedCount === 0) return null;

  return (
    <View style={styles.selectionBanner}>
      <LinearText style={styles.selectionText}>{selectedCount} selected</LinearText>
      <View style={styles.selectionActions}>
        <Pressable style={styles.selectionCancelBtn} onPress={onCancel}>
          <LinearText style={styles.selectionCancelText}>Cancel</LinearText>
        </Pressable>
        <Pressable style={styles.selectionDeleteBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={14} color="#fff" />
          <LinearText style={styles.selectionDeleteText}>Delete</LinearText>
        </Pressable>
      </View>
    </View>
  );
}
