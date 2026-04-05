import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { linearTheme as n } from '../theme/linearTheme';

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
  const { width, height } = useWindowDimensions();
  const normalizedContent = normalizeRenderableMarkdown(content);
  const mergedStyles = compact
    ? {
        ...markdownStyles,
        paragraph: { ...markdownStyles.paragraph, marginBottom: 0, marginTop: 0 },
        body: { ...markdownStyles.body, marginBottom: 0 },
      }
    : markdownStyles;
  const rules = React.useMemo(
    () => ({
      strong: (node: any, children: React.ReactNode, _parent: any, styles: any) => (
        <Text key={node.key} textBreakStrategy="simple" style={[baseTextStyle.text, styles.strong]}>
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
            textBreakStrategy="simple"
            style={[
              baseTextStyle.text,
              inheritedStyles,
              styles.text,
              isInsideStrong ? styles.strong : null,
            ]}
          >
            {node.content}
          </Text>
        );
      },
    }),
    [],
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Markdown key={`${width}x${height}`} style={mergedStyles} rules={rules}>
        {normalizedContent}
      </Markdown>
    </View>
  );
});

const baseTextStyle = StyleSheet.create({
  text: {
    includeFontPadding: false,
    paddingRight: 2,
  },
});

const markdownStyles: any = {
  body: {
    color: n.colors.textMuted,
    fontSize: 17,
    lineHeight: 28,
    paddingRight: 2,
    minWidth: 0,
    flexShrink: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  text: {
    color: n.colors.textMuted,
    fontSize: 17,
    lineHeight: 28,
    paddingRight: 2,
    minWidth: 0,
    flexShrink: 1,
  },
  strong: {
    color: n.colors.warning,
    fontWeight: '900',
  },
  em: {
    fontStyle: 'italic',
  },
  link: {
    color: n.colors.accent,
    textDecorationLine: 'underline',
  },
  paragraph: {
    marginBottom: 10,
    minWidth: 0,
    flexShrink: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  bullet_list: {
    marginBottom: 10,
    minWidth: 0,
    width: '100%',
  },
  ordered_list: {
    marginBottom: 10,
    minWidth: 0,
    width: '100%',
  },
  bullet_list_icon: {
    marginLeft: 0,
    marginRight: n.spacing.sm,
    color: n.colors.accent,
  },
  ordered_list_icon: {
    marginLeft: 0,
    marginRight: n.spacing.sm,
    color: n.colors.accent,
    fontWeight: '600',
  },
  list_item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: n.spacing.xs,
    minWidth: 0,
    width: '100%',
  },
  bullet_list_content: {
    flex: 1,
    minWidth: 0,
  },
  ordered_list_content: {
    flex: 1,
    minWidth: 0,
  },
  heading1: {
    color: n.colors.textPrimary,
    fontSize: n.typography.title.fontSize,
    fontWeight: 'bold',
    marginBottom: n.spacing.md,
    marginTop: n.spacing.lg,
  },
  heading2: {
    color: n.colors.textPrimary,
    fontSize: n.typography.sectionTitle.fontSize,
    fontWeight: 'bold',
    marginBottom: n.spacing.md,
    marginTop: n.spacing.md,
  },
  heading3: {
    color: n.colors.textPrimary,
    fontSize: n.typography.sectionTitle.fontSize,
    fontWeight: 'bold',
    marginBottom: n.spacing.sm,
    marginTop: n.spacing.md,
  },
  code_inline: {
    color: n.colors.accent,
    backgroundColor: n.colors.surface,
    paddingHorizontal: n.spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'Inter_400Regular',
  },
  code_block: {
    color: n.colors.textSecondary,
    backgroundColor: n.colors.surface,
    padding: n.spacing.md,
    borderRadius: n.radius.sm,
    fontFamily: 'Inter_400Regular',
    marginBottom: n.spacing.md,
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: n.colors.accent,
    paddingLeft: n.spacing.md,
    marginBottom: n.spacing.md,
    fontStyle: 'italic',
    color: n.colors.textMuted,
  },
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    minWidth: 0,
    flexShrink: 1,
  },
  /** Fills the keypoint row column so markdown text measures to full usable width. */
  containerCompact: {
    width: '100%',
  },
});
