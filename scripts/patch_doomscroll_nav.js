const fs = require('fs');

let nav = fs.readFileSync('../src/navigation/RootNavigator.tsx', 'utf-8');
if (!nav.includes('DoomscrollGuideScreen')) {
  nav = nav.replace(
    "import LockdownScreen from '../screens/LockdownScreen';",
    "import LockdownScreen from '../screens/LockdownScreen';\nimport DoomscrollGuideScreen from '../screens/DoomscrollGuideScreen';"
  );
  nav = nav.replace(
    "</Stack.Navigator>",
    "  <Stack.Screen name=\"DoomscrollGuide\" component={DoomscrollGuideScreen} options={{ presentation: 'modal' }} />\n    </Stack.Navigator>"
  );
  fs.writeFileSync('../src/navigation/RootNavigator.tsx', nav);
}

let navTypes = fs.readFileSync('../src/navigation/types.ts', 'utf-8');
if (!navTypes.includes('DoomscrollGuide:')) {
  navTypes = navTypes.replace(
    "export type RootStackParamList = {",
    "export type RootStackParamList = {\n  DoomscrollGuide: undefined;"
  );
  fs.writeFileSync('../src/navigation/types.ts', navTypes);
}

// Add the button to Home
let home = fs.readFileSync('../src/screens/HomeScreen.tsx', 'utf-8');
const buttonHtml = `
        <TouchableOpacity 
          style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#1A1A24', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FF9800', flexDirection: 'row', alignItems: 'center' }} 
          onPress={() => navigation.getParent()?.navigate('DoomscrollGuide')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 24, marginRight: 12 }}>📱</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FF9800', fontWeight: '800', fontSize: 14, textTransform: 'uppercase' }}>App Hijack Mode</Text>
            <Text style={{ color: '#9E9E9E', fontSize: 11, marginTop: 2 }}>Learn how to force your phone to open this app instead of Instagram.</Text>
          </View>
        </TouchableOpacity>
`;

if (!home.includes('App Hijack Mode')) {
  home = home.replace(
    "{/* Boss Battle Entry */}",
    "{/* Boss Battle Entry */}\n" + buttonHtml
  );
  fs.writeFileSync('../src/screens/HomeScreen.tsx', home);
}

console.log('Added Doomscroll Guide to Nav and Home');
