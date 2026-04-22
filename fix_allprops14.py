with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

import re
# The layout is row, but it looks like the sidebar is not showing.
# Ah! In `src/screens/SettingsScreen.tsx`, I wrapped it in KeyboardAvoidingView and View flex-1 flex-row.
# Maybe NativeWind flex-row is not working on View? Or bg-[#141517] is hiding it?
# Let's ensure standard stylesheet styles are used for the main containers if NativeWind isn't fully working on Android without specific setup.

new_content = content.replace('className="flex-1 flex-row"', 'style={{ flex: 1, flexDirection: "row" }}')
new_content = new_content.replace('className="max-w-5xl w-full mx-auto"', 'style={{ maxWidth: 1024, width: "100%", alignSelf: "center", paddingBottom: 100 }}')
new_content = new_content.replace('className="bg-[#141517]" style={{ flex: 1 }}', 'style={{ flex: 1, backgroundColor: "#141517" }}')

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(new_content)

with open('src/components/settings/SettingsSidebar.tsx', 'r') as f:
    sidebar = f.read()

# Fix sidebar
sidebar = sidebar.replace('className={`border-r border-[#292A2D] bg-[#111214] flex-shrink-0 flex-col h-full z-20 ${', 'style={{ borderRightWidth: 1, borderRightColor: "#292A2D", backgroundColor: "#111214", flexShrink: 0, flexDirection: "column", height: "100%", zIndex: 20, width: isCollapsed ? 64 : 256 }} className={` ${')

with open('src/components/settings/SettingsSidebar.tsx', 'w') as f:
    f.write(sidebar)
