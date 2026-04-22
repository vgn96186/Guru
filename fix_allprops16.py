# Fix texts and smaller elements that are relying on nativewind
import re

def add_style(filename, old, new_style):
    with open(filename, 'r') as f:
        content = f.read()
    content = content.replace(old, new_style)
    with open(filename, 'w') as f:
        f.write(content)

# SettingsField
add_style('src/screens/settings/components/SettingsField.tsx', 'className="mb-4"', 'style={{ marginBottom: 16 }}')
add_style('src/screens/settings/components/SettingsField.tsx', 'className="text-[13px] font-medium text-[#E8E8E8] mb-2"', 'style={{ fontSize: 13, fontWeight: "500", color: "#E8E8E8", marginBottom: 8 }}')
add_style('src/screens/settings/components/SettingsField.tsx', 'className="w-full h-[44px] bg-[#111214] rounded-lg border border-[#292A2D] px-3 text-[#E8E8E8] text-[15px]"', 'style={{ width: "100%", height: 44, backgroundColor: "#111214", borderRadius: 8, borderWidth: 1, borderColor: "#292A2D", paddingHorizontal: 12, color: "#E8E8E8", fontSize: 15 }}')

# SettingsToggleRow
add_style('src/screens/settings/components/SettingsToggleRow.tsx', 'className="flex-row items-center justify-between py-3 border-b border-[#292A2D] last:border-0"', 'style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#292A2D" }, style]}')
add_style('src/screens/settings/components/SettingsToggleRow.tsx', 'className="flex-1 pr-4"', 'style={{ flex: 1, paddingRight: 16 }}')
add_style('src/screens/settings/components/SettingsToggleRow.tsx', 'className="flex-row items-center gap-2"', 'style={{ flexDirection: "row", alignItems: "center", gap: 8 }}')
add_style('src/screens/settings/components/SettingsToggleRow.tsx', 'className="text-[13px] font-medium text-[#E8E8E8]"', 'style={{ fontSize: 13, fontWeight: "500", color: "#E8E8E8" }}')
add_style('src/screens/settings/components/SettingsToggleRow.tsx', 'className="text-[12px] text-[#8A8F98] mt-1"', 'style={{ fontSize: 12, color: "#8A8F98", marginTop: 4 }}')

# BentoCard titles
add_style('src/components/settings/BentoCard.tsx', 'className="flex-row items-center justify-between mb-5"', 'style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}')
add_style('src/components/settings/BentoCard.tsx', 'className="flex-row items-center gap-2"', 'style={{ flexDirection: "row", alignItems: "center", gap: 8 }}')
add_style('src/components/settings/BentoCard.tsx', 'className="font-semibold text-sm text-[#E8E8E8]"', 'style={{ fontWeight: "600", fontSize: 14, color: "#E8E8E8" }}')
add_style('src/components/settings/BentoCard.tsx', 'className="flex-1"', 'style={{ flex: 1 }}')

# Sidebar elements
add_style('src/components/settings/SidebarNavItem.tsx', 'className="flex-row items-center gap-2.5"', 'style={{ flexDirection: "row", alignItems: "center", gap: 10 }}')
add_style('src/components/settings/SidebarNavItem.tsx', 'className={`text-[13px] font-medium ${isActive ? \'text-[#E8E8E8]\' : \'text-[#8A8F98]\'}`}', 'style={{ fontSize: 13, fontWeight: "500", color: isActive ? "#E8E8E8" : "#8A8F98" }}')

add_style('src/components/settings/SettingsSidebar.tsx', 'className="p-4 flex-row items-center gap-3 border-b border-[#292A2D]/50 shrink-0"', 'style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(41, 42, 45, 0.5)", flexShrink: 0 }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="w-8 h-8 rounded-md bg-[#5E6AD2] flex items-center justify-center shadow-sm"', 'style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: "#5E6AD2", alignItems: "center", justifyContent: "center", elevation: 1 }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="text-xs font-bold text-white"', 'style={{ fontSize: 12, fontWeight: "bold", color: "white" }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="flex-1 min-w-0"', 'style={{ flex: 1, minWidth: 0 }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="text-[13px] font-medium text-[#E8E8E8]"', 'style={{ fontSize: 13, fontWeight: "500", color: "#E8E8E8" }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="text-[11px] text-[#8A8F98]"', 'style={{ fontSize: 11, color: "#8A8F98" }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="flex-1 py-4 px-3 flex-col gap-1"', 'style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 12, flexDirection: "column", gap: 4 }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="px-2 mb-1"', 'style={{ paddingHorizontal: 8, marginBottom: 4 }}')
add_style('src/components/settings/SettingsSidebar.tsx', 'className="text-[10px] font-semibold text-[#5E626B] uppercase tracking-wider"', 'style={{ fontSize: 10, fontWeight: "600", color: "#5E626B", textTransform: "uppercase", letterSpacing: 0.5 }}')

