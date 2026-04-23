import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    text = f.read()

# Fix the return block around 2270
pattern = r"\s*// eslint-disable-next-line guru/prefer-screen-shell -- settings uses custom layout with KeyboardAvoidingView\n\s*return \(\n\s*<StatusBar barStyle=\"light-content\" backgroundColor=\{n\.colors\.background\} />\n\s*<KeyboardAvoidingView"

replacement = """
  // eslint-disable-next-line guru/prefer-screen-shell -- settings uses custom layout with KeyboardAvoidingView
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <KeyboardAvoidingView"""

text = re.sub(pattern, replacement, text)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(text)

