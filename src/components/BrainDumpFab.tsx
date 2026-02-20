import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addBrainDump } from '../db/queries/brainDumps';

export default function BrainDumpFab() {
    const [modalVisible, setModalVisible] = useState(false);
    const [note, setNote] = useState('');

    const handleSave = () => {
        if (note.trim().length > 0) {
            addBrainDump(note);
        }
        setNote('');
        setModalVisible(false);
    };

    return (
        <>
            <TouchableOpacity
                style={styles.fab}
                onPress={() => setModalVisible(true)}
            >
                <Ionicons name="bulb" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Park a Thought 🧠</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#9E9E9E" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.subtitle}>
                            Offload distracting thoughts here. You can review them after your session.
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="e.g., Pay electricity bill..."
                            placeholderTextColor="#666"
                            value={note}
                            onChangeText={setNote}
                            multiline
                            autoFocus
                        />

                        <TouchableOpacity
                            style={[styles.saveButton, !note.trim() && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            disabled={!note.trim()}
                        >
                            <Text style={styles.saveText}>Park It</Text>
                        </TouchableOpacity>
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
        backgroundColor: '#6C63FF',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
        shadowColor: '#6C63FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 15, 20, 0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1A1A24',
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
        color: '#FFF',
    },
    subtitle: {
        fontSize: 14,
        color: '#9E9E9E',
        marginBottom: 20,
    },
    input: {
        backgroundColor: '#0F0F14',
        borderRadius: 12,
        padding: 16,
        color: '#FFF',
        fontSize: 16,
        minHeight: 100,
        textAlignVertical: 'top',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#333344',
    },
    saveButton: {
        backgroundColor: '#4CAF50',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        backgroundColor: '#333344',
    },
    saveText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    }
});
