import re

def add_style(filename, old, new_style):
    with open(filename, 'r') as f:
        content = f.read()
    content = content.replace(old, new_style)
    with open(filename, 'w') as f:
        f.write(content)

# Fix Log out button
add_style('src/components/settings/SettingsSidebar.tsx', 'className="p-3 border-t border-[#292A2D]/50"', 'style={{ padding: 12, borderTopWidth: 1, borderTopColor: "rgba(41, 42, 45, 0.5)" }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="w-full flex-row items-center gap-2.5 px-2.5 py-1.5 rounded-md"', 'style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="text-[13px] font-medium text-red-400"', 'style={{ fontSize: 13, fontWeight: "500", color: "#F87171" }}')

# Fix Profile section nesting styles
add_style('src/screens/settings/sections/ProfileSection.tsx', 'className="mb-4"', 'style={{ marginBottom: 16 }}')

# Fix SettingsScreen header elements
add_style('src/screens/SettingsScreen.tsx', 'className="flex-row items-center gap-3"', 'style={{ flexDirection: "row", alignItems: "center", gap: 12 }}')
add_style('src/screens/SettingsScreen.tsx', 'className="p-1.5 rounded-md"', 'style={{ padding: 6, borderRadius: 6 }}')
add_style('src/screens/SettingsScreen.tsx', 'className="w-px h-4 bg-[#292A2D] mx-1"', 'style={{ width: 1, height: 16, backgroundColor: "#292A2D", marginHorizontal: 4 }}')
add_style('src/screens/SettingsScreen.tsx', 'className="flex-row items-center gap-2"', 'style={{ flexDirection: "row", alignItems: "center", gap: 8 }}')
add_style('src/screens/SettingsScreen.tsx', 'className="flex-row items-center bg-[#5E6AD2]/10 px-2 py-1 rounded-md border border-[#5E6AD2]/20"', 'style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(94, 106, 210, 0.1)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "rgba(94, 106, 210, 0.2)" }}')
add_style('src/screens/SettingsScreen.tsx', 'className="ml-2 text-[#5E6AD2]"', 'style={{ marginLeft: 8, color: "#5E6AD2" }}')
add_style('src/screens/SettingsScreen.tsx', 'className="flex-row items-center gap-4"', 'style={{ flexDirection: "row", alignItems: "center", gap: 16 }}')
add_style('src/screens/SettingsScreen.tsx', 'className="w-14 h-14 rounded-full bg-[#5E6AD2] flex items-center justify-center"', 'style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#5E6AD2", alignItems: "center", justifyContent: "center" }}')
add_style('src/screens/SettingsScreen.tsx', 'className="flex-row gap-6"', 'style={{ flexDirection: "row", gap: 24 }}')

