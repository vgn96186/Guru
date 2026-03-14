import React from 'react';
import { StyleSheet, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { theme } from '../constants/theme';

interface MarkdownRenderProps {
  content: string;
  compact?: boolean;
}

export const MarkdownRender = React.memo(function MarkdownRender({ content, compact }: MarkdownRenderProps) {
  const mergedStyles = compact
    ? { ...markdownStyles, paragraph: { marginBottom: 0, marginTop: 0 }, body: { ...markdownStyles.body, marginBottom: 0 } }
    : markdownStyles;

  return (
    <View style={styles.container}>
      <Markdown style={mergedStyles}>
        {content}
      </Markdown>
    </View>
  );
}

const markdownStyles: any = {
  body: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  strong: {
    color: '#FFD58A',
    backgroundColor: 'rgba(255, 213, 138, 0.15)',
    fontWeight: '800',
  },
  em: {
    fontStyle: 'italic',
  },
  link: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  paragraph: {
    marginBottom: 12,
  },
  bullet_list: {
    marginBottom: 12,
  },
  ordered_list: {
    marginBottom: 12,
  },
  bullet_list_icon: {
    marginLeft: 0,
    marginRight: 8,
    color: theme.colors.primary,
  },
  ordered_list_icon: {
    marginLeft: 0,
    marginRight: 8,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  list_item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  heading1: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    marginTop: 16,
  },
  heading2: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 14,
  },
  heading3: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 12,
  },
  code_inline: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  code_block: {
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    paddingLeft: 12,
    marginBottom: 12,
    fontStyle: 'italic',
    color: theme.colors.textMuted,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
