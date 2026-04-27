import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { accentAlpha, whiteAlpha, withAlpha } from '../../theme/colorUtils';

type InlineToken = {
  text: string;
  bold?: boolean;
  code?: boolean;
  topic?: boolean;
  highYield?: boolean;
};

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
type TableCell = InlineToken[];
type TableRow = TableCell[];

type MessageBlock =
  | { type: 'paragraph'; lines: InlineToken[][] }
  | { type: 'heading'; level: HeadingLevel; tokens: InlineToken[] }
  | { type: 'bullet'; marker: string; tokens: InlineToken[] }
  | { type: 'numbered'; marker: string; tokens: InlineToken[] }
  | { type: 'quote'; tokens: InlineToken[] }
  | { type: 'code'; text: string }
  | { type: 'divider' }
  | { type: 'table'; header: TableRow; rows: TableRow[] };

function normalizeGuruRenderableText(content: string): string {
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

function tokenizeInline(text: string): InlineToken[] {
  if (!text) {
    return [{ text: '' }];
  }

  const normalizedInlineText = text
    .replace(/\$?\\rightarrow\$?/g, '→')
    .replace(/\$?\\Rightarrow\$?/g, '⇒')
    .replace(/\$?\\leftarrow\$?/g, '←')
    .replace(/\$?\\to\$?/g, '→');

  const tokens: InlineToken[] = [];
  // `!!…!!`: allow a single `!` inside the span (e.g. "C3b!") — avoid `[^!]+` which breaks on any `!`.
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|==[^=]+==|!!((?:(?!!!).)+)!!)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedInlineText)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: normalizedInlineText.slice(lastIndex, match.index) });
    }

    const value = match[0] ?? '';
    if (value.startsWith('`')) {
      tokens.push({ text: value.slice(1, -1), code: true });
    } else if (value.startsWith('==')) {
      tokens.push({ text: value.slice(2, -2), topic: true });
    } else if (value.startsWith('!!')) {
      tokens.push({ text: value.slice(2, -2), highYield: true });
    } else {
      tokens.push({ text: value.slice(2, -2), bold: true });
    }

    lastIndex = match.index + value.length;
  }

  if (lastIndex < normalizedInlineText.length) {
    tokens.push({ text: normalizedInlineText.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ text: normalizedInlineText }];
}

function flushParagraphBlocks(blocks: MessageBlock[], paragraphLines: InlineToken[][]) {
  if (paragraphLines.length === 0) {
    return;
  }

  blocks.push({ type: 'paragraph', lines: [...paragraphLines] });
  paragraphLines.length = 0;
}

function isTableLine(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.includes('|');
}

function parseTableRow(line: string): string[] | null {
  if (!isTableLine(line)) {
    return null;
  }

  const cells = line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());

  return cells.length > 0 ? cells : null;
}

function isTableDividerLine(line: string): boolean {
  const cells = parseTableRow(line);
  if (!cells || cells.length === 0) {
    return false;
  }

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMessageBlocks(text: string): MessageBlock[] {
  const normalizedText = normalizeGuruRenderableText(text);
  if (!normalizedText) {
    return [];
  }

  const blocks: MessageBlock[] = [];
  const paragraphLines: InlineToken[][] = [];
  const codeLines: string[] = [];
  let inCodeBlock = false;
  const lines = normalizedText.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraphBlocks(blocks, paragraphLines);

      if (inCodeBlock) {
        blocks.push({ type: 'code', text: codeLines.join('\n') });
        codeLines.length = 0;
      }

      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraphBlocks(blocks, paragraphLines);
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushParagraphBlocks(blocks, paragraphLines);
      blocks.push({ type: 'divider' });
      continue;
    }

    const currentTableRow = parseTableRow(trimmed);
    const nextTrimmed = (lines[index + 1] ?? '').trim();
    if (currentTableRow && isTableDividerLine(nextTrimmed)) {
      flushParagraphBlocks(blocks, paragraphLines);

      const header = currentTableRow.map((cell) => tokenizeInline(cell));
      const rows: TableRow[] = [];

      index += 1;

      while (index + 1 < lines.length) {
        const candidate = (lines[index + 1] ?? '').trim();
        const candidateRow = parseTableRow(candidate);

        if (!candidateRow || isTableDividerLine(candidate)) {
          break;
        }

        rows.push(candidateRow.map((cell) => tokenizeInline(cell)));
        index += 1;
      }

      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraphBlocks(blocks, paragraphLines);
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as HeadingLevel,
        tokens: tokenizeInline(headingMatch[2]),
      });
      continue;
    }

    const bulletMatch = trimmed.match(/^([-*•])\s+(.+)$/);
    if (bulletMatch) {
      flushParagraphBlocks(blocks, paragraphLines);
      blocks.push({
        type: 'bullet',
        marker: bulletMatch[1] === '•' ? '•' : '•',
        tokens: tokenizeInline(bulletMatch[2]),
      });
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      flushParagraphBlocks(blocks, paragraphLines);
      blocks.push({
        type: 'numbered',
        marker: `${numberedMatch[1]}.`,
        tokens: tokenizeInline(numberedMatch[2]),
      });
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraphBlocks(blocks, paragraphLines);
      blocks.push({
        type: 'quote',
        tokens: tokenizeInline(quoteMatch[1]),
      });
      continue;
    }

    paragraphLines.push(tokenizeInline(trimmed));
  }

  flushParagraphBlocks(blocks, paragraphLines);

  if (codeLines.length > 0) {
    blocks.push({ type: 'code', text: codeLines.join('\n') });
  }

  return blocks;
}

