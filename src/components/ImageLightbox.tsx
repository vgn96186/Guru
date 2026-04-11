import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showToast } from './Toast';
import { showError } from './dialogService';
import { saveImageToDeviceGallery } from '../utils/saveImageToGallery';
import { ResilientImage } from './ResilientImage';

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  /** Optional style for the image (e.g. aspect ratio). */
  imageStyle?: ImageStyle;
};

export function ImageLightbox({ visible, uri, onClose, imageStyle }: Props) {
  const [saving, setSaving] = useState(false);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const handleSave = useCallback(async () => {
    if (!uri || saving) return;
    setSaving(true);
    try {
      await saveImageToDeviceGallery(uri);
      showToast('Image saved to your gallery', 'success');
    } catch (e) {
      showError(e, 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [uri, saving]);

  if (!visible || !uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Pressable
          style={[styles.saveBtn, { top: viewportHeight * 0.06 }]}
          onPress={handleSave}
          disabled={saving}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Save image to gallery"
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="download-outline" size={26} color="#fff" />
          )}
        </Pressable>
        <Pressable
          style={[styles.closeBtn, { top: viewportHeight * 0.06 }]}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close enlarged image"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <View
          style={[styles.imageWrap, { width: viewportWidth, maxHeight: viewportHeight * 0.88 }]}
          pointerEvents="box-none"
        >
          <ResilientImage
            uri={uri}
            style={[
              styles.image,
              { width: viewportWidth - 16, height: viewportHeight * 0.78 },
              imageStyle,
            ]}
            resizeMode="contain"
            accessibilityLabel="Enlarged image"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 2,
    padding: 8,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
    padding: 8,
  },
  imageWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  image: {},
});
