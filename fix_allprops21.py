with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

content = content.replace('<LinearText variant="meta" tone="muted">STREAK</LinearText>', '<LinearText variant="meta" tone="muted" style={{ fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>STREAK</LinearText>')
content = content.replace('<LinearText variant="meta" tone="muted">TOTAL XP</LinearText>', '<LinearText variant="meta" tone="muted" style={{ fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>TOTAL XP</LinearText>')

content = content.replace('<LinearText variant="title">{profile?.totalXp || 0}</LinearText>', '<LinearText variant="title" style={{ fontSize: 18, fontWeight: "600", color: "#E8E8E8" }}>{profile?.totalXp || 0}</LinearText>')
content = content.replace('<LinearText variant="title" style={{ color: \'#F6AD55\' }}>0 Days</LinearText>', '<LinearText variant="title" style={{ fontSize: 18, fontWeight: "600", color: "#F6AD55" }}>0 Days</LinearText>')

content = content.replace('<LinearText variant="title">{name}</LinearText>', '<LinearText variant="title" style={{ fontSize: 18, fontWeight: "600", color: "#E8E8E8" }}>{name}</LinearText>')
content = content.replace('<LinearText variant="bodySmall" tone="secondary">Target: NEET-PG</LinearText>', '<LinearText variant="bodySmall" tone="secondary" style={{ fontSize: 14, color: "#8A8F98", marginTop: 2 }}>Target: NEET-PG</LinearText>')

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
