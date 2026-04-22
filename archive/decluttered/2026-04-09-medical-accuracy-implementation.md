# Medical Accuracy System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-layer medical accuracy safety net — enhanced prompts, background entity-based fact-checking, and user flagging UI — without increasing user wait time.

**Architecture:** Entity extraction from AI-generated content → cross-reference against DBMCI/BTR lecture transcripts + Wikipedia/PubMed via existing medicalSearch → auto-flag contradictions in background. User can also manually flag content and review flagged items.

**Tech Stack:** TypeScript, React Native, expo-sqlite, existing medicalSearch.ts, Zod schemas

---

## File Structure Overview

### New Files (6)

| File                                            | Responsibility                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/services/ai/medicalEntities.ts`            | Curated medical entity regex patterns (drugs, diseases, dosages, procedures)                        |
| `src/services/ai/medicalFactCheck.ts`           | Entity extraction, Jaccard similarity, contradiction detection, background fact-check orchestration |
| `src/db/queries/contentFlags.ts`                | CRUD for `user_content_flags` table + `content_fact_checks` table                                   |
| `src/components/ContentFlagButton.tsx`          | Reusable flag button + bottom sheet for flag reasons                                                |
| `src/screens/FlaggedContentScreen.tsx`          | Review flagged content list, regenerate/dismiss actions                                             |
| `src/services/ai/medicalFactCheck.unit.test.ts` | Unit tests for entity extraction, similarity, contradiction detection                               |

### Modified Files (7)

| File                              | Change                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `src/constants/prompts.ts`        | Add `MEDICAL_ACCURACY_GUARDRAIL` constant, append to all content prompt builders |
| `src/services/ai/content.ts`      | Import and trigger `scheduleBackgroundFactCheck()` after `setCachedContent()`    |
| `src/db/schema.ts`                | Add `CREATE_CONTENT_FACT_CHECKS` and `CREATE_USER_CONTENT_FLAGS` schemas         |
| `src/db/migrations.ts`            | Add migrations 161 (content_fact_checks) and 162 (user_content_flags)            |
| `src/navigation/types.ts`         | Add `FlaggedContent` to `MenuStackParamList`                                     |
| `src/navigation/TabNavigator.tsx` | Register `FlaggedContent` screen in MenuStack                                    |
| `src/screens/SettingsScreen.tsx`  | Add "Flagged Content Review" menu item                                           |
| `src/screens/ContentCard.tsx`     | Add `<ContentFlagButton>` to content card renderers                              |

---

## Task 1: Medical Entity Patterns

**Files:**

- Create: `src/services/ai/medicalEntities.ts`

- [ ] **Step 1: Create medical entity regex patterns**

```typescript
// src/services/ai/medicalEntities.ts

/**
 * Curated medical entity patterns for fact-checking AI-generated content.
 * Covers high-yield NEET-PG drugs, diseases, dosages, and procedures.
 */

// Drug names — high-yield NEET-PG drugs (grouped by class for readability)
const DRUG_CLASSES = {
  antibiotics: [
    'amoxicillin',
    'ampicillin',
    'penicillin',
    'cephalexin',
    'ceftriaxone',
    'cefotaxime',
    'azithromycin',
    'clarithromycin',
    'erythromycin',
    'doxycycline',
    'tetracycline',
    'ciprofloxacin',
    'levofloxacin',
    'ofloxacin',
    'metronidazole',
    'clindamycin',
    'vancomycin',
    'linezolid',
    'meropenem',
    'imipenem',
    'piperacillin',
    'gentamicin',
    'amikacin',
    'streptomycin',
    'rifampin',
    'rifampicin',
    'isoniazid',
    'pyrazinamide',
    'ethambutol',
    'fluconazole',
    'itraconazole',
    'voriconazole',
    'amphotericin',
    'aclovir',
    'valaciclovir',
    'oseltamivir',
    'artemisinin',
    'artemether',
    'lumefantrine',
    'chloroquine',
    'primaquine',
    'quinine',
    'metformin',
    'glimepiride',
    'glibenclamide',
  ],
  cardiovascular: [
    'amlodipine',
    'nifedipine',
    'felodipine',
    'lisinopril',
    'enalapril',
    'ramipril',
    'losartan',
    'valsartan',
    'telmisartan',
    'atenolol',
    'metoprolol',
    'propranolol',
    'carvedilol',
    'bisoprolol',
    'furosemide',
    'spironolactone',
    'hydrochlorothiazide',
    'digoxin',
    'amiodarone',
    'verapamil',
    'diltiazem',
    'clopidogrel',
    'aspirin',
    'warfarin',
    'heparin',
    'enoxaparin',
    'atorvastatin',
    'rosuvastatin',
    'simvastatin',
  ],
  cns: [
    'diazepam',
    'lorazepam',
    'alprazolam',
    'clonazepam',
    'phenytoin',
    'carbamazepine',
    'valproate',
    'levetiracetam',
    'lamotrigine',
    'fluoxetine',
    'sertraline',
    'escitalopram',
    'venlafaxine',
    'duloxetine',
    'haloperidol',
    'risperidone',
    'olanzapine',
    'quetiapine',
    'clozapine',
    'morphine',
    'fentanyl',
    'tramadol',
    'ketamine',
    'propofol',
  ],
  endocrine: [
    'levothyroxine',
    'methimazole',
    'propylthiouracil',
    'prednisolone',
    'dexamethasone',
    'hydrocortisone',
    'insulin',
    'glipizide',
    'pioglitazone',
    'sitagliptin',
  ],
  other: [
    'omeprazole',
    'pantoprazole',
    'ranitidine',
    'ondansetron',
    'metoclopramide',
    'ibuprofen',
    'diclofenac',
    'naproxen',
    'paracetamol',
    'acetaminophen',
    'allopurinol',
    'colchicine',
    'methotrexate',
    'azathioprine',
  ],
};

