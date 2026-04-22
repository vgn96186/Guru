def add_style(filename, old, new_style):
    with open(filename, 'r') as f:
        content = f.read()
    content = content.replace(old, new_style)
    with open(filename, 'w') as f:
        f.write(content)

# Fix remaining inline elements in SettingsScreen.tsx Profile header
add_style('src/screens/SettingsScreen.tsx', 'className="w-px bg-[#292A2D]"', 'style={{ width: 1, backgroundColor: "#292A2D" }}')

# And in SettingsField (the margins and spacing)
add_style('src/screens/settings/components/SettingsField.tsx', 'className={`text-[12px] mt-2 ${error ? \'text-red-400\' : \'text-[#8A8F98]\'}`}', 'style={{ fontSize: 12, marginTop: 8, color: error ? "#F87171" : "#8A8F98" }}')

