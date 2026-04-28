import React from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../../../components/primitives/LinearText';
import { linearTheme as n } from '../../../../../theme/linearTheme';
import ApiKeyRow from '../components/ApiKeyRow';
import CloudflareKeyRow from '../components/CloudflareKeyRow';
import VertexKeyRow from '../components/VertexKeyRow';
import type { AiProvidersProps } from '../types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ── types ──────────────────────────────────────────────────────────── */

type ProviderCategory = 'chat' | 'transcription' | 'search' | 'infra';

type ApiKeyItem = {
  id: string;
  category: ProviderCategory;
  configured: boolean;
  testing: boolean;
  test: () => void | Promise<void>;
  element: React.ReactNode;
};

const CATEGORY_META: Record<
  ProviderCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; description: string }
> = {
  chat: {
    label: 'Chat & Reasoning',
    icon: 'chatbubbles-outline',
    tint: '#5E6AD2',
    description: 'Core providers for AI chat, reasoning, and generation',
  },
  transcription: {
    label: 'Transcription',
    icon: 'mic-outline',
    tint: '#6D99FF',
    description: 'Audio transcription and speech-to-text',
  },
  search: {
    label: 'Search & Media',
    icon: 'search-outline',
    tint: '#3FB950',
    description: 'Web search, image generation, and media services',
  },
  infra: {
    label: 'Cloud Platforms',
    icon: 'cloud-outline',
    tint: '#D97706',
    description: 'Enterprise cloud platform credentials',
  },
};

const CATEGORY_ORDER: ProviderCategory[] = ['chat', 'transcription', 'search', 'infra'];

/* ── collapsible category group ─────────────────────────────────────── */

