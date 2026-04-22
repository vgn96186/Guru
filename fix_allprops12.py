with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

# Wrap ScrollView children in safe area or simple View without max-w-5xl, since max-w isn't working via NativeWind on web vs native differently?
# Actually NativeWind 4 handles max-w-5xl fine, but maybe flex-1 bg-[#141517] on ScrollView is breaking the flex flow?
import re
new_content = content.replace('className="flex-1 bg-[#141517]"', 'className="bg-[#141517]" style={{ flex: 1 }}')

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(new_content)
