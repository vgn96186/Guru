with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

# Fix header
content = content.replace('className="h-14 border-b border-[#292A2D] flex-row items-center justify-between px-4 bg-[#141517]/80 z-20"', 'style={{ height: 56, borderBottomWidth: 1, borderBottomColor: "#292A2D", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "rgba(20,21,23,0.8)", zIndex: 20 }}')

# Fix profile header in GeneralOverview
content = content.replace('className="flex-row items-center justify-between border border-[#292A2D] rounded-xl p-5 bg-[#1B1C1F] shadow-sm mb-6"', 'style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#292A2D", borderRadius: 12, padding: 20, backgroundColor: "#1B1C1F", marginBottom: 24, elevation: 2 }}')

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)

# Fix BentoCard
with open('src/components/settings/BentoCard.tsx', 'r') as f:
    bento = f.read()

bento = bento.replace('className={`bg-[#1B1C1F] border border-[#292A2D] rounded-xl p-5 shadow-sm ${className}`}', 'style={{ backgroundColor: "#1B1C1F", borderWidth: 1, borderColor: "#292A2D", borderRadius: 12, padding: 20, elevation: 2, marginBottom: 24 }}')

with open('src/components/settings/BentoCard.tsx', 'w') as f:
    f.write(bento)

# Fix SidebarNavItem
with open('src/components/settings/SidebarNavItem.tsx', 'r') as f:
    nav = f.read()

nav = nav.replace('className={`flex-row items-center justify-between px-2.5 py-1.5 rounded-md mb-1 ${', 'style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 4, backgroundColor: isActive ? "#2A2B30" : "transparent" }} className={` ${')

with open('src/components/settings/SidebarNavItem.tsx', 'w') as f:
    f.write(nav)
