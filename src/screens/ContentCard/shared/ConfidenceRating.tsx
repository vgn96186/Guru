import React from 'react';
import {
  View,
  TouchableOpacity,
} from 'react-native';
import LinearText from '../../../components/primitives/LinearText';


import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';

export function ConfidenceRating({ onRate }: { onRate: (n: number) => void }) {
  return (
    <View style={s.ratingContainer}>
      <LinearText style={s.ratingTitle}>How well did you get this?</LinearText>
      <View style={s.ratingRow}>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.error }]}
          onPress={() => onRate(0)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.error, fontSize: 15 }]}>
            Not yet
          </LinearText>
          <LinearText style={s.ratingLabel}>😕</LinearText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.warning }]}
          onPress={() => onRate(1)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.warning, fontSize: 15 }]}>
            Will forget
          </LinearText>
          <LinearText style={s.ratingLabel}>🤔</LinearText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.success }]}
          onPress={() => onRate(3)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.success, fontSize: 15 }]}>
            Got it!
          </LinearText>
          <LinearText style={s.ratingLabel}>🔥</LinearText>
        </TouchableOpacity>
      </View>
    </View>
  );
}
