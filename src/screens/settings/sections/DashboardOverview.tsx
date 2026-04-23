import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';
import SettingsToggleRow from '../components/SettingsToggleRow';
import { useProfileQuery } from '../../../hooks/queries/useProfile';
import { SettingsActionButton } from '../../../components/settings/SettingsActionButton';
import { SettingsChip } from '../../../components/settings/SettingsChip';

export function DashboardOverview(props: any) {
  const {
    isTablet,
    providerOrder,
    localLlmReady,
    setActiveCategory,
    localModel,
    setLocalModel,
    faceTracking,
    setFaceTracking,
    strictMode,
    setStrictMode,
    dailyGoal,
    setDailyGoal,
  } = props;

  const { data: profile } = useProfileQuery();

  const topProviders = (providerOrder || ['groq', 'openrouter', 'deepseek']).slice(0, 3);

  const renderProviderDot = (index: number) => {
    if (index === 0) return '#10B981'; // emerald-500
    if (index === 1) return '#10B981'; // emerald-500
    return '#EAB308'; // yellow-500
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
      {/* 1. AI & Inference */}
      <View style={{ flexBasis: isTablet ? '48%' : '100%', flexGrow: 1 }}>
        <LinearSurface compact style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Ionicons name="sparkles" size={16} color="#5E6AD2" />
            <LinearText variant="title" style={{ fontSize: 16, color: '#E8E8E8' }}>
              AI Intelligence
            </LinearText>
          </View>
          <View style={{ gap: 16 }}>
            <View
              style={{
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <LinearText
                      variant="body"
                      style={{ fontSize: 14, fontWeight: '500', color: '#E8E8E8' }}
                    >
                      Local Model
                    </LinearText>
                    <SettingsChip label="READY" active />
                  </View>
                  <LinearText
                    variant="meta"
                    tone="secondary"
                    style={{ fontSize: 13, marginTop: 4 }}
                  >
                    Gemma 4 (E4B 128K context)
                  </LinearText>
                </View>
                <SettingsToggleRow
                  label=""
                  value={localModel ?? true}
                  onValueChange={(val) => setLocalModel(val)}
                  style={{ paddingVertical: 0, borderBottomWidth: 0 }}
                />
              </View>
            </View>

            <View>
              <LinearText
                variant="meta"
                tone="muted"
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                Cloud Routing Priority
              </LinearText>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  overflow: 'hidden',
                }}
              >
                {topProviders.map((provider: string, index: number) => (
                  <View
                    key={provider}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 10,
                      borderBottomWidth: index === 2 ? 0 : 1,
                      borderBottomColor: 'rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <LinearText variant="meta" tone="muted" style={{ fontSize: 12 }}>
                        {index + 1}
                      </LinearText>
                      <LinearText
                        variant="body"
                        tone="secondary"
                        style={{ fontSize: 13, textTransform: 'capitalize' }}
                      >
                        {provider}
                      </LinearText>
                    </View>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: renderProviderDot(index),
                      }}
                    />
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity onPress={() => setActiveCategory('ai')} style={{ marginTop: 8 }}>
              <LinearText
                variant="body"
                style={{ color: '#5E6AD2', fontSize: 13, fontWeight: '500' }}
              >
                Manage Keys & Models →
              </LinearText>
            </TouchableOpacity>
          </View>
        </LinearSurface>
      </View>

      {/* 2. Interventions */}
      <View style={{ flexBasis: isTablet ? '48%' : '100%', flexGrow: 1 }}>
        <LinearSurface compact style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Ionicons name="shield" size={16} color="#F87171" />
            <LinearText variant="title" style={{ fontSize: 16, color: '#E8E8E8' }}>
              Focus & Rules
            </LinearText>
          </View>
          <View style={{ gap: 16 }}>
            <SettingsToggleRow
              label="Doomscroll Shield"
              hint="Detect app switching via AppState"
              value={true}
              onValueChange={() => {}}
              activeTrackColor="#F87171"
              style={{
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255, 255, 255, 0.08)',
              }}
            />
            <SettingsToggleRow
              label="Face Tracking (ML Kit)"
              hint="Alert if absent/drowsy during lectures"
              value={faceTracking ?? true}
              onValueChange={(val) => setFaceTracking(val)}
              activeTrackColor="#F87171"
              style={{
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255, 255, 255, 0.08)',
              }}
            />
            <SettingsToggleRow
              label="Strict Mode"
              hint="Lock out of external apps during study"
              value={strictMode ?? false}
              onValueChange={(val) => setStrictMode(val)}
              activeTrackColor="#F87171"
              style={{ paddingVertical: 8, borderBottomWidth: 0 }}
            />
          </View>
        </LinearSurface>
      </View>

      {/* 3. App Integrations */}
      <View style={{ flexBasis: isTablet ? '48%' : '100%', flexGrow: 1 }}>
        <LinearSurface compact style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Ionicons name="apps" size={16} color="#10B981" />
            <LinearText variant="title" style={{ fontSize: 16, color: '#E8E8E8' }}>
              Integrations & OS
            </LinearText>
          </View>
          <View style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LinearText variant="body" style={{ color: '#E8E8E8', fontWeight: 'bold' }}>
                    D
                  </LinearText>
                </View>
                <View>
                  <LinearText
                    variant="body"
                    style={{ fontSize: 14, fontWeight: '500', color: '#E8E8E8' }}
                  >
                    DBMCI One
                  </LinearText>
                  <LinearText variant="meta" tone="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    Not linked
                  </LinearText>
                </View>
              </View>
              <SettingsActionButton label="Link" onPress={() => {}} />
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LinearText variant="body" style={{ color: '#E8E8E8', fontWeight: 'bold' }}>
                    B
                  </LinearText>
                </View>
                <View>
                  <LinearText
                    variant="body"
                    style={{ fontSize: 14, fontWeight: '500', color: '#E8E8E8' }}
                  >
                    BTR App
                  </LinearText>
                  <LinearText variant="meta" tone="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    Not linked
                  </LinearText>
                </View>
              </View>
              <SettingsActionButton label="Link" onPress={() => {}} />
            </View>
            <TouchableOpacity
              onPress={() => setActiveCategory('integrations')}
              style={{
                marginTop: 16,
                width: '100%',
                alignItems: 'center',
                paddingVertical: 10,
                backgroundColor: 'rgba(94, 106, 210, 0.05)',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: 'rgba(94, 106, 210, 0.2)',
              }}
            >
              <LinearText
                variant="body"
                style={{ fontSize: 13, color: '#5E6AD2', fontWeight: '500' }}
              >
                Manage Overlay Permissions
              </LinearText>
            </TouchableOpacity>
          </View>
        </LinearSurface>
      </View>

      {/* 4. Planning & Alerts */}
      <View style={{ flexBasis: isTablet ? '48%' : '100%', flexGrow: 1 }}>
        <LinearSurface compact style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Ionicons name="calendar" size={16} color="#F6AD55" />
            <LinearText variant="title" style={{ fontSize: 16, color: '#E8E8E8' }}>
              Goals & Timeline
            </LinearText>
          </View>
          <View style={{ gap: 16 }}>
            <View>
              <LinearText
                variant="meta"
                tone="muted"
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                Target Exam
              </LinearText>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                }}
              >
                <LinearText
                  variant="body"
                  style={{ fontSize: 13, fontWeight: '500', color: '#E8E8E8' }}
                >
                  NEET-PG Target
                </LinearText>
                <SettingsChip label="ACTIVE" active />
              </View>
            </View>

            <View style={{ marginTop: 4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <LinearText
                  variant="body"
                  style={{ fontSize: 13, fontWeight: '500', color: '#E8E8E8' }}
                >
                  Morning Wake Up
                </LinearText>
                <SettingsChip label="06:30 AM" />
              </View>
              <View
                style={{
                  width: '100%',
                  height: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <View style={{ width: '40%', height: '100%', backgroundColor: '#5E6AD2' }} />
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setActiveCategory('planning')}
              style={{ marginTop: 8 }}
            >
              <LinearText
                variant="body"
                style={{ color: '#F6AD55', fontSize: 13, fontWeight: '500', textAlign: 'center' }}
              >
                Manage Reminders →
              </LinearText>
            </TouchableOpacity>
          </View>
        </LinearSurface>
      </View>
    </View>
  );
}
