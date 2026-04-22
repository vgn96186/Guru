with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

import re
content = re.sub(r'const \[([a-zA-Z]+): \1 \|\| "", set([a-zA-Z]+)\] = useState', r'const [\1, set\2] = useState', content)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
print("Fixed useState declarations 2")
