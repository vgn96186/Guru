import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import Pdf from 'react-native-pdf';
import type { MenuStackParamList } from '../navigation/types';
import ScreenHeader from '../components/ScreenHeader';
import ScreenShell from '../components/ScreenShell';
import LinearText from '../components/primitives/LinearText';
import { linearTheme as n } from '../theme/linearTheme';

type PdfViewerScreenRouteProp = RouteProp<MenuStackParamList, 'PdfViewer'>;

export default function PdfViewerScreen() {
  const route = useRoute<PdfViewerScreenRouteProp>();
  const uri = route.params?.uri;
  const title = route.params?.title;

  return (
    <ScreenShell scrollable={false} edges={['top', 'bottom']} style={styles.container}>
      <ScreenHeader title={title || 'PDF Viewer'} showBack />
      {uri ? (
        <Pdf source={{ uri, cache: true }} style={styles.pdf} />
      ) : (
        <View style={styles.empty}>
          <LinearText variant="body" tone="muted">
            Missing PDF URI.
          </LinearText>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: n.colors.background,
  },
  pdf: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: n.colors.surface,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
