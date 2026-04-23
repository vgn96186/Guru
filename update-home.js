const fs = require('fs');
let code = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');

// 1. Import ScreenShell
code = code.replace(
  "import { SafeAreaView } from 'react-native-safe-area-context';",
  "import { SafeAreaView } from 'react-native-safe-area-context';\nimport ScreenShell from '../components/ScreenShell';"
);

// 2. Replace HomeSkeleton's wrapper
code = code.replace(
  /<SafeAreaView style=\{styles\.safe\}>\s*<ResponsiveContainer>\s*<ScreenMotion isFocused=\{isFocused\}>\s*<HomeSkeleton \/>\s*<\/ScreenMotion>\s*<\/ResponsiveContainer>\s*<\/SafeAreaView>/m,
  '<ScreenShell style={styles.safe} scrollable={false}>\n      <ScreenMotion isFocused={isFocused}>\n        <HomeSkeleton />\n      </ScreenMotion>\n    </ScreenShell>'
);

// 3. Replace the main render wrapper
const oldMainWrapper = `<SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={n.colors.accent}
            colors={[n.colors.accent]}
          />
        }
      >
        <ResponsiveContainer>
          <ScreenMotion isFocused={isFocused}>`;

const newMainWrapper = `<ScreenShell
      style={styles.safe}
      scrollViewProps={{
        contentContainerStyle: styles.scrollContent,
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={n.colors.accent}
            colors={[n.colors.accent]}
          />
        )
      }}
    >
      <ScreenMotion isFocused={isFocused}>`;

code = code.replace(oldMainWrapper, newMainWrapper);

// 4. Replace the matching closing tags for the main render
const oldMainFooter = `          </ScreenMotion>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>`;

const newMainFooter = `      </ScreenMotion>
    </ScreenShell>`;

code = code.replace(oldMainFooter, newMainFooter);

fs.writeFileSync('src/screens/HomeScreen.tsx', code);
console.log("Updated HomeScreen");
