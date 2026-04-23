import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    text = f.read()

# Replace <LinearSurface compact style={[styles.summaryCard, styles.shellSummaryCard]}>
old_tag = r"<LinearSurface compact style=\{\[styles\.summaryCard, styles\.shellSummaryCard\]\}>"
new_tag = "{activeCategory !== 'dashboard' && (\n              <LinearSurface compact style={[styles.summaryCard, styles.shellSummaryCard]}>"
text = re.sub(old_tag, new_tag, text)

# Find where it closes
old_close = r"                  \}\)\}\n\s*</View>\n\s*</LinearSurface>"
new_close = "                  }))}\n                </View>\n              </LinearSurface>\n              )}"
text = re.sub(old_close, new_close, text)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(text)
