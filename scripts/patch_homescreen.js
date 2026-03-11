const fs = require('fs');
let code = fs.readFileSync('../src/screens/HomeScreen.tsx', 'utf-8');

const oldLink = `<TouchableOpacity onPress={() => navigation.navigate('Inertia')}>
            <Text style={styles.cantStartText}>Can't start? 🐢 Tap here.</Text>
          </TouchableOpacity>`;

const newLink = `<TouchableOpacity 
            style={{ marginTop: 16, backgroundColor: '#2A1A1A', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#FF572244', flexDirection: 'row', alignItems: 'center' }} 
            onPress={() => navigation.navigate('Inertia')}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 24, marginRight: 12 }}>🐢</Text>
            <View>
              <Text style={{ color: '#FF5722', fontWeight: '800', fontSize: 15 }}>Task Paralysis?</Text>
              <Text style={{ color: '#9E9E9E', fontSize: 12, marginTop: 2 }}>Tap here to break the cycle</Text>
            </View>
          </TouchableOpacity>`;

code = code.replace(oldLink, newLink);
fs.writeFileSync('../src/screens/HomeScreen.tsx', code);
console.log('Upgraded Inertia button on HomeScreen.tsx');
