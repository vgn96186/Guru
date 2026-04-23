import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { fetchWikipediaImage } from '../../../services/imageService';
import { styles } from '../TopicDetailScreen.styles';

export function TopicImage({ topicName }: { topicName: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchWikipediaImage(topicName).then(setImageUrl);
  }, [topicName]);

  if (!imageUrl) return null;

  return <Image source={{ uri: imageUrl }} style={styles.topicImage} resizeMode="contain" />;
}
