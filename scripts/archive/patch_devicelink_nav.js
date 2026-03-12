const fs = require('fs');

let nav = fs.readFileSync('../src/navigation/RootNavigator.tsx', 'utf-8');
if (!nav.includes('DeviceLinkScreen')) {
  nav = nav.replace(
    "import DoomscrollGuideScreen from '../screens/DoomscrollGuideScreen';",
    "import DoomscrollGuideScreen from '../screens/DoomscrollGuideScreen';\nimport DeviceLinkScreen from '../screens/DeviceLinkScreen';"
  );
  nav = nav.replace(
    "</Stack.Navigator>",
    "  <Stack.Screen name=\"DeviceLink\" component={DeviceLinkScreen} options={{ presentation: 'modal' }} />\n    </Stack.Navigator>"
  );
  fs.writeFileSync('../src/navigation/RootNavigator.tsx', nav);
}

let navTypes = fs.readFileSync('../src/navigation/types.ts', 'utf-8');
if (!navTypes.includes('DeviceLink:')) {
  navTypes = navTypes.replace(
    "export type RootStackParamList = {",
    "export type RootStackParamList = {\n  DeviceLink: undefined;"
  );
  fs.writeFileSync('../src/navigation/types.ts', navTypes);
}

// Add the link button to Settings or Home
let settings = fs.readFileSync('../src/screens/SettingsScreen.tsx', 'utf-8');
const linkBtn = `
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MULTI-DEVICE</Text>
          <TouchableOpacity style={styles.dangerBtn} onPress={() => navigation.getParent()?.navigate('DeviceLink' as any)}>
            <Text style={styles.dangerBtnText}>🔗 Link Devices (Tablet + Phone)</Text>
          </TouchableOpacity>
        </View>
`;
if (!settings.includes('DeviceLink')) {
  settings = settings.replace(
    "{/* Danger Zone */}",
    linkBtn + "\n        {/* Danger Zone */}"
  );
  fs.writeFileSync('../src/screens/SettingsScreen.tsx', settings);
}

console.log('Added DeviceLink to Nav and Settings');