function renderInlineTokens(tokens: InlineToken[], keyPrefix: string) {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.code) {
      return (
        <LinearText key={key} style={styles.inlineCode}>
          {token.text}
        </LinearText>
      );
    }

    if (token.topic) {
      return (
        <LinearText key={key} style={styles.topicHighlightText}>
          {token.text}
        </LinearText>
      );
    }

    if (token.highYield) {
      return (
        <LinearText key={key} style={styles.highYieldText}>
          {token.text}
        </LinearText>
      );
    }

    if (token.bold) {
      return (
        <LinearText key={key} style={styles.guruStrongText}>
          {token.text}
        </LinearText>
      );
    }

    return (
      <Text key={key} style={styles.guruPlainInline}>
        {token.text}
      </Text>
    );
  });
}

function getHeadingStyle(level: HeadingLevel) {
  if (level === 1) {
    return styles.headingLevel1;
  }

  if (level === 2) {
    return styles.headingLevel2;
  }

  if (level === 3) {
    return styles.headingLevel3;
  }

  return styles.headingLevel4;
}

interface FormattedGuruMessageProps {
  text: string;
}

export function FormattedGuruMessage({ text }: FormattedGuruMessageProps) {
  const blocks = parseMessageBlocks(text);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={styles.guruFormattedWrap}>
      {blocks.map((block, blockIndex) => {
        if (block.type === 'heading') {
          return (
            <LinearText
              key={`heading-${blockIndex}`}
              style={[styles.guruFormattedText, styles.headingBase, getHeadingStyle(block.level)]}
              textBreakStrategy="simple"
            >
              {renderInlineTokens(block.tokens, `heading-${blockIndex}`)}
            </LinearText>
          );
        }

        if (block.type === 'bullet' || block.type === 'numbered') {
          return (
            <View key={`${block.type}-${blockIndex}`} style={styles.listRow}>
              <LinearText style={styles.listMarker}>{block.marker}</LinearText>
              <LinearText
                style={[styles.guruFormattedText, styles.listText]}
                textBreakStrategy="simple"
              >
                {renderInlineTokens(block.tokens, `${block.type}-${blockIndex}`)}
              </LinearText>
            </View>
          );
        }

        if (block.type === 'quote') {
          return (
            <View key={`quote-${blockIndex}`} style={styles.quoteBlock}>
              <LinearText
                style={[styles.guruFormattedText, styles.quoteText]}
                textBreakStrategy="simple"
              >
                {renderInlineTokens(block.tokens, `quote-${blockIndex}`)}
              </LinearText>
            </View>
          );
        }

        if (block.type === 'code') {
          return (
            <View key={`code-${blockIndex}`} style={styles.codeBlock}>
              <LinearText style={styles.codeBlockText} textBreakStrategy="simple">
                {block.text}
              </LinearText>
            </View>
          );
        }

        if (block.type === 'divider') {
          return <View key={`divider-${blockIndex}`} style={styles.divider} />;
        }

        if (block.type === 'table') {
          const columnCount = Math.max(
            block.header.length,
            ...block.rows.map((row) => row.length),
            1,
          );

          return (
            <View key={`table-${blockIndex}`} style={styles.tableBlock}>
              <View style={[styles.tableRow, styles.tableHeaderRow]}>
                {Array.from({ length: columnCount }).map((_, cellIndex) => (
                  <View
                    key={`table-${blockIndex}-header-${cellIndex}`}
                    style={[
                      styles.tableCell,
                      cellIndex < columnCount - 1 && styles.tableCellBorder,
                    ]}
                  >
                    <LinearText
                      style={[styles.guruFormattedText, styles.tableHeaderText]}
                      textBreakStrategy="simple"
                    >
                      {renderInlineTokens(
                        block.header[cellIndex] ?? [{ text: '' }],
                        `table-${blockIndex}-header-${cellIndex}`,
                      )}
                    </LinearText>
                  </View>
                ))}
              </View>

              {block.rows.map((row, rowIndex) => (
                <View key={`table-${blockIndex}-row-${rowIndex}`} style={styles.tableRow}>
                  {Array.from({ length: columnCount }).map((_, cellIndex) => (
                    <View
                      key={`table-${blockIndex}-row-${rowIndex}-cell-${cellIndex}`}
                      style={[
                        styles.tableCell,
                        rowIndex < block.rows.length - 1 && styles.tableRowBorder,
                        cellIndex < columnCount - 1 && styles.tableCellBorder,
                      ]}
                    >
                      <LinearText style={styles.guruFormattedText} textBreakStrategy="simple">
                        {renderInlineTokens(
                          row[cellIndex] ?? [{ text: '' }],
                          `table-${blockIndex}-row-${rowIndex}-${cellIndex}`,
                        )}
                      </LinearText>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        }

        return (
          <View key={`paragraph-${blockIndex}`} style={styles.guruParagraph}>
            {block.lines.map((lineTokens, lineIndex) => (
              <LinearText
                key={`paragraph-${blockIndex}-line-${lineIndex}`}
                style={styles.guruFormattedText}
                textBreakStrategy="simple"
              >
                {renderInlineTokens(lineTokens, `paragraph-${blockIndex}-${lineIndex}`)}
              </LinearText>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  guruFormattedWrap: {
    width: '100%',
    minWidth: 0,
    gap: 10,
  },
  guruParagraph: {
    gap: 4,
  },
  guruFormattedText: {
    ...n.typography.body,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400',
    minWidth: 0,
    includeFontPadding: false,
  },
  /** `**markdown bold**` — models rarely emit `!!`; same orange as high-yield so "important" is visible. */
  guruStrongText: {
    color: n.colors.warning,
    fontWeight: '700',
  },
  /** No size/color/weight — must inherit parent (heading scale + bold, body 15/400, quote muted). */
  guruPlainInline: {
    includeFontPadding: false,
  },
  topicHighlightText: {
    color: n.colors.accent,
    fontWeight: '700',
    backgroundColor: accentAlpha['10'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['20'],
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  highYieldText: {
    color: n.colors.warning,
    fontWeight: '800',
    backgroundColor: withAlpha(n.colors.warning, 0.14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(n.colors.warning, 0.38),
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  headingBase: {
    color: n.colors.accent,
    fontFamily: 'Inter_800ExtraBold',
    fontWeight: '800',
    includeFontPadding: false,
  },
  headingLevel1: {
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: -0.45,
  },
  headingLevel2: {
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.35,
  },
  headingLevel3: {
    fontSize: 19,
    lineHeight: 27,
    letterSpacing: -0.25,
  },
  headingLevel4: {
    fontSize: 17,
    lineHeight: 25,
    letterSpacing: -0.15,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 4,
  },
  listMarker: {
    ...n.typography.body,
    color: n.colors.accent,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  listText: {
    flex: 1,
  },
  quoteBlock: {
    borderLeftWidth: 2,
    borderLeftColor: `${n.colors.accent}55`,
    paddingLeft: 12,
  },
  quoteText: {
    color: n.colors.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: whiteAlpha['10'],
    marginVertical: 2,
  },
  inlineCode: {
    color: n.colors.textPrimary,
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 13,
    lineHeight: 20,
  },
  codeBlock: {
    backgroundColor: whiteAlpha['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  codeBlockText: {
    color: n.colors.textPrimary,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
  },
  tableBlock: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    backgroundColor: whiteAlpha['2.5'],
  },
  tableHeaderRow: {
    backgroundColor: whiteAlpha['4'],
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tableCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableCellBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: whiteAlpha['8'],
  },
  tableRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: whiteAlpha['8'],
  },
  tableHeaderText: {
    fontWeight: '700',
  },
});
