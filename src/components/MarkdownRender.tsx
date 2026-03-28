import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { theme } from '../constants/theme';

interface MarkdownRenderProps {
  content: string;
  compact?: boolean;
}

function normalizeRenderableMarkdown(content: string): string {
  return (content ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\u200C/g, '')
    .replace(/\u200D/g, '')
    .replace(/\u2060/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export const MarkdownRender = React.memo(function MarkdownRender({
  content,
  compact,
}: MarkdownRenderProps) {
  const normalizedContent = normalizeRenderableMarkdown(content);
  const mergedStyles = compact
    ? {
        ...markdownStyles,
        paragraph: { marginBottom: 0, marginTop: 0 },
        body: { ...markdownStyles.body, marginBottom: 0 },
      }
    : markdownStyles;
  const rules = React.useMemo(
    () => ({
      strong: (node: any, children: React.ReactNode, _parent: any, styles: any) => (
        <Text key={node.key} style={styles.strong}>
          {children}
        </Text>
      ),
      text: (
        node: any,
        _children: React.ReactNode,
        parent: Array<{ type: string }>,
        styles: any,
        inheritedStyles: any = {},
      ) => {
        const isInsideStrong =
          Array.isArray(parent) && parent.some((entry) => entry.type === 'strong');
        return (
          <Text
            key={node.key}
            style={[inheritedStyles, styles.text, isInsideStrong ? styles.strong : null]}
          >
            {node.content}
          </Text>
        );
      },
    }),
    [],
  );

  return (
    <View style={styles.container}>
      <Markdown style={mergedStyles} rules={rules}>
        {normalizedContent}
      </Markdown>
    </View>
  );
});

const markdownStyles: any = {
  body: {
    color: '#A9B2C6',
    fontSize: 17,
    lineHeight: 28,
    flexShrink: 1,
  },
  text: {
    color: '#A9B2C6',
    fontSize: 17,
    lineHeight: 28,
    flexShrink: 1,
  },
  strong: {
    color: '#F3DF84',
    fontWeight: '900',
  },
  em: {
    fontStyle: 'italic',
  },
  link: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  paragraph: {
    marginBottom: 10,
    flexShrink: 1,
  },
  bullet_list: {
    marginBottom: 10,
  },
  ordered_list: {
    marginBottom: 10,
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
    alignSelf: 'stretch',
    minWidth: 0,
    flexShrink: 1,
  },
});
