import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ImageStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showToast } from './Toast';
import { saveImageToDeviceGallery } from '../utils/saveImageToGallery';

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  /** Optional style for the image (e.g. aspect ratio). */
  imageStyle?: ImageStyle;
};

const { width: W, height: H } = Dimensions.get('window');

export function ImageLightbox({ visible, uri, onClose, imageStyle }: Props) {
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!uri || saving) return;
    setSaving(true);
    try {
      await saveImageToDeviceGallery(uri);
      showToast('Image saved to your gallery', 'success');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
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
          style={styles.saveBtn}
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
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close enlarged image"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <View style={styles.imageWrap} pointerEvents="box-none">
          <Image
            source={{ uri }}
            style={[styles.image, imageStyle]}
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
    top: H * 0.06,
    left: 16,
    zIndex: 2,
    padding: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: H * 0.06,
    right: 16,
    zIndex: 2,
    padding: 8,
  },
  imageWrap: {
    width: W,
    maxHeight: H * 0.88,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  image: {
    width: W - 16,
    height: H * 0.78,
  },
});
