import type { MedicalGroundingSource, Message } from '../types';
import { generateText } from '../v2/generateText';
import { createGuruFallbackModel } from '../v2/providers/guruFallback';
import { logGroundingEvent, previewText } from '../runtimeDebug';
import { profileRepository } from '../../../db/repositories';
import { DEFAULT_PROVIDER_ORDER } from '../../../types';
import { getMedicalImageForTopic } from '../../medicalImageMap';

import { clipText, renderSourcesForPrompt } from './utils';
import { getCachedImageSearch, setCachedImageSearch } from './cache';
import { dedupeGroundingSources, rankGroundingSources } from './ranking';
import {
  buildMedicalSearchQuery,
  buildImageSearchQueryLadder,
  compactImageSearchQuery,
} from './queryBuilder';

import { searchWikimediaCommons } from './providers/wikimedia';
import { searchGoogleCustomSearch } from './providers/google';
import { searchWikipedia } from './providers/wikipedia';
import { searchOpeni } from './providers/openi';
import { searchDuckDuckGo, searchDuckDuckGoImages } from './providers/duckduckgo';
import { searchBraveImages, searchBraveText } from './providers/brave';
import { searchEuropePMC } from './providers/europepmc';
import { searchPubMedFallback } from './providers/pubmed';

/**
 * Search for medical images using specialized medical image databases.
 * Falls back to article sources only if no images found.
 */
