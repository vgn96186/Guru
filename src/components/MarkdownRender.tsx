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
    color: theme.colors.accentAlt,
    backgroundColor: theme.colors.warningTintSoft,
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
    marginBottom: theme.spacing.md,
  },
  bullet_list: {
    marginBottom: theme.spacing.md,
  },
  ordered_list: {
    marginBottom: theme.spacing.md,
  },
  bullet_list_icon: {
    marginLeft: 0,
    marginRight: theme.spacing.sm,
    color: theme.colors.primary,
  },
  ordered_list_icon: {
    marginLeft: 0,
    marginRight: theme.spacing.sm,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  list_item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  heading1: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h2.fontSize,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  heading2: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3.fontSize,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  heading3: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h4.fontSize,
    fontWeight: 'bold',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  code_inline: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  code_block: {
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.surfaceAlt,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    fontFamily: 'monospace',
    marginBottom: theme.spacing.md,
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    paddingLeft: theme.spacing.md,
    marginBottom: theme.spacing.md,
    fontStyle: 'italic',
    color: theme.colors.textMuted,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
