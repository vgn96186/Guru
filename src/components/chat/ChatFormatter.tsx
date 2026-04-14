import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';

/** Renders Guru reply text with paragraphs, bold, bullets, and citation styling for readability */
export function normalizeGuruRenderableText(content: string): string {
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

export function splitGuruBoldSegments(line: string): Array<{ text: string; bold: boolean }> {
  if (!line) return [{ text: '', bold: false }];

  const segments: Array<{ text: string; bold: boolean }> = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1] ?? '', bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), bold: false });
  }

  return segments.length > 0 ? segments : [{ text: line, bold: false }];
}

interface FormattedGuruMessageProps {
  text: string;
}

const FormattedGuruMessageComponent = ({ text }: FormattedGuruMessageProps) => {
  const normalizedText = normalizeGuruRenderableText(text);
  const paragraphs = normalizedText.split(/\n{2,}/).filter(Boolean);

  return (
    <View style={styles.guruFormattedWrap}>
      {paragraphs.map((paragraph, paragraphIndex) => {
        const lines = paragraph.split('\n');
        return (
          <View key={`paragraph-${paragraphIndex}`} style={styles.guruParagraph}>
            {lines.map((line, lineIndex) => {
              const segments = splitGuruBoldSegments(line);
              return (
                <LinearText
                  key={`line-${paragraphIndex}-${lineIndex}`}
                  style={styles.guruFormattedText}
                  textBreakStrategy="simple"
                >
                  {segments.map((segment, segmentIndex) =>
                    segment.bold ? (
                      <LinearText
                        key={`seg-${paragraphIndex}-${lineIndex}-${segmentIndex}`}
                        style={styles.guruStrongText}
                      >
                        {segment.text}
                      </LinearText>
                    ) : (
                      <React.Fragment key={`seg-${paragraphIndex}-${lineIndex}-${segmentIndex}`}>
                        {segment.text}
                      </React.Fragment>
                    ),
                  )}
                </LinearText>
              );
            })}
          </View>
        );
      })}
    </View>
  );
};

export const FormattedGuruMessage = memo(FormattedGuruMessageComponent);

const styles = StyleSheet.create({
  guruFormattedWrap: {
    width: '100%',
  },
  guruParagraph: {
    marginBottom: 12,
  },
  guruFormattedText: {
    fontSize: 15,
    lineHeight: 22,
    color: n.colors.textPrimary,
  },
  guruStrongText: {
    fontWeight: '700',
    color: n.colors.accent,
  },
});