function CategoryGroup({
  category,
  items,
  styles,
  defaultExpanded,
}: {
  category: ProviderCategory;
  items: ApiKeyItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? true);
  const meta = CATEGORY_META[category];
  const configuredCount = items.filter((i) => i.configured).length;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={categoryStyles.container}>
      {/* Tappable header */}
      <TouchableOpacity style={categoryStyles.header} onPress={toggle} activeOpacity={0.7}>
        <View style={[categoryStyles.iconWrap, { backgroundColor: meta.tint + '18' }]}>
          <Ionicons name={meta.icon} size={16} color={meta.tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <LinearText variant="label" style={{ fontWeight: '700', letterSpacing: 0.3 }}>
            {meta.label}
          </LinearText>
          <LinearText variant="caption" tone="muted" style={{ marginTop: 1 }}>
            {meta.description}
          </LinearText>
        </View>
        <View style={categoryStyles.rightGroup}>
          <View style={categoryStyles.countBadge}>
            <LinearText variant="caption" tone="accent" style={{ fontWeight: '800' }}>
              {configuredCount}/{items.length}
            </LinearText>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={n.colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Collapsible body — vertical stack */}
      {expanded && (
        <View style={categoryStyles.body}>
          {items.map((item) => (
            <React.Fragment key={item.id}>{item.element}</React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const categoryStyles = {
  container: {
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rightGroup: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  countBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    backgroundColor: n.colors.primaryTintSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  body: {
    marginTop: 6,
    gap: 0,
  },
};

/* ── section divider ────────────────────────────────────────────────── */

function SectionDivider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: n.colors.border,
        marginVertical: 10,
      }}
    />
  );
}

/* ── main section ───────────────────────────────────────────────────── */

export default function ApiKeysSection({
  apiKeys,
  clearProviderValidated,
  SectionToggle,
  styles,
}: {
  apiKeys: AiProvidersProps['apiKeys'];
  clearProviderValidated: AiProvidersProps['clearProviderValidated'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}) {
  const [validatingAll, setValidatingAll] = React.useState(false);

  const items = React.useMemo<ApiKeyItem[]>(
    () => [
      /* ── Chat & Reasoning ─────────────────────────────── */
      {
        id: 'groq',
        category: 'chat',
        configured: Boolean(apiKeys.groq.value.trim()),
        testing: apiKeys.groq.testing,
        test: apiKeys.groq.test,
        element: (
          <ApiKeyRow
            {...apiKeys.groq}
            label="Groq"
            placeholder="gsk_..."
            purpose="Fast chat + transcription"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="groq"
          />
        ),
      },
      {
        id: 'gemini',
        category: 'chat',
        configured: Boolean(apiKeys.gemini.value.trim()),
        testing: apiKeys.gemini.testing,
        test: apiKeys.gemini.test,
        element: (
          <ApiKeyRow
            {...apiKeys.gemini}
            label="AI Studio"
            placeholder="AIzaSy... or AQ..."
            purpose="Gemini models via API key"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="gemini"
          />
        ),
      },
      {
        id: 'openrouter',
        category: 'chat',
        configured: Boolean(apiKeys.openrouter.value.trim()),
        testing: apiKeys.openrouter.testing,
        test: apiKeys.openrouter.test,
        element: (
          <ApiKeyRow
            {...apiKeys.openrouter}
            label="OpenRouter"
            placeholder="sk-or-v1-..."
            purpose="Model fallback hub"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="openrouter"
          />
        ),
      },
      {
        id: 'deepseek',
        category: 'chat',
        configured: Boolean(apiKeys.deepseek.value.trim()),
        testing: apiKeys.deepseek.testing,
        test: apiKeys.deepseek.test,
        element: (
          <ApiKeyRow
            {...apiKeys.deepseek}
            label="DeepSeek"
            placeholder="sk-..."
            purpose="Reasoning fallback"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="deepseek"
          />
        ),
      },
      {
        id: 'github',
        category: 'chat',
        configured: Boolean(apiKeys.githubModelsPat.value.trim()),
        testing: apiKeys.githubModelsPat.testing,
        test: apiKeys.githubModelsPat.test,
        element: (
          <ApiKeyRow
            {...apiKeys.githubModelsPat}
            label="GitHub Models"
            placeholder="GitHub PAT (Models read)"
            purpose="Optional model access"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="github"
          />
        ),
      },

      /* ── Transcription ────────────────────────────────── */
      {
        id: 'deepgram',
        category: 'transcription',
        configured: Boolean(apiKeys.deepgram.value.trim()),
        testing: apiKeys.deepgram.testing,
        test: apiKeys.deepgram.test,
        element: (
          <ApiKeyRow
            {...apiKeys.deepgram}
            label="Deepgram"
            placeholder="dg_..."
            purpose="Lecture transcription"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="deepgram"
          />
        ),
      },

      {
        id: 'huggingface',
        category: 'transcription',
        configured: Boolean(apiKeys.huggingface?.value?.trim()),
        testing: apiKeys.huggingface?.testing ?? false,
        test: apiKeys.huggingface?.test ?? (() => {}),
        element: (
          <ApiKeyRow
            {...(apiKeys.huggingface as any)}
            label="Hugging Face"
            placeholder="hf_..."
            purpose="Free Transcription"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="huggingface"
          />
        ),
      },

      /* ── Search & Media ───────────────────────────────── */
      {
        id: 'fal',
        category: 'search',
        configured: Boolean(apiKeys.fal.value.trim()),
        testing: apiKeys.fal.testing,
        test: apiKeys.fal.test,
        element: (
          <ApiKeyRow
            {...apiKeys.fal}
            label="fal.ai"
            placeholder="fal_..."
            purpose="Image generation"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="fal"
          />
        ),
      },
      {
        id: 'braveSearch',
        category: 'search',
        configured: Boolean(apiKeys.braveSearch.value.trim()),
        testing: apiKeys.braveSearch.testing,
        test: apiKeys.braveSearch.test,
        element: (
          <ApiKeyRow
            {...apiKeys.braveSearch}
            label="Brave Search"
            placeholder="BSA..."
            purpose="Web search API"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="braveSearch"
          />
        ),
      },

      /* ── Cloud Platforms ──────────────────────────────── */
      {
        id: 'fal',
        category: 'search',
        configured: Boolean(apiKeys.fal.value.trim()),
        testing: apiKeys.fal.testing,
        test: apiKeys.fal.test,
        element: (
          <ApiKeyRow
            {...apiKeys.fal}
            label="fal.ai"
            placeholder="key"
            purpose="Image Generation"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="fal"
          />
        ),
      },
      {
        id: 'jina',
        category: 'search',
        configured: Boolean(apiKeys.jina.value.trim()),
        testing: apiKeys.jina.testing,
        test: apiKeys.jina.test,
        element: (
          <ApiKeyRow
            {...apiKeys.jina}
            label="Jina AI"
            placeholder="jina_..."
            purpose="Embeddings & Search"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="jina"
          />
        ),
      },
      {
        id: 'cloudflare',
        category: 'infra',
        configured: Boolean(
          apiKeys.cloudflare.accountId.trim() && apiKeys.cloudflare.apiToken.trim(),
        ),
        testing: apiKeys.cloudflare.testing,
        test: apiKeys.cloudflare.test,
        element: (
          <CloudflareKeyRow
            {...apiKeys.cloudflare}
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="cf"
          />
        ),
      },
      {
        id: 'vertex',
        category: 'infra',
        configured: Boolean(apiKeys.vertex.token.trim()),
        testing: apiKeys.vertex.testing,
        test: apiKeys.vertex.test,
        element: (
          <VertexKeyRow
            {...apiKeys.vertex}
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="vertex"
          />
        ),
      },

      {
        id: 'kilo',
        category: 'chat',
        configured: Boolean(apiKeys.kilo.value.trim()),
        testing: apiKeys.kilo.testing,
        test: apiKeys.kilo.test,
        element: (
          <ApiKeyRow
            {...apiKeys.kilo}
            label="Kilo"
            placeholder="kilo_..."
            purpose="Experimental provider"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="kilo"
          />
        ),
      },
      {
        id: 'agentrouter',
        category: 'chat',
        configured: Boolean(apiKeys.agentRouter.value.trim()),
        testing: apiKeys.agentRouter.testing,
        test: apiKeys.agentRouter.test,
        element: (
          <ApiKeyRow
            {...apiKeys.agentRouter}
            label="AgentRouter"
            placeholder="sk-..."
            purpose="Experimental routing"
            styles={styles}
            clearProviderValidated={clearProviderValidated}
            providerId="agentrouter"
          />
        ),
      },
    ],
    [apiKeys, clearProviderValidated, styles],
  );

  /* ── derived ──────────────────────────────────────────────────────── */

  const configuredItems = items.filter((i) => i.configured);
  const isTestingAny = items.some((i) => i.testing);

  const groups = React.useMemo(() => {
    const out: { category: ProviderCategory; items: ApiKeyItem[] }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catItems = items.filter((i) => i.category === cat);
      if (catItems.length > 0) out.push({ category: cat, items: catItems });
    }
    return out;
  }, [items]);

  const validateConfigured = async () => {
    if (!configuredItems.length) return;
    setValidatingAll(true);
    try {
      for (const item of configuredItems) {
        await Promise.resolve(item.test());
      }
    } finally {
      setValidatingAll(false);
    }
  };

  return (
    <SectionToggle id="ai_keys" title="API Keys" icon="key" tint="#F59E0B">
      {/* ── Validate all bar ────────────────── */}
      <View style={validateBarStyles.row}>
        <View style={validateBarStyles.stat}>
          <Ionicons name="key-outline" size={14} color={n.colors.accent} />
          <LinearText variant="caption" tone="accent" style={{ fontWeight: '700' }}>
            {configuredItems.length}/{items.length} configured
          </LinearText>
        </View>
        <TouchableOpacity
          style={[
            validateBarStyles.btn,
            (!configuredItems.length || isTestingAny) && { opacity: 0.5 },
          ]}
          onPress={validateConfigured}
          disabled={!configuredItems.length || isTestingAny || validatingAll}
          activeOpacity={0.82}
        >
          {validatingAll ? (
            <ActivityIndicator size="small" color={n.colors.accent} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flash-outline" size={14} color={n.colors.accent} />
              <LinearText variant="caption" tone="accent" style={{ fontWeight: '800' }}>
                Validate all
              </LinearText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Categorised providers ───────────── */}
      {groups.map((group, idx) => (
        <React.Fragment key={group.category}>
          {idx > 0 && <SectionDivider />}
          <CategoryGroup
            category={group.category}
            items={group.items}
            styles={styles}
            defaultExpanded={group.category === 'chat'}
          />
        </React.Fragment>
      ))}
    </SectionToggle>
  );
}

/* ── inline styles ──────────────────────────────────────────────────── */

const validateBarStyles = {
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 16,
  },
  stat: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  btn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    backgroundColor: n.colors.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
};
