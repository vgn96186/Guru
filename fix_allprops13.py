with open('src/screens/settings/sections/GeneralOverviewSection.tsx', 'r') as f:
    content = f.read()

# Fix layout for BentoCards inside the scrollview
import re
new_content = content.replace('className="mb-4"', 'className="mb-6"')

with open('src/screens/settings/sections/GeneralOverviewSection.tsx', 'w') as f:
    f.write(new_content)
