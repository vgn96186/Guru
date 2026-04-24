import React, { useState, useEffect } from 'react';
import { Image } from 'react-native';
import { fetchWikipediaImage } from '../../../services/imageService';

import { s } from '../styles';

export interface TopicImageProps {
  topicName: string;
}
export const TopicImage = React.memo(function TopicImage({ topicName }: TopicImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchWikipediaImage(topicName).then((url) => {
      if (!active) return;
      setFailed(false);
      setImageUrl(url);
    });
    return () => {
      active = false;
    };
  }, [topicName]);

  if (!imageUrl) return null;
  if (failed) return null;

  return (
    <Image
      source={{ uri: imageUrl }}
      style={s.topicImage}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
});
