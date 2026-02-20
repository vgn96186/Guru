import React, { useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withTiming,
    Easing,
    interpolateColor,
    useAnimatedStyle
} from 'react-native-reanimated';

// Create animated wrapper for Svg Circle
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface VisualTimerProps {
    totalSeconds: number;
    remainingSeconds: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    dangerColor?: string;
}

export default function VisualTimer({
    totalSeconds,
    remainingSeconds,
    size = 120,
    strokeWidth = 12,
    color = '#6C63FF',
    dangerColor = '#F44336'
}: VisualTimerProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    // Animation value represents percentage remaining (1 to 0)
    const progress = useSharedValue(remainingSeconds / totalSeconds);

    useEffect(() => {
        progress.value = withTiming(Math.max(0, remainingSeconds) / totalSeconds, {
            duration: 1000,
            easing: Easing.linear
        });
    }, [remainingSeconds, totalSeconds]);

    const animatedProps = useAnimatedProps(() => {
        const strokeDashoffset = circumference - circumference * progress.value;
        const stroke = interpolateColor(
            progress.value,
            [0, 0.15, 1], // Danger when <= 15%
            [dangerColor, dangerColor, color]
        );

        return {
            strokeDashoffset,
            stroke
        };
    });

    const minutes = Math.floor(Math.max(0, remainingSeconds) / 60);
    const seconds = Math.max(0, remainingSeconds) % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
                    {/* Background Track */}
                    <Circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke="#1A1A24"
                        strokeWidth={strokeWidth}
                        fill="transparent"
                    />
                    {/* Animated Progress Circle */}
                    <AnimatedCircle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        fill="transparent"
                        strokeLinecap="round"
                        animatedProps={animatedProps}
                    />
                </G>
            </Svg>
            {/* Time Text Overlay */}
            <View style={[styles.textContainer, StyleSheet.absoluteFill]}>
                <Text style={styles.timeText}>{timeString}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    textContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFF',
        fontVariant: ['tabular-nums'],
    }
});
