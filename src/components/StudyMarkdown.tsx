import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/theme';

interface StudyMarkdownProps {
  content: string;
  compact?: boolean;
}

type InlineToken = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

function normalizeContent(content: string): string {
  return (content ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\u200C/g, '')
    .replace(/\u200D/g, '')
    .replace(/\u2060/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, index) });
    }
    if (value.startsWith('**') && value.endsWith('**')) {
      tokens.push({ text: value.slice(2, -2), bold: true });
    } else if (value.startsWith('*') && value.endsWith('*')) {
      tokens.push({ text: value.slice(1, -1), italic: true });
    } else {
      tokens.push({ text: value });
    }
    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ text }];
}

function InlineText({ text, style }: { text: string; style: any }) {
  return (
    <Text style={style} textBreakStrategy="simple">
      {parseInline(text).map((token, index) => (
        <Text
          key={`${token.text}-${index}`}
          textBreakStrategy="simple"
          style={[token.bold && styles.bold, token.italic && styles.italic]}
        >
          {token.text}
        </Text>
      ))}
    </Text>
  );
}

export default function StudyMarkdown({ content, compact = false }: StudyMarkdownProps) {
  const normalized = normalizeContent(content);
  if (!normalized) return null;

  const lines = normalized.split('\n');
  const elements: React.ReactNode[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    const paragraph = paragraphBuffer.join(' ').trim();
    paragraphBuffer = [];
    if (!paragraph) return;
    elements.push(
      <InlineText
        key={`paragraph-${elements.length}`}
        text={paragraph}
        style={[styles.text, compact && styles.textCompact, styles.paragraph]}
      />,
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      elements.push(
        <InlineText
          key={`heading-${elements.length}`}
          text={headingMatch[2]}
          style={[
            styles.text,
            compact && styles.textCompact,
            styles.heading,
            level === 1 ? styles.heading1 : level === 2 ? styles.heading2 : styles.heading3,
          ]}
        />,
      );
      continue;
    }

    const bulletMatch = line.match(/^([-*])\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      elements.push(
        <View key={`bullet-${elements.length}`} style={styles.listRow}>
          <Text style={[styles.marker, compact && styles.markerCompact]} textBreakStrategy="simple">
            {'\u2022'}
          </Text>
          <InlineText
            text={bulletMatch[2]}
            style={[styles.text, compact && styles.textCompact, styles.listText]}
          />
        </View>,
      );
      continue;
    }

    const orderedMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      elements.push(
        <View key={`ordered-${elements.length}`} style={styles.listRow}>
          <Text style={[styles.marker, compact && styles.markerCompact]} textBreakStrategy="simple">
            {orderedMatch[1]}.
          </Text>
          <InlineText
            text={orderedMatch[2]}
            style={[styles.text, compact && styles.textCompact, styles.listText]}
          />
        </View>,
      );
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();

  return <View style={[styles.container, compact && styles.containerCompact]}>{elements}</View>;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  containerCompact: {
    gap: 4,
  },
  text: {
    color: '#A9B2C6',
    fontSize: 17,
    lineHeight: 28,
    includeFontPadding: false,
    width: '100%',
    minWidth: 0,
  },
  textCompact: {
    fontSize: 15,
    lineHeight: 24,
  },
  paragraph: {
    marginBottom: 10,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 10,
  },
  heading1: {
    fontSize: 24,
    lineHeight: 30,
  },
  heading2: {
    fontSize: 20,
    lineHeight: 26,
  },
  heading3: {
    fontSize: 17,
    lineHeight: 24,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    minWidth: 0,
    marginBottom: 8,
  },
  marker: {
    color: theme.colors.primary,
    fontSize: 17,
    lineHeight: 28,
    fontWeight: '700',
    minWidth: 20,
    includeFontPadding: false,
  },
  markerCompact: {
    fontSize: 15,
    lineHeight: 24,
  },
  listText: {
    flex: 1,
  },
  bold: {
    color: '#F3DF84',
    fontWeight: '900',
  },
  italic: {
    fontStyle: 'italic',
  },
});
