import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    text = f.read()

# 1. Update ScreenHeader
old_header = r"<ScreenHeader title=\"Settings\" onBackPress=\{\(\) => navigation\.navigate\('MenuHome'\)\} />"
new_header = """<ScreenHeader 
                title="Settings" 
                onBackPress={() => navigation.navigate('MenuHome')}
                rightElement={
                  saving ? <ActivityIndicator size="small" color={n.colors.textMuted} /> : null
                }
              />"""
text = re.sub(old_header, new_header, text)

# 2. Remove summary pill
old_pill = r"""                  <View style=\{styles\.summaryPill\}>\n\s*<LinearText variant=\"chip\" tone=\"accent\">\n\s*\{saving \? 'Auto-saving' : 'Live settings'\}\n\s*</LinearText>\n\s*</View>"""
text = re.sub(old_pill, "", text)

# 3. Remove save button at the bottom
old_btn = r"""\s*\{saving && \(\n\s*<View style=\{\[styles\.saveBtn, styles\.saveBtnDisabled\]\}>\n\s*<ActivityIndicator size=\"small\" color=\{n\.colors\.textPrimary\} />\n\s*<LinearText style=\{\[styles\.saveBtnText, \{ marginLeft: 8 \}\]\}>\n\s*Auto-saving…\n\s*</LinearText>\n\s*</View>\n\s*\)\}"""
text = re.sub(old_btn, "", text)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(text)