const ALL_DRUGS = [
  ...DRUG_CLASSES.antibiotics,
  ...DRUG_CLASSES.cardiovascular,
  ...DRUG_CLASSES.cns,
  ...DRUG_CLASSES.endocrine,
  ...DRUG_CLASSES.other,
];

// Build regex — word boundary matching, case-insensitive
export const DRUG_REGEX = new RegExp(`\\b(${ALL_DRUGS.join('|')})\\b`, 'gi');

// Disease/condition patterns — common NEET-PG topics
export const DISEASE_REGEX =
  /\b(malaria|tuberculosis|diabetes|hypertension|pneumonia|meningitis|hepatitis|typhoid|dengue|cholera|hiv|aids|cancer|carcinoma|leukemia|lymphoma|anemia|asthma|copd|heart failure|myocardial infarction|stroke|sepsis|appendicitis|cholecystitis|pancreatitis|cirrhosis|nephrotic|nephritic|thyroid|hyperthyroidism|hypothyroidism)\b/gi;

// Dosage patterns — numeric + unit
export const DOSAGE_REGEX =
  /\b(\d+\.?\d*)\s*(mg|ml|mcg|μg|g|units|IU|mmol|meq|micrograms|milligrams|grams)\b/gi;

// Procedures/tests
export const PROCEDURE_REGEX =
  /\b(ecg|ekg|ct scan|mri|ultrasound|x.?ray|biopsy|endoscopy|colonoscopy|laparoscopy|echocardiogram|spirometry|pap smear|blood culture|urine culture|widal|mantoux|gram.?stain|af.?b|elisa|pcr)\b/gi;

/**
 * Split text into sentences (naive but works for medical content).
 */
export function extractSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

/**
 * Extract claims: sentences that contain at least one drug AND one disease.
 */
export function extractClaims(
  text: string,
  drugs: string[],
  diseases: string[],
): Array<{ sentence: string; entities: string[] }> {
  const sentences = extractSentences(text);
  const claims: Array<{ sentence: string; entities: string[] }> = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const foundDrugs = drugs.filter((d) => lower.includes(d));
    const foundDiseases = diseases.filter((d) => lower.includes(d));

    if (foundDrugs.length > 0 && foundDiseases.length > 0) {
      claims.push({
        sentence,
        entities: [...foundDrugs, ...foundDiseases],
      });
    }
  }

  return claims;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ai/medicalEntities.ts
git commit -m "feat: add medical entity patterns for fact-checking"
```

---

## Task 2: Fact-Check Service + Unit Tests

**Files:**

- Create: `src/services/ai/medicalFactCheck.ts`
- Create: `src/services/ai/medicalFactCheck.unit.test.ts`

- [ ] **Step 1: Write failing unit tests**

```typescript
// src/services/ai/medicalFactCheck.unit.test.ts

import { calculateTextSimilarity, detectContradictions } from './medicalFactCheck';

