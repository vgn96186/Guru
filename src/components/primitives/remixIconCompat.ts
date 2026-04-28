import type { IconStyle } from '../../theme/iconography';
import * as RemixIcons from 'react-native-remix-icon/src/icons';

type CompatEntry = { line: string; fill: string };

const COMPAT: Record<string, CompatEntry> = {
  chatbubbles: { line: 'chat-3-line', fill: 'chat-3-fill' },

  'checkmark-circle': { line: 'checkbox-circle-line', fill: 'checkbox-circle-fill' },
  'close-circle': { line: 'close-circle-line', fill: 'close-circle-fill' },
  'alert-circle': { line: 'alert-line', fill: 'alert-fill' },
  'information-circle': { line: 'information-line', fill: 'information-fill' },
  warning: { line: 'error-warning-line', fill: 'error-warning-fill' },

  'phone-portrait': { line: 'smartphone-line', fill: 'smartphone-fill' },
  'swap-horizontal': { line: 'swap-2-line', fill: 'swap-2-fill' },
  'git-network': { line: 'router-line', fill: 'router-fill' },
  'git-branch': { line: 'git-branch-line', fill: 'git-branch-fill' },

  'chevron-forward': { line: 'arrow-right-s-line', fill: 'arrow-right-s-fill' },
  'chevron-back': { line: 'arrow-left-s-line', fill: 'arrow-left-s-fill' },
  'chevron-down': { line: 'arrow-down-s-line', fill: 'arrow-down-s-fill' },
  'chevron-up': { line: 'arrow-up-s-line', fill: 'arrow-up-s-fill' },

  'arrow-back': { line: 'arrow-left-line', fill: 'arrow-left-fill' },
  'arrow-forward': { line: 'arrow-right-line', fill: 'arrow-right-fill' },

  trash: { line: 'delete-bin-line', fill: 'delete-bin-fill' },
  'trash-bin': { line: 'delete-bin-line', fill: 'delete-bin-fill' },
  copy: { line: 'file-copy-line', fill: 'file-copy-fill' },
  library: { line: 'book-shelf-line', fill: 'book-shelf-fill' },
  'document-text': { line: 'file-text-line', fill: 'file-text-fill' },
  'document-attach': { line: 'attachment-line', fill: 'attachment-fill' },
  pricetag: { line: 'price-tag-line', fill: 'price-tag-fill' },

  sparkles: { line: 'sparkling-line', fill: 'sparkling-fill' },
  bulb: { line: 'lightbulb-line', fill: 'lightbulb-fill' },
  refresh: { line: 'refresh-line', fill: 'refresh-fill' },
  reload: { line: 'refresh-line', fill: 'refresh-fill' },
  sync: { line: 'refresh-line', fill: 'refresh-fill' },
  layers: { line: 'stack-line', fill: 'stack-fill' },
  'hardware-chip': { line: 'cpu-line', fill: 'cpu-fill' },
  medical: { line: 'stethoscope-line', fill: 'stethoscope-fill' },
  bone: { line: 'body-scan-line', fill: 'body-scan-fill' },
  cube: { line: 'box-3-line', fill: 'box-3-fill' },
  flame: { line: 'fire-line', fill: 'fire-fill' },
  'shield-checkmark': { line: 'shield-check-line', fill: 'shield-check-fill' },
  key: { line: 'key-2-line', fill: 'key-2-fill' },
  medkit: { line: 'first-aid-kit-line', fill: 'first-aid-kit-fill' },

  'logo-github': { line: 'github-line', fill: 'github-fill' },
  'logo-youtube': { line: 'youtube-line', fill: 'youtube-fill' },
  'git-compare': { line: 'gitlab-line', fill: 'gitlab-fill' },
  'logo-electron': { line: 'openai-line', fill: 'openai-fill' },
  star: { line: 'gemini-line', fill: 'gemini-fill' },
  cellular: { line: 'signal-tower-line', fill: 'signal-tower-fill' },
};

function normalizeIoniconsName(name: string) {
  let n = name.trim().toLowerCase();
  if (n.startsWith('ri-')) n = n.substring(3);
  if (n.endsWith('-outline')) n = n.replace(/-outline$/, '');
  if (n.endsWith('-sharp')) n = n.replace(/-sharp$/, '');
  return n;
}

function getIconExportName(name: string) {
  let result = name
    .split('-')
    .map((word) => {
      if (/^\d/.test(word)) {
        return word
          .split('')
          .map((char, charIndex) =>
            /^\d$/.test(char) ? char : charIndex === 0 ? char : char.toUpperCase(),
          )
          .join('');
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');

  if (/^\d/.test(name)) {
    result = `Svg${result}`;
  }

  return result;
}

function hasRemixIcon(name: string) {
  const exportName = getIconExportName(name);
  return (RemixIcons as any)[exportName] != null;
}

function pickFirstExisting(candidates: string[]) {
  for (const c of candidates) {
    if (hasRemixIcon(c)) return c;
  }
  return null;
}

export function resolveRemixIconName(input: string, style: IconStyle): string {
  const normalized = normalizeIoniconsName(input);
  const entry = COMPAT[normalized];
  const variant = style === 'filled' ? 'fill' : 'line';

  const candidates: string[] = [];

  if (entry) {
    candidates.push(style === 'filled' ? entry.fill : entry.line);
  }

  const base = normalized.startsWith('logo-') ? normalized.replace(/^logo-/, '') : normalized;
  candidates.push(`${base}-${variant}`);

  const picked = pickFirstExisting(candidates);
  if (picked) return picked;

  return style === 'filled' ? 'question-fill' : 'question-line';
}
