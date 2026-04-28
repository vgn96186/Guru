import React from 'react';
import type { TextProps } from 'react-native';
import LinearText, { type LinearTextTone, type LinearTextVariant } from './primitives/LinearText';

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
    .replace(/\r/g, '\n');
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

export interface InlineMarkdownTextProps extends Omit<TextProps, 'style' | 'children'> {
  content: string;
  variant?: LinearTextVariant;
  tone?: LinearTextTone;
  boldTone?: LinearTextTone;
  style?: unknown;
  boldStyle?: unknown;
  italicStyle?: unknown;
}

export function InlineMarkdownText({
  content,
  variant,
  tone,
  boldTone,
  style,
  boldStyle,
  italicStyle,
  ...textProps
}: InlineMarkdownTextProps) {
  const normalized = normalizeContent(content);
  if (!normalized) return null;

  const lines = normalized.split('\n');
  const children: React.ReactNode[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (lineIndex > 0) children.push('\n');

    const tokens = parseInline(lines[lineIndex] ?? '');
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
      const token = tokens[tokenIndex];
      if (token.bold || token.italic) {
        children.push(
          <LinearText
            key={`${lineIndex}-${tokenIndex}`}
            variant={variant}
            tone={token.bold ? (boldTone ?? tone) : tone}
            style={[
              token.bold ? (boldStyle as unknown as object) : undefined,
              token.italic ? (italicStyle as unknown as object) : undefined,
            ]}
          >
            {token.text}
          </LinearText>,
        );
      } else {
        children.push(token.text);
      }
    }
  }

  return (
    <LinearText variant={variant} tone={tone} style={style as unknown as object} {...textProps}>
      {children}
    </LinearText>
  );
}
