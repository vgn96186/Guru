import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getAllCachedQuestions, type MockQuestion } from '../db/queries/aiCache';
import { getAllSubjects } from '../db/queries/topics';
import { addXp } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';

const BOSS_HP = 100;
const PLAYER_HP = 3;
const DAMAGE_PER_HIT = 10;

export default function BossBattleScreen() {
  const navigation = useNavigation();
  const refreshProfile = useAppStore(s => s.refreshProfile);
  const [phase, setPhase] = useState<'select' | 'battle' | 'victory' | 'defeat'>('select');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  
  const [bossHp, setBossHp] = useState(BOSS_HP);
  const [playerHp, setPlayerHp] = useState(PLAYER_HP);
  
  const shakeAnim = useRef(new Animated.Value(0)).current;

  function startBattle(subjectName: string) {
    const all = getAllCachedQuestions();
    // Filter by subject if enough questions, otherwise take mixed
    let subjectQs = all.filter(q => q.subjectName === subjectName);
    if (subjectQs.length < 5) {
      Alert.alert('Not enough questions', `Study more ${subjectName} topics to unlock this boss! (Need 5+ questions, have ${subjectQs.length})`);
      return;
    }
    // Shuffle
    subjectQs = subjectQs.sort(() => 0.5 - Math.random()).slice(0, 15); // max 15 q per battle
    
    setSelectedSubject(subjectName);
    setQuestions(subjectQs);
    setBossHp(BOSS_HP);
    setPlayerHp(PLAYER_HP);
    setCurrentQ(0);
    setPhase('battle');
  }

  function handleAnswer(idx: number) {
    const q = questions[currentQ];
    const isCorrect = idx === q.correctIndex;

    if (isCorrect) {
      const newBossHp = Math.max(0, bossHp - DAMAGE_PER_HIT);
      setBossHp(newBossHp);
      if (newBossHp === 0) {
        setPhase('victory');
        addXp(500); // Big reward
        refreshProfile();
      } else {
        nextQuestion();
      }
    } else {
      shakeScreen();
      const newPlayerHp = playerHp - 1;
      setPlayerHp(newPlayerHp);
      if (newPlayerHp === 0) {
        setPhase('defeat');
      } else {
        nextQuestion();
      }
    }
  }

  function nextQuestion() {
    if (currentQ + 1 < questions.length) {
      setCurrentQ(c => c + 1);
    } else {
      // Ran out of questions but boss still alive?
      // Stalemate / Retreat
      Alert.alert('Out of ammo!', 'You ran out of questions before defeating the boss. Retreat!', [
        { text: 'Run Away', onPress: () => navigation.goBack() }
      ]);
    }
  }

  function shakeScreen() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  if (phase === 'select') {
    const subjects = getAllSubjects();
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>←</Text></TouchableOpacity>
          <Text style={styles.title}>Select Boss</Text>
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {subjects.map(s => (
            <TouchableOpacity 
              key={s.id} 
              style={[styles.subjectCard, { borderColor: s.colorHex }]}
              onPress={() => startBattle(s.name)}
            >
              <Text style={styles.subjectEmoji}>👹</Text>
              <Text style={[styles.subjectName, { color: s.colorHex }]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'victory') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emoji}>🏆</Text>
          <Text style={styles.title}>BOSS DEFEATED!</Text>
          <Text style={styles.sub}>You conquered {selectedSubject}!</Text>
          <Text style={styles.xp}>+500 XP</Text>
          <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
            <Text style={styles.btnText}>Victory Lap</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'defeat') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emoji}>💀</Text>
          <Text style={styles.title}>YOU DIED</Text>
          <Text style={styles.sub}>The {selectedSubject} boss was too strong.</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#F44336' }]} onPress={() => setPhase('select')}>
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Battle Phase
  const q = questions[currentQ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#2A0A0A" />
      <Animated.View style={[styles.battleContainer, { transform: [{ translateX: shakeAnim }] }]}>
        
        {/* HUD */}
        <View style={styles.hud}>
          <View style={styles.bossBar}>
            <Text style={styles.bossName}>{selectedSubject} BOSS</Text>
            <View style={styles.hpTrack}>
              <View style={[styles.hpFill, { width: `${(bossHp / BOSS_HP) * 100}%` }]} />
            </View>
            <Text style={styles.hpText}>{bossHp}/{BOSS_HP}</Text>
          </View>
          
          <View style={styles.playerStats}>
            <Text style={styles.hearts}>{'❤️'.repeat(playerHp)}</Text>
          </View>
        </View>

        {/* Question */}
        <ScrollView contentContainerStyle={styles.qContainer}>
          <Text style={styles.qText}>{q.question}</Text>
          <View style={styles.options}>
            {q.options.map((opt, i) => (
              <TouchableOpacity 
                key={i} 
                style={styles.optionBtn}
                onPress={() => handleAnswer(i)}
              >
                <Text style={styles.optionText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 },
  back: { color: '#fff', fontSize: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12, justifyContent: 'center' },
  subjectCard: { width: '45%', backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 2, marginBottom: 4 },
  subjectEmoji: { fontSize: 32, marginBottom: 8 },
  subjectName: { fontWeight: '800', fontSize: 14, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emoji: { fontSize: 80, marginBottom: 20 },
  sub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  xp: { color: '#FF9800', fontSize: 24, fontWeight: '900', marginBottom: 40 },
  btn: { backgroundColor: '#6C63FF', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  
  battleContainer: { flex: 1, backgroundColor: '#1A0505' },
  hud: { padding: 16, backgroundColor: '#2A0A0A', borderBottomWidth: 2, borderBottomColor: '#F44336' },
  bossBar: { marginBottom: 12 },
  bossName: { color: '#F44336', fontWeight: '900', fontSize: 16, marginBottom: 4, letterSpacing: 1 },
  hpTrack: { height: 16, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#555' },
  hpFill: { height: '100%', backgroundColor: '#F44336' },
  hpText: { color: '#fff', fontSize: 10, position: 'absolute', right: 4, top: 20 },
  playerStats: { alignItems: 'flex-end' },
  hearts: { fontSize: 24 },
  qContainer: { padding: 20 },
  qText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 26, marginBottom: 30, textAlign: 'center' },
  options: { gap: 12 },
  optionBtn: { backgroundColor: '#2A2A38', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#444' },
  optionText: { color: '#ddd', fontSize: 15, textAlign: 'center' },
});
