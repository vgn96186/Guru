import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { flagContentWithReason, type FlagReason } from '../db/queries/contentFlags';
import type { ContentType } from '../types';
import { linearTheme as n } from '../theme/linearTheme';

const FLAG_REASONS: Array<{ label: string; value: FlagReason }> = [
  { label: 'Incorrect medical fact', value: 'incorrect_fact' },
  { label: 'Outdated information', value: 'outdated_info' },
  { label: 'Wrong drug dosage', value: 'wrong_dosage' },
  { label: 'Missing key concept', value: 'missing_concept' },
  { label: 'Other', value: 'other' },
];

interface ContentFlagButtonProps {
  topicId: number;
  contentType: ContentType;
}

export function ContentFlagButton({ topicId, contentType }: ContentFlagButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState('');
  const [flagging, setFlagging] = useState(false);

  const handleFlag = async () => {
    if (!selectedReason) {
      Alert.alert('Select a reason', 'Please select why you are flagging this content.');
      return;
    }

    setFlagging(true);
    try {
      await flagContentWithReason(topicId, contentType, selectedReason, note || undefined);
      setShowModal(false);
      setSelectedReason(null);
      setNote('');
      Alert.alert('Flagged', 'Thank you for the feedback. This content will be reviewed.');
    } catch (err) {
      Alert.alert('Error', 'Failed to flag content. Please try again.');
    } finally {
      setFlagging(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setShowModal(true)}
        style={styles.flagButton}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        accessibilityLabel="Flag content"
      >
        <Ionicons name="flag-outline" size={16} color={n.colors.error} />
      </Pressable>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Flag Content</Text>
            <Text style={styles.modalSubtitle}>What's wrong with this content?</Text>

            {FLAG_REASONS.map((reason) => (
              <Pressable
                key={reason.value}
                style={[
                  styles.reasonOption,
                  selectedReason === reason.value && styles.reasonOptionSelected,
                ]}
                onPress={() => setSelectedReason(reason.value)}
              >
                <Ionicons
                  name={selectedReason === reason.value ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedReason === reason.value ? n.colors.accent : n.colors.textMuted}
                />
                <Text style={styles.reasonLabel}>{reason.label}</Text>
              </Pressable>
            ))}

            {selectedReason === 'other' && (
              <TextInput
                style={styles.noteInput}
                placeholder="Describe the issue..."
                placeholderTextColor={n.colors.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
              />
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitButton, flagging && styles.submitButtonDisabled]}
                onPress={handleFlag}
                disabled={flagging || !selectedReason}
              >
                <Text style={styles.submitText}>{flagging ? 'Flagging...' : 'Submit Flag'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flagButton: { padding: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: n.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: n.colors.textPrimary, marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: n.colors.textMuted, marginBottom: 16 },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  reasonOptionSelected: { backgroundColor: `${n.colors.accent}15` },
  reasonLabel: { fontSize: 15, color: n.colors.textPrimary, marginLeft: 12 },
  noteInput: {
    backgroundColor: n.colors.background,
    borderRadius: 8,
    padding: 12,
    color: n.colors.textPrimary,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 16,
    minHeight: 60,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { fontSize: 15, color: n.colors.textMuted },
  submitButton: {
    backgroundColor: n.colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
});
