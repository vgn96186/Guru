import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    text = f.read()

# Replace opening tags
text = text.replace('<View style={styles.categoryStack}>', '<>')

# For the dashboard case
text = re.sub(
r'(<GeneralOverviewSection\n.*?navigation={navigation}\n\s*\/>\n\s*)</View>',
r'\1</>',
text, flags=re.DOTALL)

# For the integrations case
text = re.sub(
r'(<SamsungBackgroundRow />\n\s*)</View>',
r'\1</>',
text, flags=re.DOTALL)

# For the advanced case
text = re.sub(
r'(Open Dev Console\n\s*</LinearText>\n\s*</TouchableOpacity>\n\s*</SectionToggle>\n\s*)</View>',
r'\1</>',
text, flags=re.DOTALL)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(text)
