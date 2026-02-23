import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'WakeUp'>;

type WakeUpPhase = 'breathe' | 'ground' | 'fog_check' | 'done';

export default function WakeUpScreen() {
  const navigation = useNavigation<Nav>();
  const [phase, setPhase] = useState<WakeUpPhase>('breathe');
  
  // Breathing
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const [breatheText, setBreatheText] = useState('Breathe In');
  const [breatheCycle, setBreatheCycle] = useState(0);

  // Grounding
  const [groundStep, setGroundStep] = useState(0);
  const groundingPrompts = [
    "Name 3 things you can see right now.",
    "Name 2 things you can feel (blanket, bed).",
    "Name 1 thing you can hear."
  ];

  useEffect(() => {
    if (phase === 'breathe') {
      const cycle = () => {
        if (breatheCycle >= 3) {
          setPhase('ground');
          return;
        }

        setBreatheText('Breathe In');
        Animated.timing(breatheAnim, { toValue: 2, duration: 4000, useNativeDriver: true }).start();
        
        setTimeout(() => {
          setBreatheText('Hold');
        }, 4000);

        setTimeout(() => {
          setBreatheText('Breathe Out');
          Animated.timing(breatheAnim, { toValue: 1, duration: 4000, useNativeDriver: true }).start();
        }, 8000);

        setTimeout(() => {
          setBreatheText('Hold');
        }, 12000);

        setTimeout(() => {
          setBreatheCycle(c => c + 1);
          cycle();
        }, 16000);
      };

      cycle();
    }
  }, [phase, breatheCycle]);

  function handleFogCheck(level: 'clear' | 'hazy' | 'foggy') {
    // Depending on level, we could route differently, but for now we'll route to CheckIn or Home
    // In a full implementation, 'foggy' might route to a 'ComebackScreen' or 'MicroSession'
    navigation.replace('CheckIn');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        
        {phase === 'breathe' && (
          <View style={styles.centerBox}>
            <Text style={styles.title}>Morning Intercept</Text>
            <Text style={styles.sub}>Before the dopamine hits, let's ground.</Text>
            
            <View style={styles.breatheBox}>
              <Animated.View style={[styles.breatheCircle, { transform: [{ scale: breatheAnim }] }]} />
              <Text style={styles.breatheText}>{breatheText}</Text>
            </View>
          </View>
        )}

        {phase === 'ground' && (
          <View style={styles.centerBox}>
            <Text style={styles.emoji}>🌱</Text>
            <Text style={styles.title}>Grounding</Text>
            <Text style={styles.groundText}>{groundingPrompts[groundStep]}</Text>
            
            <TouchableOpacity 
              style={styles.nextBtn} 
              onPress={() => {
                if (groundStep < groundingPrompts.length - 1) {
                  setGroundStep(s => s + 1);
                } else {
                  setPhase('fog_check');
                }
              }}
            >
              <Text style={styles.nextBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'fog_check' && (
          <View style={styles.centerBox}>
            <Text style={styles.emoji}>🧠</Text>
            <Text style={styles.title}>How is the brain fog today?</Text>
            
            <View style={styles.fogGrid}>
              <TouchableOpacity style={styles.fogBtn} onPress={() => handleFogCheck('clear')}>
                <Text style={styles.fogBtnEmoji}>☀️</Text>
                <Text style={styles.fogBtnText}>Actually Okay</Text>
                <Text style={styles.fogBtnSub}>Ready to start</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.fogBtn} onPress={() => handleFogCheck('hazy')}>
                <Text style={styles.fogBtnEmoji}>🌥️</Text>
                <Text style={styles.fogBtnText}>A Bit Hazy</Text>
                <Text style={styles.fogBtnSub}>Need a slow start</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.fogBtn} onPress={() => handleFogCheck('foggy')}>
                <Text style={styles.fogBtnEmoji}>☁️</Text>
                <Text style={styles.fogBtnText}>Very Foggy</Text>
                <Text style={styles.fogBtnSub}>Hard to think</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  centerBox: { alignItems: 'center' },
  emoji: { fontSize: 64, marginBottom: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  sub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 60 },
  
  breatheBox: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center' },
  breatheCircle: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: '#6C63FF33', borderWidth: 2, borderColor: '#6C63FF' },
  breatheText: { color: '#fff', fontSize: 18, fontWeight: '700', zIndex: 10 },
  
  groundText: { color: '#6C63FF', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20, lineHeight: 30 },
  nextBtn: { backgroundColor: '#1A1A24', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  fogGrid: { width: '100%', gap: 12, marginTop: 20 },
  fogBtn: { backgroundColor: '#1A1A24', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#2A2A38', flexDirection: 'row', alignItems: 'center' },
  fogBtnEmoji: { fontSize: 32, marginRight: 16 },
  fogBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
  fogBtnSub: { color: '#9E9E9E', fontSize: 12 },
});
