import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { addBrainDump } from '../db/queries/brainDumps';
import { linearTheme as n } from '../theme/linearTheme';
import { navigationRef } from '../navigation/navigationRef';

export default function BrainDumpFab() {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 0) + 72;
  const [modalVisible, setModalVisible] = useState(false);
  const [note, setNote] = useState('');

  const scale = useSharedValue(1);

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onBegin(() => {
      scale.value = withSpring(0.9, { damping: 15, stiffness: 200 });
    })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
    })
    .onEnd(() => {
      setModalVisible(true);
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handleSave = async () => {
    if (note.trim().length > 0) {
      await addBrainDump(note);
    }
    setNote('');
    setModalVisible(false);
  };

  return (
    <>
      <GestureDetector gesture={tapGesture}>
        <Animated.View
          style={[styles.fab, { bottom: bottomOffset }, animatedStyle]}
          accessibilityRole="button"
          accessibilityLabel="Add quick note"
        >
          <Ionicons name="bulb" size={24} color={n.colors.textPrimary} />
        </Animated.View>
      </GestureDetector>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
        accessibilityViewIsModal
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 0) + 24 }]}>
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.title}>Park a Thought</Text>
                <Ionicons name="hardware-chip-outline" size={22} color={n.colors.textPrimary} />
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={n.colors.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.subtitle}>
              Offload distracting thoughts here. You can review them after your session.
            </Text>

            <Pressable
              style={styles.reviewLink}
              onPress={() => {
                setModalVisible(false);
                if (navigationRef.isReady()) {
                  navigationRef.navigate('BrainDumpReview');
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Review parked thoughts"
            >
              <Ionicons name="list-outline" size={18} color={n.colors.accent} />
              <Text style={styles.reviewLinkText}>Review parked thoughts</Text>
            </Pressable>

            <TextInput
              style={styles.input}
              placeholder="e.g., Pay electricity bill..."
              placeholderTextColor={n.colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
              autoFocus
            />

            <Pressable
              style={[styles.saveButton, !note.trim() && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!note.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save and park thought"
            >
              <Text style={styles.saveText}>Park It</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: n.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,2,4,0.72)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: n.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: n.colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: n.colors.textMuted,
    marginBottom: 12,
  },
  reviewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingVertical: 8,
  },
  reviewLinkText: {
    fontSize: 14,
    color: n.colors.accent,
    fontWeight: '600',
  },
  input: {
    backgroundColor: n.colors.background,
    borderRadius: 12,
    padding: 16,
    color: n.colors.textPrimary,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  saveButton: {
    backgroundColor: n.colors.success,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: n.colors.border,
  },
  saveText: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