describe('medicalFactCheck', () => {
  describe('calculateTextSimilarity', () => {
    it('returns 1.0 for identical texts', () => {
      expect(
        calculateTextSimilarity('artemisinin treats malaria', 'artemisinin treats malaria'),
      ).toBe(1.0);
    });

    it('returns high similarity for similar texts', () => {
      const score = calculateTextSimilarity(
        'Artemisinin-based combination therapy is first-line for falciparum malaria',
        'ACT is the drug of choice for falciparum malaria treatment',
      );
      expect(score).toBeGreaterThan(0.3);
    });

    it('returns low similarity for unrelated texts', () => {
      const score = calculateTextSimilarity(
        'Metformin is first-line for type 2 diabetes',
        'Amoxicillin treats urinary tract infections',
      );
      expect(score).toBeLessThan(0.3);
    });

    it('handles empty strings', () => {
      expect(calculateTextSimilarity('', '')).toBe(0);
      expect(calculateTextSimilarity('test', '')).toBe(0);
    });
  });

  describe('detectContradictions', () => {
    it('detects dosage contradictions', () => {
      const aiClaims = [
        { sentence: 'Standard dose is 20mg/kg artemether', entities: ['artemether'] },
      ];
      const trustedSources = [{ source: 'DBMCI', text: 'Artemether 80mg twice daily for 3 days' }];

      const contradictions = detectContradictions(aiClaims, trustedSources);
      expect(contradictions.length).toBeGreaterThan(0);
    });

    it('does not flag matching claims', () => {
      const aiClaims = [
        {
          sentence: 'ACT is first-line for falciparum malaria',
          entities: ['artemether', 'malaria'],
        },
      ];
      const trustedSources = [
        {
          source: 'WHO',
          text: 'Artemisinin-based combination therapy is recommended for falciparum malaria',
        },
      ];

      const contradictions = detectContradictions(aiClaims, trustedSources);
      expect(contradictions.length).toBe(0);
    });

    it('returns empty for no claims', () => {
      expect(detectContradictions([], [{ source: 'test', text: 'some text' }])).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="medicalFactCheck" --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement fact-check service**

```typescript
// src/services/ai/medicalFactCheck.ts

import type { AIContent, ContentType } from '../../types';
import { extractClaims, DRUG_REGEX, DISEASE_REGEX } from './medicalEntities';
import { getLectureHistory } from '../../db/queries/aiCache';
import { searchLatestMedicalSources, renderSourcesForPrompt } from './medicalSearch';
import { setContentFlagged, isContentFlagged } from '../../db/queries/aiCache';
import { logFactCheckResult } from '../../db/queries/contentFlags';

const SIMILARITY_THRESHOLD = 0.3;

export interface TrustedSource {
  source: string;
  text: string;
}

export interface Contradiction {
  claim: string;
  trustedSource: string;
  trustedText: string;
  similarity: number;
}

export interface ExtractedEntities {
  drugs: string[];
  diseases: string[];
  dosages: string[];
  procedures: string[];
  claims: Array<{ sentence: string; entities: string[] }>;
}

/**
 * Calculate Jaccard similarity between two texts (word overlap / union).
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  const t1 = text1.trim().toLowerCase();
  const t2 = text2.trim().toLowerCase();
  if (!t1 || !t2) return 0;

  const words1 = new Set(t1.split(/\s+/));
  const words2 = new Set(t2.split(/\s+/));
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Extract medical entities from AI-generated content.
 */
export function extractMedicalEntities(content: AIContent): ExtractedEntities {
  const text = JSON.stringify(content);

  const drugs = (text.match(DRUG_REGEX) ?? []).map((d) => d.toLowerCase());
  const diseases = (text.match(DISEASE_REGEX) ?? []).map((d) => d.toLowerCase());
  const uniqueDrugs = [...new Set(drugs)];
  const uniqueDiseases = [...new Set(diseases)];

  const claims = extractClaims(text, uniqueDrugs, uniqueDiseases);

  return {
    drugs: uniqueDrugs,
    diseases: uniqueDiseases,
    dosages: [],
    procedures: [],
    claims,
  };
}

/**
 * Detect contradictions between AI claims and trusted sources.
 */
export function detectContradictions(
  aiClaims: Array<{ sentence: string; entities: string[] }>,
  trustedSources: TrustedSource[],
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  for (const claim of aiClaims) {
    for (const source of trustedSources) {
      const similarity = calculateTextSimilarity(claim.sentence, source.text);

      if (similarity > SIMILARITY_THRESHOLD && similarity < 0.85) {
        contradictions.push({
          claim: claim.sentence,
          trustedSource: source.source,
          trustedText: source.text,
          similarity,
        });
      }
    }
  }

  return contradictions;
}

/**
 * Get trusted sources for a given topic.
 */
async function getTrustedSources(
  entities: ExtractedEntities,
  subjectName: string,
): Promise<TrustedSource[]> {
  const sources: TrustedSource[] = [];

  try {
    const history = await getLectureHistory(50);
    const relevantTranscripts = history
      .filter((h) => {
        const text = `${h.note} ${h.summary ?? ''} ${h.transcript ?? ''}`.toLowerCase();
        return (
          entities.drugs.some((d) => text.includes(d)) ||
          entities.diseases.some((d) => text.includes(d))
        );
      })
      .slice(0, 3)
      .map((h) => ({
        source: h.appName ?? 'Lecture',
        text: `${h.note} ${h.summary ?? ''}`,
      }));

    sources.push(...relevantTranscripts);
  } catch {
    // Non-critical
  }

  if (entities.drugs.length > 0 || entities.diseases.length > 0) {
    try {
      const searchQuery = [...entities.drugs.slice(0, 3), ...entities.diseases.slice(0, 3)].join(
        ' ',
      );
      const searchResults = await searchLatestMedicalSources(`${searchQuery} ${subjectName}`, 3);
      const wikiSources = searchResults.map((s) => ({
        source: s.source,
        text: `${s.title} ${s.snippet}`,
      }));
      sources.push(...wikiSources);
    } catch {
      // Non-critical
    }
  }

  return sources;
}

/**
 * Run medical fact-check for generated content.
 */
export async function runMedicalFactCheck(
  topicId: number,
  contentType: ContentType,
  content: AIContent,
  subjectName: string = '',
): Promise<void> {
  try {
    const entities = extractMedicalEntities(content);

    if (entities.drugs.length === 0 && entities.diseases.length === 0) {
      await logFactCheckResult(topicId, contentType, 'inconclusive', []);
      return;
    }

    const trustedSources = await getTrustedSources(entities, subjectName);

    if (trustedSources.length === 0) {
      await logFactCheckResult(topicId, contentType, 'inconclusive', []);
      return;
    }

    const contradictions = detectContradictions(entities.claims, trustedSources);

    const status = contradictions.length > 0 ? 'failed' : 'passed';
    await logFactCheckResult(topicId, contentType, status, contradictions);

    if (contradictions.length > 0) {
      const alreadyFlagged = await isContentFlagged(topicId, contentType);
      if (!alreadyFlagged) {
        await setContentFlagged(topicId, contentType, true);
      }
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[FactCheck] Error during fact-check:', err);
    }
    await logFactCheckResult(topicId, contentType, 'inconclusive', []);
  }
}

/**
 * Schedule background fact-check (non-blocking).
 */
export function scheduleBackgroundFactCheck(
  topicId: number,
  contentType: ContentType,
  content: AIContent,
  subjectName: string = '',
): void {
  setTimeout(async () => {
    try {
      await runMedicalFactCheck(topicId, contentType, content, subjectName);
    } catch (err) {
      if (__DEV__) {
        console.warn('[FactCheck] Background check failed:', err);
      }
    }
  }, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="medicalFactCheck" --no-coverage
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/medicalFactCheck.ts src/services/ai/medicalFactCheck.unit.test.ts
git commit -m "feat: add medical fact-check service with entity extraction and contradiction detection"
```

---

## Task 3: Content Flags Database

**Files:**

- Create: `src/db/queries/contentFlags.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrations.ts`

- [ ] **Step 1: Add schemas**

Add to `src/db/schema.ts` before `ALL_SCHEMAS`:

```typescript
export const CREATE_CONTENT_FACT_CHECKS = `
CREATE TABLE IF NOT EXISTS content_fact_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  check_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(check_status IN ('pending', 'passed', 'failed', 'inconclusive')),
  contradictions_json TEXT,
  checked_at INTEGER NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
)`;

export const CREATE_USER_CONTENT_FLAGS = `
CREATE TABLE IF NOT EXISTS user_content_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  user_note TEXT,
  flag_reason TEXT NOT NULL
    CHECK(flag_reason IN ('incorrect_fact', 'outdated_info', 'wrong_dosage', 'missing_concept', 'other')),
  flagged_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
)`;
```

Add both to `ALL_SCHEMAS` array.

- [ ] **Step 2: Add migrations**

Add to `src/db/migrations.ts` after version 160:

```typescript
  {
    version: 161,
    sql: `CREATE TABLE IF NOT EXISTS content_fact_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  check_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(check_status IN ('pending', 'passed', 'failed', 'inconclusive')),
  contradictions_json TEXT,
  checked_at INTEGER NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
)`,
    description: 'Add content_fact_checks table for automated fact-check results',
  },
  {
    version: 162,
    sql: `CREATE TABLE IF NOT EXISTS user_content_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  user_note TEXT,
  flag_reason TEXT NOT NULL
    CHECK(flag_reason IN ('incorrect_fact', 'outdated_info', 'wrong_dosage', 'missing_concept', 'other')),
  flagged_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
)`,
    description: 'Add user_content_flags table for manual content flagging',
  },
```

Update `LATEST_VERSION = 162`.

- [ ] **Step 3: Create contentFlags.ts**

```typescript
// src/db/queries/contentFlags.ts

import { getDb, nowTs, SQL_AI_CACHE } from '../database';
import type { ContentType } from '../../types';

export type FlagReason =
  | 'incorrect_fact'
  | 'outdated_info'
  | 'wrong_dosage'
  | 'missing_concept'
  | 'other';

export interface FlaggedContentItem {
  topicId: number;
  topicName: string;
  subjectName: string;
  contentType: ContentType;
  flagReason: FlagReason | 'auto_flagged';
  userNote?: string;
  flaggedAt: number;
  resolved: boolean;
}

export async function flagContentWithReason(
  topicId: number,
  contentType: ContentType,
  reason: FlagReason,
  note?: string,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO user_content_flags (topic_id, content_type, flag_reason, user_note, flagged_at)
     VALUES (?, ?, ?, ?, ?)`,
    [topicId, contentType, reason, note ?? null, nowTs()],
  );

  await db.runAsync(
    `UPDATE ${SQL_AI_CACHE} SET is_flagged = 1 WHERE topic_id = ? AND content_type = ?`,
    [topicId, contentType],
  );
}

