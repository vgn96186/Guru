import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

# Add isSidebarCollapsed state
if "const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);" not in content:
    content = re.sub(
        r'(const \[activeCategory, setActiveCategory\] = useState<SettingsCategory>\(\'general\'\);)',
        r'\1\n  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);',
        content
    )

# Replace the entire return block
new_return = """  return (
    <SafeAreaView style={styles.safe} className="bg-[#141517] flex-1">
      <StatusBar barStyle="light-content" backgroundColor="#141517" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Header */}
        <View className="h-14 border-b border-[#292A2D] flex-row items-center justify-between px-4 bg-[#141517]/80 z-20">
          <View className="flex-row items-center gap-3">
            <TouchableOpacity onPress={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-1.5 rounded-md hover:bg-[#222327]">
              <LinearText variant="body" tone="secondary">☰</LinearText>
            </TouchableOpacity>
            <View className="w-px h-4 bg-[#292A2D] mx-1" />
            <View className="flex-row items-center gap-2">
              <TouchableOpacity onPress={() => navigation.navigate('MenuHome')}>
                <LinearText variant="body" tone="secondary">Hub</LinearText>
              </TouchableOpacity>
              <LinearText variant="body" tone="muted">/</LinearText>
              <LinearText variant="body" tone="primary">
                {activeCategoryMeta.label}
              </LinearText>
            </View>
          </View>
          {saving && (
            <View className="flex-row items-center bg-[#5E6AD2]/10 px-2 py-1 rounded-md border border-[#5E6AD2]/20">
              <ActivityIndicator size="small" color="#5E6AD2" />
              <LinearText variant="bodySmall" className="ml-2 text-[#5E6AD2]">Saving</LinearText>
            </View>
          )}
        </View>

        <View className="flex-1 flex-row bg-[#141517]">
          {isTabletLayout ? (
            <SettingsSidebar
              activeCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              isCollapsed={isSidebarCollapsed}
              profileName={profile?.displayName || 'Doctor'}
              totalXp={profile?.totalXp || 0}
            />
          ) : null}

          <View className="flex-1 min-w-0">
            <ScrollView
              contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
              className="bg-[#141517]"
            >
              <View className="max-w-5xl w-full mx-auto">
                {!isTabletLayout ? renderMobileCategoryNav() : null}
                
                {activeCategory === 'general' && (
                  <View className="flex-col md:flex-row gap-6 md:items-center justify-between border border-[#292A2D] rounded-xl p-5 bg-[#1B1C1F] shadow-sm mb-6">
                    <View className="flex-row items-center gap-4">
                      <View className="w-14 h-14 rounded-full bg-[#5E6AD2] flex items-center justify-center ring-4 ring-[#141517]">
                        <LinearText variant="display" style={{ color: 'white', fontSize: 24 }}>{(profile?.displayName || 'V').charAt(0)}</LinearText>
                      </View>
                      <View>
                        <LinearText variant="title" style={{ fontSize: 18, color: '#E8E8E8' }}>{profile?.displayName || 'Doctor'}</LinearText>
                        <LinearText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>Target: NEET-PG</LinearText>
                      </View>
                    </View>
                    <View className="flex-row gap-6">
                      <View className="flex-col">
                        <LinearText variant="meta" tone="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>TOTAL XP</LinearText>
                        <LinearText variant="title" style={{ fontSize: 18, color: '#E8E8E8' }}>{profile?.totalXp || 0}</LinearText>
                      </View>
                      <View className="w-px bg-[#292A2D]" />
                      <View className="flex-col">
                        <LinearText variant="meta" tone="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>STREAK</LinearText>
                        <LinearText variant="title" style={{ fontSize: 18, color: '#F6AD55' }}>{profile?.currentStreak || 0} Days</LinearText>
                      </View>
                      <View className="w-px bg-[#292A2D]" />
                      <View className="flex-col">
                        <LinearText variant="meta" tone="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>MASTERED</LinearText>
                        <LinearText variant="title" style={{ fontSize: 18, color: '#4ADE80' }}>0</LinearText>
                      </View>
                    </View>
                  </View>
                )}

                {renderActiveCategoryContent()}
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );"""

match = re.search(r'  return \(\n    <SafeAreaView.*?  \);\n}', content, re.DOTALL | re.MULTILINE)
if match:
    content = content[:match.start()] + new_return + content[match.end():]
    with open('src/screens/SettingsScreen.tsx', 'w') as f:
        f.write(content)
    print("Updated return block!")
else:
    print("Return block not found.")

