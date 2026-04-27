import React, { useEffect, useState } from 'react';
import { View, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearSurface, LinearText, LinearButton } from '../primitives';
import { linearTheme as n } from '../../theme/linearTheme';
import {
  requestIgnoreBatteryOptimizations,
  openSamsungDeviceCare,
  isIgnoringBatteryOptimizations,
} from '../../../modules/app-launcher';
import { markBatteryPromptShown } from '../../services/samsungBatteryPrompt';

export default function SamsungBatterySheet() {
  const navigation = useNavigation();
  const [isIgnoring, setIsIgnoring] = useState(false);

  useEffect(() => {
    isIgnoringBatteryOptimizations().then(setIsIgnoring);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        isIgnoringBatteryOptimizations().then(setIsIgnoring);
      }
    });
    return () => sub.remove();
  }, []);

  const handleAllowBackground = async () => {
    await requestIgnoreBatteryOptimizations();
  };

  const handleDeviceCare = async () => {
    await markBatteryPromptShown();
    await openSamsungDeviceCare();
  };

  const handleNotNow = async () => {
    await markBatteryPromptShown();
    navigation.goBack();
  };

  const handleDone = async () => {
    await markBatteryPromptShown();
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <LinearSurface compact style={styles.sheet}>
        <LinearText variant="title" style={styles.title}>
          Samsung Background Kills
        </LinearText>
        <LinearText variant="body" style={styles.body}>
          Samsung Device Care will aggressively kill the recording and overlay mid-lecture unless
          Guru is explicitly whitelisted.
        </LinearText>

        {!isIgnoring && (
          <LinearButton
            label="Step 1: Allow background (Android)"
            onPress={handleAllowBackground}
            variant="primary"
            style={styles.btn}
          />
        )}

        {isIgnoring && (
          <View style={styles.successBox}>
            <LinearText variant="label" style={styles.successText}>
              ✓ Android whitelist active
            </LinearText>
          </View>
        )}

        <LinearButton
          label={isIgnoring ? 'Step 2: Open Device Care' : 'Open Device Care'}
          onPress={handleDeviceCare}
          variant={isIgnoring ? 'primary' : 'secondary'}
          style={styles.btn}
        />
        <LinearText variant="label" style={styles.hint}>
          Tap 'Background usage limits' → 'Never sleeping apps' → add Guru
        </LinearText>

        <View style={styles.footerRow}>
          <LinearButton label="Not now" onPress={handleNotNow} variant="secondary" />
          <LinearButton
            label="Done"
            onPress={handleDone}
            variant={isIgnoring ? 'primary' : 'secondary'}
          />
        </View>
      </LinearSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    padding: n.spacing.lg,
    borderTopLeftRadius: n.radius.lg,
    borderTopRightRadius: n.radius.lg,
    backgroundColor: 'rgba(10, 12, 16, 0.98)',
  },
  title: {
    marginBottom: n.spacing.md,
  },
  body: {
    color: n.colors.textMuted,
    marginBottom: n.spacing.lg,
  },
  btn: {
    marginBottom: n.spacing.sm,
  },
  hint: {
    color: n.colors.textMuted,
    textAlign: 'center',
    marginBottom: n.spacing.lg,
  },
  successBox: {
    backgroundColor: n.colors.surface,
    padding: n.spacing.md,
    borderRadius: n.radius.md,
    marginBottom: n.spacing.md,
    alignItems: 'center',
  },
  successText: {
    color: n.colors.success,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: n.spacing.md,
  },
});
