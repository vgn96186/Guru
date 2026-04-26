import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { linearTheme as n } from '../theme/linearTheme';
import LinearText from './primitives/LinearText';

const PHONE_SIZE = 156;
const TABLET_SIZE = 220;
const TABLET_BREAKPOINT = 600;

interface SharedOrbShellProps {
  size?: number;
  color?: string;
  label?: string;
  sublabel?: string;
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
            { width: size, height: size, borderRadius: radius, backgroundColor: color },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
            <Svg width={size} height={size} viewBox="0 0 100 100">
              <Defs>
                <RadialGradient
                  id="shellColorGrad"
                  cx="45%"
                  cy="45%"
                  rx="55%"
                  ry="55%"
                  fx="45%"
                  fy="45%"
                >
                  <Stop offset="0%" stopColor={n.colors.accent} stopOpacity="1" />
                  <Stop offset="60%" stopColor={n.colors.accent} stopOpacity="1" />
                  <Stop offset="100%" stopColor={n.colors.accent} stopOpacity="1" />
                </RadialGradient>
                <RadialGradient
                  id="shellLightGrad"
                  cx="30%"
                  cy="28%"
                  rx="65%"
                  ry="65%"
                  fx="30%"
                  fy="28%"
                >
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                  <Stop offset="35%" stopColor="#ffffff" stopOpacity="0.1" />
                  <Stop offset="65%" stopColor="#000000" stopOpacity="0.0" />
                  <Stop offset="85%" stopColor="#000000" stopOpacity="0.25" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill="url(#shellColorGrad)" />
              <Circle cx="50" cy="50" r="50" fill="url(#shellLightGrad)" />
            </Svg>
          </View>

          <Animated.View style={[styles.specularContainer, highlightAnimatedStyle]}>
            <Svg width={40} height={25} viewBox="0 0 40 25">
              <Defs>
                <RadialGradient id="shellSpecularHighlight" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                  <Stop offset="60%" stopColor="#ffffff" stopOpacity="0.3" />
                  <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Ellipse cx="20" cy="12.5" rx="18" ry="10" fill="url(#shellSpecularHighlight)" />
            </Svg>
          </Animated.View>
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
  specularContainer: {
    position: 'absolute',
    top: '15%',
    left: '18%',
  },
  textLayer: {
    position: 'absolute',
    width: '90%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
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