export async function searchMedicalImages(
  query: string,
  maxResults = 6,
): Promise<MedicalGroundingSource[]> {
  // Check cache first
  const cachedUrl = getCachedImageSearch(query);
  if (cachedUrl !== undefined) {
    if (cachedUrl === null) return []; // Previously searched, no results found
    // For cached URLs, return a minimal source entry
    return [
      {
        id: `cached-${query.slice(0, 20)}`,
        title: query,
        url: cachedUrl,
        imageUrl: cachedUrl,
        snippet: query,
        source: 'Wikimedia Commons' as const,
      },
    ];
  }

  logGroundingEvent('image_search_start', {
    query: previewText(query, 140),
    maxResults,
  });
  if (__DEV__) console.log('[MedicalSearch] Image query:', query);

  async function runImageSearch(searchQuery: string) {
    const [commons, google, wikipedia, openi, duckduckgo, brave] = await Promise.allSettled([
      searchWikimediaCommons(searchQuery, Math.min(3, maxResults)),
      searchGoogleCustomSearch(searchQuery, Math.min(3, maxResults)),
      searchWikipedia(searchQuery, Math.min(3, maxResults)),
      searchOpeni(searchQuery, Math.min(3, maxResults)),
      searchDuckDuckGoImages(searchQuery, Math.min(3, maxResults)),
      searchBraveImages(searchQuery, Math.min(3, maxResults)),
    ]);

    const collected: MedicalGroundingSource[] = [];
    // Wikimedia Commons first — best source for textbook diagrams (Gray's Anatomy plates, labeled anatomy diagrams)
    if (commons.status === 'fulfilled') collected.push(...commons.value);
    // Google Custom Search second (user-configured, searches curated medical sites)
    if (google.status === 'fulfilled') collected.push(...google.value);
    // Wikipedia article thumbnails (usually the standard textbook image)
    if (collected.length === 0 && wikipedia.status === 'fulfilled') {
      collected.push(...wikipedia.value.filter((row) => Boolean(row.imageUrl)));
    }
    // Open-i last — returns research paper figures, not study diagrams
    if (collected.length === 0 && openi.status === 'fulfilled') collected.push(...openi.value);
    if (collected.length === 0 && duckduckgo.status === 'fulfilled')
      collected.push(...duckduckgo.value);
    if (collected.length === 0 && brave.status === 'fulfilled') collected.push(...brave.value);

    return {
      collected,
      commons,
      google,
      wikipedia,
      openi,
      duckduckgo,
      brave,
    };
  }

  const queryLadder = buildImageSearchQueryLadder(query);
  let effectiveQuery = queryLadder[0] ?? query;
  let collected: MedicalGroundingSource[] = [];
  let google: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let openi: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let commons: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let wikipedia: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let duckduckgo: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let brave: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };

  if (queryLadder.length > 1) {
    logGroundingEvent('image_search_broadened', {
      originalQuery: previewText(query, 140),
      queryLadder: queryLadder.map((entry) => previewText(entry, 140)),
    });
  }

  for (const candidateQuery of queryLadder) {
    effectiveQuery = candidateQuery;
    const result = await runImageSearch(candidateQuery);
    openi = result.openi;
    commons = result.commons;
    wikipedia = result.wikipedia;
    duckduckgo = result.duckduckgo;
    brave = result.brave;
    google = result.google;
    collected = dedupeGroundingSources([...collected, ...result.collected]);
    if (collected.length >= maxResults) {
      break;
    }
  }

  logGroundingEvent('image_search_complete', {
    query: previewText(effectiveQuery, 140),
    originalQuery: previewText(query, 140),
    queryLadder: queryLadder.map((entry) => previewText(entry, 140)),
    totalCollected: collected.length,
    providerBreakdown: {
      google: google.status === 'fulfilled' ? google.value.length : 'failed',
      openi: openi.status === 'fulfilled' ? openi.value.length : 'failed',
      commons: commons.status === 'fulfilled' ? commons.value.length : 'failed',
      duckduckgo: duckduckgo.status === 'fulfilled' ? duckduckgo.value.length : 'failed',
      wikipedia: wikipedia.status === 'fulfilled' ? wikipedia.value.length : 'failed',
      brave: brave.status === 'fulfilled' ? brave.value.length : 'failed',
    },
    sampleTitles: collected.slice(0, 3).map((row) => previewText(row.title, 80)),
    sampleUrls: collected.slice(0, 3).map((row) => previewText(row.imageUrl ?? row.url, 120)),
  });

  if (__DEV__)
    console.log(
      `[MedicalSearch] Images found: ${collected.length} (google: ${
        google.status === 'fulfilled' ? google.value.length : 'failed'
      }, openi: ${openi.status === 'fulfilled' ? openi.value.length : 'failed'}, commons: ${
        commons.status === 'fulfilled' ? commons.value.length : 'failed'
      }, duckduckgo: ${
        duckduckgo.status === 'fulfilled' ? duckduckgo.value.length : 'failed'
      }, wikipedia: ${
        wikipedia.status === 'fulfilled' ? wikipedia.value.length : 'failed'
      }, brave: ${brave.status === 'fulfilled' ? brave.value.length : 'failed'})`,
    );

  if (collected.length === 0) {
    // Final fallback: static pre-mapped medical images for high-yield NEET-PG topics
    const mappedImage = getMedicalImageForTopic(query);
    if (mappedImage) {
      if (__DEV__) console.log(`[MedicalSearch] Using pre-mapped image for: ${query}`);
      const result: MedicalGroundingSource = {
        id: `mapped-${query.slice(0, 20)}`,
        title: mappedImage.title,
        url: mappedImage.url,
        imageUrl: mappedImage.url,
        snippet: mappedImage.title,
        source: mappedImage.source as MedicalGroundingSource['source'],
        author: mappedImage.author,
        license: mappedImage.license,
      };
      setCachedImageSearch(query, mappedImage.url);
      return [result];
    }

    if (__DEV__) console.warn('[MedicalSearch] No images from any source');
    setCachedImageSearch(query, null); // Cache the negative result
    return [];
  }

  const results = dedupeGroundingSources(collected).slice(0, maxResults);
  // Cache the first image URL for this query
  if (results.length > 0 && results[0].imageUrl) {
    setCachedImageSearch(query, results[0].imageUrl);
  }
  return results;
}

/**
 * Uses the LLM to produce a precise medical image search query.
 * Falls back to the raw topic name if the LLM call fails.
 */
