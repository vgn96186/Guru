def add_style(filename, old, new_style):
    with open(filename, 'r') as f:
        content = f.read()
    content = content.replace(old, new_style)
    with open(filename, 'w') as f:
        f.write(content)

# Adjust the hint under Auto-fetch button
add_style('src/screens/settings/sections/GeneralOverviewSection.tsx', 'style={[ { fontSize: 12, marginTop: 8 },', 'style={[ { fontSize: 12, marginTop: 8 },')
add_style('src/screens/settings/sections/GeneralOverviewSection.tsx', 'style={styles.hint}', 'style={{ fontSize: 12, color: "#8A8F98", marginTop: 8 }}')
