import { StyleSheet } from 'react-native';
import { linearTheme as n } from '../../../theme/linearTheme';
import { errorAlpha, warningAlpha, successAlpha, blackAlpha } from '../../../theme/colorUtils';

export const styles = StyleSheet.create({
  readerAskGuruBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 12,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: n.colors.accent + '16',
    borderWidth: 1,
    borderColor: n.colors.accent + '35',
  },
  readerAskGuruText: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  loadingState: { alignItems: 'center', justifyContent: 'center', padding: 48, flex: 1 },
  loadingText: { color: n.colors.textMuted, fontSize: 14, marginTop: 16 },
});

export { n, errorAlpha, warningAlpha, successAlpha, blackAlpha };