export async function generateImageSearchQuery(
  topicName: string,
  context?: string,
): Promise<string> {
  const msgs: Message[] = [
    {
      role: 'system',
      content:
        'You generate concise medical image search queries for medical reference images. Output ONLY the search query string, nothing else. Keep it to 2-6 words. Prefer the broader core anatomical structure, pathology, or imaging finding over narrow exam phrasing. Drop filler words like anatomy, clinical presentation, management, mechanism, question, symptom, diagnosis, treatment, or why/how unless they are essential to the image itself. Include modality only when clearly necessary, such as histology, x-ray, MRI, CT, microscopy, gross pathology, or fundus photo.',
    },
    {
      role: 'user',
      content: context
        ? `Generate a search query to find a relevant medical image for this quiz question about "${topicName}":\n${context}`
        : `Generate a search query to find a relevant medical image for: "${topicName}"`,
    },
  ];
  try {
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({
      profile,
      forceOrder: DEFAULT_PROVIDER_ORDER,
      disableLocal: true,
    });
    const { text } = await generateText({ model, messages: msgs as any });
    const candidate = text
      .replace(/^["']|["']$/g, '')
      .trim()
      .slice(0, 120);
    return compactImageSearchQuery(candidate) || compactImageSearchQuery(topicName) || topicName;
  } catch {
    return compactImageSearchQuery(topicName) || topicName;
  }
}

/**
 * Uses the LLM to generate 2-3 VISUAL search queries for a topic.
 * Translates abstract concepts (e.g., "homeostasis and cellular transport") into
 * concrete visualizable terms (e.g., "sodium potassium pump diagram",
 * "cell membrane facilitated diffusion", "endocytosis exocytosis").
 * These are then searched in parallel for images.
 */
export async function generateVisualSearchQueries(topicName: string): Promise<string[]> {
  const msgs: Message[] = [
    {
      role: 'system',
      content:
        'You are a medical image search query generator. Given a medical topic, return 3 precise, VISUAL search queries that would find diagrams, histology images, or clinical photographs relevant to the topic.\n\nRules:\n- Output a JSON array of exactly 3 strings, nothing else.\n- Each query should be 2-5 words.\n- For abstract topics, translate concepts to concrete visual examples (e.g., "homeostasis cellular transport" → ["sodium potassium pump diagram", "cell membrane transport channels", "endocytosis exocytosis diagram"]).\n- Include the word "diagram" or "histology" or "gross pathology" or "microscopy" when appropriate.\n- Do NOT include words like "anatomy of", "mechanism of", "management of" — use the core structure/pathology name.',
    },
    {
      role: 'user',
      content: `Generate 3 visual search queries for: "${topicName}"`,
    },
  ];
  try {
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({
      profile,
      forceOrder: DEFAULT_PROVIDER_ORDER,
      disableLocal: true,
    });
    const { text } = await generateText({ model, messages: msgs as any });
    // Try to parse as JSON array
    const cleaned = text.trim().replace(/^```json\n?|\n?```$/g, '');
    const parsed = JSON.parse(cleaned) as string[];
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((s) => typeof s === 'string' && s.length > 0)
    ) {
      return parsed.map((s) => compactImageSearchQuery(s.trim())).filter(Boolean);
    }
  } catch {
    // If LLM fails or returns bad JSON, fall through
  }
  // Fallback: try the single query generator
  const single = await generateImageSearchQuery(topicName);
  return single ? [single] : [topicName];
}

/**
 * Search for medical articles (text-based grounding).
 * Uses Wikipedia + DuckDuckGo + EuropePMC, with PubMed as fallback.
 */
export async function searchLatestMedicalSources(
  query: string,
  maxResults = 6,
): Promise<MedicalGroundingSource[]> {
  const collected: MedicalGroundingSource[] = [];
  const wikiLimit = Math.min(3, maxResults);
  const litLimit = maxResults;
  const minStrongResults = Math.min(3, maxResults);

  logGroundingEvent('search_start', {
    query: previewText(query, 140),
    maxResults,
  });

  // Brave Search first — highest quality web results when API key is configured
  try {
    const braveResults = await searchBraveText(query, Math.min(4, maxResults));
    if (braveResults.length > 0) {
      collected.push(...braveResults);
      logGroundingEvent('provider_result', {
        provider: 'Brave Search',
        count: braveResults.length,
        query: previewText(query, 100),
      });
    }
  } catch (err) {
    logGroundingEvent('provider_error', {
      provider: 'Brave Search',
      error: err instanceof Error ? err.message : String(err),
      query: previewText(query, 100),
    });
    if (__DEV__) console.warn('[GuruGrounded] Brave Search failed:', (err as Error).message);
  }

  try {
    const wiki = await searchWikipedia(query, wikiLimit);
    collected.push(...wiki);
    logGroundingEvent('provider_result', {
      provider: 'Wikipedia',
      count: wiki.length,
      query: previewText(query, 100),
    });
  } catch (err) {
    logGroundingEvent('provider_error', {
      provider: 'Wikipedia',
      error: err instanceof Error ? err.message : String(err),
      query: previewText(query, 100),
    });
    if (__DEV__) console.warn('[GuruGrounded] Wikipedia failed:', (err as Error).message);
  }

  // DuckDuckGo — free web search for broader context (no API key needed)
  try {
    const europe = await searchEuropePMC(query, litLimit);
    collected.push(...europe);
    logGroundingEvent('provider_result', {
      provider: 'EuropePMC',
      count: europe.length,
      query: previewText(query, 100),
    });
  } catch (err) {
    logGroundingEvent('provider_error', {
      provider: 'EuropePMC',
      error: err instanceof Error ? err.message : String(err),
      query: previewText(query, 100),
    });
    if (__DEV__) console.warn('[GuruGrounded] EuropePMC failed:', (err as Error).message);
  }

  if (collected.length < Math.min(4, maxResults)) {
    try {
      const pubmed = await searchPubMedFallback(query, litLimit);
      collected.push(...pubmed);
      logGroundingEvent('provider_result', {
        provider: 'PubMed',
        count: pubmed.length,
        query: previewText(query, 100),
        fallback: true,
      });
    } catch (err) {
      logGroundingEvent('provider_error', {
        provider: 'PubMed',
        error: err instanceof Error ? err.message : String(err),
        query: previewText(query, 100),
        fallback: true,
      });
      if (__DEV__) console.warn('[GuruGrounded] PubMed fallback failed:', (err as Error).message);
    }
  }

  if (collected.length < minStrongResults) {
    try {
      const ddg = await searchDuckDuckGo(query, 3);
      collected.push(...ddg);
      logGroundingEvent('provider_result', {
        provider: 'DuckDuckGo',
        count: ddg.length,
        query: previewText(query, 100),
        titles: ddg.map((src) => previewText(src.title, 60)),
        fallback: true,
      });
    } catch (err) {
      logGroundingEvent('provider_error', {
        provider: 'DuckDuckGo',
        error: err instanceof Error ? err.message : String(err),
        query: previewText(query, 100),
        fallback: true,
      });
      if (__DEV__) console.warn('[GuruGrounded] DuckDuckGo failed:', (err as Error).message);
    }
  }

  const deduped = rankGroundingSources(collected, query, maxResults);
  logGroundingEvent('search_complete', {
    query: previewText(query, 140),
    totalCollected: collected.length,
    totalReturned: deduped.length,
    providerBreakdown: deduped.reduce<Record<string, number>>((acc, src) => {
      acc[src.source] = (acc[src.source] ?? 0) + 1;
      return acc;
    }, {}),
  });

  return deduped;
}

export {
  searchDuckDuckGo,
  renderSourcesForPrompt,
  clipText,
  dedupeGroundingSources,
  buildMedicalSearchQuery,
};
