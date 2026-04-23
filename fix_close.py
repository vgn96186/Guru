with open('src/screens/SettingsScreen.tsx', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "</LinearSurface>" in line and "              <View style={styles.categoryContent}>{renderActiveCategoryContent()}</View>" in lines[i+2]:
        lines[i] = "              </LinearSurface>\n              )}\n"
        break

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.writelines(lines)
