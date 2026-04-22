with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

# Make sure we import React correctly
if "import React" in content:
    content = content.replace("import React,", "import * as React from 'react';\nimport ")

# Also ensure global.css is imported first
if "import '../global.css'" not in content and "import './global.css'" not in content:
    content = "import '../../global.css';\n" + content

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