export async function logFactCheckResult(
  topicId: number,
  contentType: ContentType,
  status: 'passed' | 'failed' | 'inconclusive',
  contradictions: Array<{
    claim: string;
    trustedSource: string;
    trustedText: string;
    similarity: number;
  }>,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO content_fact_checks (topic_id, content_type, check_status, contradictions_json, checked_at)
     VALUES (?, ?, ?, ?, ?)`,
    [topicId, contentType, status, JSON.stringify(contradictions), nowTs()],
  );
}

export async function getFlaggedContent(): Promise<FlaggedContentItem[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    topic_id: number;
    topic_name: string;
    subject_name: string;
    content_type: string;
    flag_reason: string;
    user_note: string | null;
    flagged_at: number;
    resolved: number;
  }>(
    `SELECT DISTINCT
       c.topic_id,
       t.name AS topic_name,
       s.name AS subject_name,
       c.content_type,
       COALESCE(u.flag_reason, 'auto_flagged') AS flag_reason,
       u.user_note,
       MAX(u.flagged_at) AS flagged_at,
       COALESCE(MAX(u.resolved), 0) AS resolved
     FROM ${SQL_AI_CACHE} c
     JOIN topics t ON c.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     LEFT JOIN user_content_flags u ON c.topic_id = u.topic_id AND c.content_type = u.content_type
     WHERE c.is_flagged = 1
     GROUP BY c.topic_id, c.content_type
     ORDER BY flagged_at DESC`,
  );

  return rows.map((r) => ({
    topicId: r.topic_id,
    topicName: r.topic_name,
    subjectName: r.subject_name,
    contentType: r.content_type as ContentType,
    flagReason: (r.flag_reason as FlagReason) || 'auto_flagged',
    userNote: r.user_note ?? undefined,
    flaggedAt: r.flagged_at,
    resolved: r.resolved === 1,
  }));
}

export async function resolveContentFlags(
  topicId: number,
  contentType: ContentType,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE user_content_flags SET resolved = 1, resolved_at = ? WHERE topic_id = ? AND content_type = ?`,
    [nowTs(), topicId, contentType],
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations.ts src/db/queries/contentFlags.ts
git commit -m "feat: add content flags database schema, migrations, and queries"
```

---

## Task 4: Enhanced Medical Accuracy Prompts

**Files:**

- Modify: `src/constants/prompts.ts`

- [ ] **Step 1: Add MEDICAL_ACCURACY_GUARDRAIL and append to all content prompts**

Add after `SYSTEM_PROMPT`:

```typescript
export const MEDICAL_ACCURACY_GUARDRAIL = `

MEDICAL ACCURACY REQUIREMENTS (CRITICAL):
1. Only state facts verifiable in standard medical textbooks used in Indian medical education:
   - Medicine: Harrison's Principles of Internal Medicine
   - Surgery: Bailey & Love's Short Practice of Surgery
   - OBG: Shaw's Textbook of Obstetrics & Gynaecology
   - Pharma: KD Tripathi's Essentials of Medical Pharmacology
   - PSM: Park's Textbook of Preventive & Social Medicine
   - Anatomy: BD Chaurasia's Human Anatomy / Gray's Anatomy
   - Pathology: Robbins & Cotran Pathologic Basis of Disease
2. If uncertain about any claim, explicitly state "I'm not certain about this" — never guess or fabricate.
3. For drug dosages: include standard adult dose + add "⚠️ Verify dose before prescribing"
4. Flag evolving guidelines: "Note: [Guideline] updated [Year] — older sources may differ"
5. Use Indian medical curriculum terminology (NEET-PG/INICET standard, ICMR/National Health Programme guidelines)
6. Cite source when applicable: WHO, NICE, ICMR, AIIMS protocol, National Health Programme
7. Distinguish between:
   - Established fact (e.g., "Plasmodium falciparum causes severe malaria")
   - Clinical reasoning (e.g., "Given the travel history, consider dengue")
   - Exam trap (e.g., "Exam often confuses X with Y — here's the difference")
`;
```

Append `${MEDICAL_ACCURACY_GUARDRAIL}` to the end of EVERY prompt builder: `buildKeyPointsPrompt`, `buildMustKnowPrompt`, `buildQuizPrompt`, `buildStoryPrompt`, `buildMnemonicPrompt`, `buildTeachBackPrompt`, `buildErrorHuntPrompt`, `buildDetectivePrompt`, `buildSocraticPrompt`, `buildFlashcardsPrompt`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/constants/prompts.ts
git commit -m "feat: add medical accuracy guardrails to all content generation prompts"
```

---

## Task 5: Integrate Background Fact-Check

**Files:**

- Modify: `src/services/ai/content.ts`

- [ ] **Step 1: Add import and trigger**

At top of `src/services/ai/content.ts`:

```typescript
import { scheduleBackgroundFactCheck } from './medicalFactCheck';
```

In `fetchContent()`, after `await setCachedContent(...)`:

```typescript
// Trigger background fact-check (non-blocking — user doesn't wait)
scheduleBackgroundFactCheck(topic.id, contentType, contentWithMeta, topic.subjectName);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/services/ai/content.ts
git commit -m "feat: trigger background fact-check after content generation"
```

---

## Task 6: Content Flag Button Component

**Files:**

- Create: `src/components/ContentFlagButton.tsx`

- [ ] **Step 1: Create component**

```typescript
// src/components/ContentFlagButton.tsx

import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { flagContentWithReason, type FlagReason } from '../db/queries/contentFlags';
import type { ContentType } from '../types';
import { n } from '../theme/linearTheme';

const FLAG_REASONS: Array<{ label: string; value: FlagReason }> = [
  { label: 'Incorrect medical fact', value: 'incorrect_fact' },
  { label: 'Outdated information', value: 'outdated_info' },
  { label: 'Wrong drug dosage', value: 'wrong_dosage' },
  { label: 'Missing key concept', value: 'missing_concept' },
  { label: 'Other', value: 'other' },
];

interface ContentFlagButtonProps {
  topicId: number;
  contentType: ContentType;
}

export function ContentFlagButton({ topicId, contentType }: ContentFlagButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState('');
  const [flagging, setFlagging] = useState(false);

  const handleFlag = async () => {
    if (!selectedReason) {
      Alert.alert('Select a reason', 'Please select why you are flagging this content.');
      return;
    }

    setFlagging(true);
    try {
      await flagContentWithReason(topicId, contentType, selectedReason, note || undefined);
      setShowModal(false);
      setSelectedReason(null);
      setNote('');
      Alert.alert('Flagged', 'Thank you for the feedback. This content will be reviewed.');
    } catch (err) {
      Alert.alert('Error', 'Failed to flag content. Please try again.');
    } finally {
      setFlagging(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setShowModal(true)}
        style={styles.flagButton}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        accessibilityLabel="Flag content"
      >
        <Ionicons name="flag-outline" size={16} color={n.colors.statusNegative} />
      </Pressable>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Flag Content</Text>
            <Text style={styles.modalSubtitle}>What's wrong with this content?</Text>

            {FLAG_REASONS.map((reason) => (
              <Pressable
                key={reason.value}
                style={[
                  styles.reasonOption,
                  selectedReason === reason.value && styles.reasonOptionSelected,
                ]}
                onPress={() => setSelectedReason(reason.value)}
              >
                <Ionicons
                  name={selectedReason === reason.value ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedReason === reason.value ? n.colors.accent : n.colors.textMuted}
                />
                <Text style={styles.reasonLabel}>{reason.label}</Text>
              </Pressable>
            ))}

            {selectedReason === 'other' && (
              <TextInput
                style={styles.noteInput}
                placeholder="Describe the issue..."
                placeholderTextColor={n.colors.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
              />
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitButton, flagging && styles.submitButtonDisabled]}
                onPress={handleFlag}
                disabled={flagging || !selectedReason}
              >
                <Text style={styles.submitText}>{flagging ? 'Flagging...' : 'Submit Flag'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flagButton: { padding: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: n.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: n.colors.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: n.colors.textMuted, marginBottom: 16 },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  reasonOptionSelected: { backgroundColor: `${n.colors.accent}15` },
  reasonLabel: { fontSize: 15, color: n.colors.text, marginLeft: 12 },
  noteInput: {
    backgroundColor: n.colors.background,
    borderRadius: 8,
    padding: 12,
    color: n.colors.text,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 16,
    minHeight: 60,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { fontSize: 15, color: n.colors.textMuted },
  submitButton: {
    backgroundColor: n.colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ContentFlagButton.tsx
git commit -m "feat: add ContentFlagButton component with reason selection modal"
```

---

## Task 7: Add Flag Button to ContentCard

**Files:**

- Modify: `src/screens/ContentCard.tsx`

- [ ] **Step 1: Add import and flag button**

Add import:

```typescript
import { ContentFlagButton } from '../components/ContentFlagButton';
```

Find the ContentCard component props interface. Add optional props:

```typescript
topicId?: number;
contentType?: ContentType;
```

In the render section, add flag button to the card header:

```tsx
<View style={styles.cardHeader}>
  <Text style={styles.cardTitle}>{content.topicName}</Text>
  {topicId && contentType && <ContentFlagButton topicId={topicId} contentType={contentType} />}
</View>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/ContentCard.tsx
git commit -m "feat: add flag button to all content cards"
```

---

## Task 8: Flagged Content Screen

**Files:**

- Create: `src/screens/FlaggedContentScreen.tsx`

- [ ] **Step 1: Create screen**

```typescript
// src/screens/FlaggedContentScreen.tsx

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList } from '../navigation/types';
import { getFlaggedContent, resolveContentFlags } from '../db/queries/contentFlags';
import type { FlaggedContentItem } from '../db/queries/contentFlags';
import { clearSpecificContentCache } from '../db/queries/aiCache';
import { fetchContent } from '../services/ai/content';
import { getDb } from '../db/database';
import { n } from '../theme/linearTheme';
import { Ionicons } from '@expo/vector-icons';
import type { ContentType } from '../types';

const FLAG_REASON_LABELS: Record<string, string> = {
  incorrect_fact: 'Incorrect medical fact',
  outdated_info: 'Outdated information',
  wrong_dosage: 'Wrong drug dosage',
  missing_concept: 'Missing key concept',
  auto_flagged: 'Auto-flagged (fact-check)',
  other: 'Other',
};

export default function FlaggedContentScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MenuStackParamList, 'FlaggedContent'>>();
  const [flaggedItems, setFlaggedItems] = useState<FlaggedContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  const loadFlagged = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getFlaggedContent();
      setFlaggedItems(items);
    } catch (err) {
      console.error('[FlaggedContent] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFlagged();
    }, [loadFlagged]),
  );

  const handleRegenerate = async (item: FlaggedContentItem) => {
    setProcessing(item.topicId);
    try {
      await clearSpecificContentCache(item.topicId, item.contentType);

      const db = getDb();
      const topic = await db.getFirstAsync<any>(
        `SELECT t.*, s.name as subjectName FROM topics t JOIN subjects s ON t.subject_id = s.id WHERE t.id = ?`,
        [item.topicId],
      );

      if (topic) {
        await fetchContent(topic, item.contentType);
      }

      await resolveContentFlags(item.topicId, item.contentType);
      await loadFlagged();
    } catch (err) {
      Alert.alert('Error', 'Failed to regenerate content.');
    } finally {
      setProcessing(null);
    }
  };

  const handleDismiss = async (item: FlaggedContentItem) => {
    try {
      await resolveContentFlags(item.topicId, item.contentType);
      await loadFlagged();
    } catch (err) {
      Alert.alert('Error', 'Failed to dismiss flag.');
    }
  };

  const renderItem = ({ item }: { item: FlaggedContentItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{item.topicName}</Text>
          <Text style={styles.itemSubject}>{item.subjectName}</Text>
        </View>
        <View style={styles.itemType}>
          <Text style={styles.itemTypeText}>{item.contentType}</Text>
        </View>
      </View>

      <View style={styles.flagReason}>
        <Ionicons name="warning" size={14} color={n.colors.statusNegative} />
        <Text style={styles.flagReasonText}>
          {FLAG_REASON_LABELS[item.flagReason] ?? item.flagReason}
        </Text>
      </View>

      {item.userNote && <Text style={styles.userNote}>"{item.userNote}"</Text>}

      <View style={styles.itemActions}>
        <Pressable
          style={styles.dismissButton}
          onPress={() => handleDismiss(item)}
          disabled={processing === item.topicId}
        >
          <Text style={styles.dismissButtonText}>Dismiss</Text>
        </Pressable>
        <Pressable
          style={[
            styles.regenerateButton,
            processing === item.topicId && styles.regenerateButtonDisabled,
          ]}
          onPress={() => handleRegenerate(item)}
          disabled={processing === item.topicId}
        >
          {processing === item.topicId ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.regenerateButtonText}>Regenerate</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={n.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Flagged Content</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={n.colors.accent} />
        </View>
      ) : flaggedItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle" size={64} color={n.colors.statusPositive} />
          <Text style={styles.emptyTitle}>All Clear!</Text>
          <Text style={styles.emptySubtitle}>No flagged content to review.</Text>
        </View>
      ) : (
        <FlatList
          data={flaggedItems}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.topicId}-${item.contentType}`}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: n.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: n.colors.text,
  },
  listContent: { padding: 16 },
  itemCard: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: n.colors.statusNegative,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: n.colors.text },
  itemSubject: { fontSize: 13, color: n.colors.textMuted, marginTop: 2 },
  itemType: {
    backgroundColor: `${n.colors.accent}15`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  itemTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: n.colors.accent,
    textTransform: 'capitalize',
  },
  flagReason: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  flagReasonText: { fontSize: 13, color: n.colors.statusNegative, fontWeight: '500' },
  userNote: { fontSize: 13, color: n.colors.textMuted, fontStyle: 'italic', marginBottom: 12 },
  itemActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  dismissButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  dismissButtonText: { fontSize: 14, fontWeight: '600', color: n.colors.textMuted },
  regenerateButton: {
    backgroundColor: n.colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  regenerateButtonDisabled: { opacity: 0.5 },
  regenerateButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: n.colors.text, marginTop: 16 },
  emptySubtitle: { fontSize: 15, color: n.colors.textMuted, marginTop: 8, textAlign: 'center' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/FlaggedContentScreen.tsx
git commit -m "feat: add Flagged Content review screen with regenerate/dismiss actions"
```

---

## Task 9: Navigation Integration

**Files:**

- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/TabNavigator.tsx`
- Modify: `src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Add route to types**

In `src/navigation/types.ts`, add to `MenuStackParamList`:

```typescript
FlaggedContent: undefined;
```

- [ ] **Step 2: Register screen in TabNavigator**

In `src/navigation/TabNavigator.tsx`:

Add import:

```typescript
import FlaggedContentScreen from '../screens/FlaggedContentScreen';
```

Add to MenuStack:

```tsx
<Stack.Screen name="FlaggedContent" component={FlaggedContentScreen} />
```

- [ ] **Step 3: Add menu item in Settings**

In `src/screens/SettingsScreen.tsx`, add a pressable row in an appropriate section:

```tsx
<TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('FlaggedContent')}>
  <View style={styles.settingRowLeft}>
    <Ionicons name="flag" size={18} color={n.colors.statusNegative} />
    <Text style={styles.settingLabel}>Flagged Content Review</Text>
  </View>
  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
