def add_style(filename, old, new_style):
    with open(filename, 'r') as f:
        content = f.read()
    content = content.replace(old, new_style)
    with open(filename, 'w') as f:
        f.write(content)

# Adjust Auto-fetch button inside GeneralOverviewSection.tsx
add_style('src/screens/settings/sections/GeneralOverviewSection.tsx', 'style={[styles.autoFetchBtn, fetchingDates && styles.autoFetchBtnDisabled]}', 'style={[{ width: "100%", alignItems: "center", paddingVertical: 12, backgroundColor: "rgba(94, 106, 210, 0.05)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(94, 106, 210, 0.2)", marginTop: 8 }, fetchingDates && { opacity: 0.5 }]}')
add_style('src/screens/settings/sections/GeneralOverviewSection.tsx', 'style={styles.autoFetchBtnText}', 'style={{ fontSize: 13, fontWeight: "500", color: "#5E6AD2" }}')
add_style('src/screens/settings/sections/GeneralOverviewSection.tsx', 'style={[', 'style={[ { fontSize: 12, marginTop: 8 },')

