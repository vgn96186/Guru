import { StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import { HOME_SECTION_GAP, HOME_TILE_HEIGHT } from '../../components/home/homeLayout';

// ── Consistent spacing scale ──
const HP = n.spacing.xl; // 24 — horizontal page padding
const CARD_GAP = n.spacing.lg; // 16 — gap between cards
const SECTION_GAP = n.spacing.xl; // 24 — gap between sections

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  scrollContent: { paddingBottom: 40 },
  content: { paddingHorizontal: HP, paddingTop: n.spacing.md },
  motionShell: {
    width: '100%',
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: n.spacing.sm,
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingText: {
    ...n.typography.title,
    color: n.colors.textSecondary,
  },
  greetingName: {
    color: n.colors.textPrimary,
  },

  // ── Hero section ──
  heroSection: {
    alignItems: 'center',
    marginTop: -8,
    paddingTop: 0,
    paddingBottom: n.spacing.lg,
  },

  // ── Agenda item wrapper ──
  agendaItemWrap: {
    height: HOME_TILE_HEIGHT,
    justifyContent: 'center',
  },

  // ── Two Column Layout ──
  gridLandscape: {
    flexDirection: 'row',
    gap: 32,
  },
  twoColumnGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flex: 1,
  },
  homeGridStacked: {
    flexDirection: 'column',
  },
  homeGridStackedColumn: {
    flex: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  rightColumnSectionGap: {
    marginTop: HOME_SECTION_GAP,
  },

  // ── Error row ──
  loadErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: n.colors.errorSurface,
    borderRadius: n.radius.md,
    padding: n.spacing.md,
    marginBottom: CARD_GAP,
    borderWidth: 1,
    borderColor: n.colors.error,
  },
  loadErrorText: { color: n.colors.textSecondary, fontSize: 13 },
  retryButton: {
    backgroundColor: n.colors.error,
    paddingHorizontal: n.spacing.lg,
    paddingVertical: n.spacing.sm,
    borderRadius: n.radius.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryButtonText: { color: n.colors.textPrimary, fontWeight: '700', fontSize: 13 },

  // ── Empty sections ──
  emptySectionTouchable: {
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
    borderLeftWidth: 2,
    borderLeftColor: n.colors.border,
  },
  emptySectionText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  fullWidthPressable: {
    width: '100%',
  },

  // ── Sections ──
  moreHeaderLabel: {
    color: n.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    paddingLeft: 6,
  },
  headerActionText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Tools section ──
  moreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: n.spacing.md,
    alignItems: 'center',
  },
  moreContent: { paddingBottom: SECTION_GAP, gap: 8 },
  toolRow: {
    // No extra margin needed — gap on parent handles spacing
  },
  toolRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.md,
    minHeight: 44,
  },
  toolRowText: { color: n.colors.textSecondary, fontSize: 14, fontWeight: '500', flex: 1 },
});
