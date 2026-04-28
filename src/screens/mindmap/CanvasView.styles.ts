import { StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import { blackAlpha, whiteAlpha } from '../../theme/colorUtils';

export const styles = StyleSheet.create({
  // Canvas
  canvasContainer: { flex: 1 },
  canvasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  canvasTitle: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  svgWrap: { flex: 1, backgroundColor: n.colors.background, overflow: 'hidden' },
  canvasSurface: { position: 'absolute', left: 0, top: 0 },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  searchInput: { flex: 1, color: n.colors.textPrimary, fontSize: 14, paddingVertical: 4 },

  // Explanation + actions
  explanationCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: whiteAlpha['8'],
    borderRadius: n.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  explanationTitle: { flex: 1, color: n.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  explanationBody: { color: n.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  explanationHint: { color: n.colors.textMuted, fontSize: 11 },
  actionBar: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    maxHeight: 56,
  },
  actionBarScroll: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionBtnText: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '500' },

  // Thought input
  thoughtBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  thoughtInput: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 14,
    marginRight: 8,
    paddingVertical: 4,
  },

  // Expanding/moving banner
  expandingBanner: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: blackAlpha['80'],
    borderRadius: n.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  expandingText: { color: n.colors.textSecondary, fontSize: 13 },
});
