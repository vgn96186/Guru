import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { getBrainDumps, clearBrainDumps, BrainDumpLog } from '../db/queries/brainDumps';

type Props = NativeStackScreenProps<RootStackParamList, 'BrainDumpReview'>;

export default function BrainDumpReviewScreen({ navigation }: Props) {
    const [dumps, setDumps] = useState<BrainDumpLog[]>([]);

    useEffect(() => {
        setDumps(getBrainDumps());
    }, []);

    const handleClear = () => {
        clearBrainDumps();
        setDumps([]);
        navigation.popToTop(); // Head home after clearing
    };

    const handleDone = () => {
        navigation.popToTop();
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Parked Thoughts</Text>
                <Text style={styles.subtitle}>You safely deferred these while studying.</Text>
            </View>

            {dumps.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="checkmark-circle-outline" size={64} color="#4CAF50" />
                    <Text style={styles.emptyText}>No thoughts parked this session.</Text>
                </View>
            ) : (
                <FlatList
                    data={dumps}
                    keyExtractor={v => v.id.toString()}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <Ionicons name="chatbubble-ellipses-outline" size={24} color="#6C63FF" style={styles.icon} />
                            <Text style={styles.cardText}>{item.note}</Text>
                        </View>
                    )}
                />
            )}

            <View style={styles.actions}>
                {dumps.length > 0 && (
                    <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
                        <Ionicons name="trash-outline" size={20} color="#F44336" />
                        <Text style={styles.clearText}>Clear All</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
                    <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F14',
        padding: 20,
        paddingTop: 60,
    },
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#9E9E9E',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: '#9E9E9E',
        fontSize: 18,
        marginTop: 16,
    },
    listContent: {
        paddingBottom: 20,
    },
    card: {
        backgroundColor: '#1A1A24',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333344',
    },
    icon: {
        marginRight: 16,
    },
    cardText: {
        color: '#FFF',
        fontSize: 16,
        flex: 1,
        lineHeight: 24,
    },
    actions: {
        flexDirection: 'row',
        marginTop: 'auto',
        paddingVertical: 16,
        gap: 16,
    },
    clearBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#332222',
        padding: 16,
        borderRadius: 16,
        gap: 8,
    },
    clearText: {
        color: '#F44336',
        fontSize: 16,
        fontWeight: 'bold',
    },
    doneBtn: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6C63FF',
        padding: 16,
        borderRadius: 16,
    },
    doneText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
