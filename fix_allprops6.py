with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

import re
content = re.sub(r'([a-zA-Z]+): \1: \1 \|\| "",', r'\1: \1,', content)
content = re.sub(r'([a-zA-Z]+): \1 \|\| "",', r'\1,', content)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
print("Fixed object literals")
