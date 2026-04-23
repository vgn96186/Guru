const fs = require('fs');
let code = fs.readFileSync('src/screens/SettingsScreen.tsx', 'utf8');

// 1. Import ScreenShell
code = code.replace(
  "import { SafeAreaView } from 'react-native-safe-area-context';",
  "import { SafeAreaView } from 'react-native-safe-area-context';\nimport ScreenShell from '../components/ScreenShell';"
);

// 2. Replace the main render wrapper
const oldMainWrapper = `<SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ResponsiveContainer>
          <ScreenMotion isFocused={isFocused}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >`;

const newMainWrapper = `<ScreenShell
      style={styles.safe}
      scrollViewProps={{
        contentContainerStyle: styles.scrollContent
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScreenMotion isFocused={isFocused}>`;

code = code.replace(oldMainWrapper, newMainWrapper);

// 3. Replace the matching closing tags
const oldMainFooter = `            </ScrollView>
          </ScreenMotion>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>`;

const newMainFooter = `        </ScreenMotion>
      </KeyboardAvoidingView>
    </ScreenShell>`;

code = code.replace(oldMainFooter, newMainFooter);

fs.writeFileSync('src/screens/SettingsScreen.tsx', code);
console.log("Updated SettingsScreen");