</TouchableOpacity>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/navigation/types.ts src/navigation/TabNavigator.tsx src/screens/SettingsScreen.tsx
git commit -m "feat: add Flagged Content screen to navigation and settings menu"
```

---

## Task 10: Verification

- [ ] **Step 1: Full type check**

```bash
npm run typecheck
```

- [ ] **Step 2: Unit tests**

```bash
npm test -- --testPathPattern="medicalFactCheck" --no-coverage
```

- [ ] **Step 3: Lint**

```bash
npm run lint
```

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address typecheck/lint issues in medical accuracy system"
```

---

## Self-Review

### Spec coverage

- Layer 1: Enhanced prompts → Task 4 ✅
- Layer 2: Entity-based fact-checking → Task 1, 2, 3, 5 ✅
- Layer 3: User flagging UI → Task 6, 7, 8, 9 ✅
- Database tables → Task 3 ✅
- Migrations → Task 3 ✅
- Background execution → Task 2, 5 ✅
- Flagged content screen → Task 8 ✅
- Navigation → Task 9 ✅
- Unit tests → Task 2 ✅
- MedTE roadmap → Not in scope (documented in spec) ✅

### Placeholder scan

- No TBD/TODO ✅
- All steps have complete code ✅
- No "similar to" references ✅

### Type consistency

- `ContentType` consistent ✅
- `FlagReason` type defined and used consistently ✅
- Function signatures match ✅
