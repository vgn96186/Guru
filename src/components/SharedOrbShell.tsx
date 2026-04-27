import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { linearTheme as n } from '../theme/linearTheme';
import LinearText from './primitives/LinearText';

const PHONE_SIZE = 156;
const TABLET_SIZE = 220;
const TABLET_BREAKPOINT = 600;

import { NativeLoadingOrbView } from '../../modules/app-launcher';

interface SharedOrbShellProps {
  size?: number;
  color?: string;
  label?: string;
  sublabel?: string;
  /** Whether to use the native liquid/turbulent shader (true) or static mercurial sphere (false) */
  isTurbulent?: boolean;
  /** Deformity intensity for turbulent mode (0.0 to 1.0) */
  pathIntensity?: number;
  /** Animated style for the orb body (scale, opacity, etc.) */
  bodyAnimatedStyle?: any;
  /** Animated style for the glow layer */
  glowAnimatedStyle?: any;
  /** Animated style for the specular highlight */
  highlightAnimatedStyle?: any;
  /** Animated style for the label text */
  labelAnimatedStyle?: any;
  /** Test ID for testing */
  testID?: string;
}


/**
 * Shared visual-only orb shell component used by StartButton and BootTransition.
 * This contains the 3D glass-sphere visual treatment without any interaction logic.
 */
const SharedOrbShell = React.memo(function SharedOrbShell({
  size: sizeProp,
  color = n.colors.accent,
  label = '',
  sublabel = '',
  isTurbulent = false,
  pathIntensity = 0,
  bodyAnimatedStyle,
  glowAnimatedStyle,
  highlightAnimatedStyle,
  labelAnimatedStyle,
  testID = 'shared-orb-shell',
}: SharedOrbShellProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const size = sizeProp || (isTablet ? TABLET_SIZE : PHONE_SIZE);
  const radius = size / 2;

  return (
    <View style={styles.container} testID={testID}>
      <Animated.View
        style={[
          styles.orbVisual,
          { width: size, height: size, borderRadius: radius },
          bodyAnimatedStyle,
        ]}
      >
        <Animated.View
          style={[
            styles.glowLayer,
            { width: size, height: size, borderRadius: radius, shadowColor: color },
            glowAnimatedStyle,
          ]}
        />

        <View
          style={[
            styles.orbCore,
            { width: size, height: size, borderRadius: radius },
            !isTurbulent && { backgroundColor: color, overflow: 'hidden' },
          ]}
        >
          {/* 
            Native High-Fidelity Mercurial Orb 
            isTurbulent=true → Liquid booting animation
            isTurbulent=false → Static mercurial sphere for StartButton
          */}
          <NativeLoadingOrbView
            isTurbulent={isTurbulent}
            pathIntensity={pathIntensity}
            style={[
              { position: 'absolute' },
              isTurbulent 
                ? { top: '-30%', left: '-30%', width: '160%', height: '160%' }
                : { top: '-20%', left: '-20%', width: '140%', height: '140%' },
            ]}
          />

        </View>
      </Animated.View>


      {(label || sublabel) && (
        <Animated.View style={[styles.textLayer, labelAnimatedStyle]} pointerEvents="none">
          {label ? (
            <LinearText
              variant="body"
              tone="inverse"
              style={[styles.label, isTablet && styles.labelTablet]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {label}
            </LinearText>
          ) : null}
          {sublabel ? (
            <LinearText
              variant="bodySmall"
              tone="muted"
              style={[styles.sublabel, isTablet && styles.sublabelTablet]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {sublabel}
            </LinearText>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbVisual: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 40,
    shadowOpacity: 1,
    elevation: 30,
  },
  orbCore: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 1.2,
    textAlign: 'center',
    width: '90%',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  labelTablet: {
    fontSize: 22,
    letterSpacing: 1.4,
  },
  sublabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    width: '90%',
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sublabelTablet: {
    fontSize: 15,
    marginTop: 8,
    lineHeight: 21,
  },
});

export default SharedOrbShell;
