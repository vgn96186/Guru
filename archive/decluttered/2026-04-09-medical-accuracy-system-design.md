# Medical Accuracy System — Design Specification

**Date:** 2026-04-09  
**Author:** Qwen (with Vishnu)  
**Status:** Draft — awaiting review

---

## Problem Statement

Guru uses coding-specialized LLMs (Groq, OpenRouter, local MedGemma) to generate medical study content (quizzes, keypoints, flashcards, etc.). These models may produce medically inaccurate or outdated information because:

1. They are not domain-specifically trained on medical curricula (NEET-PG/INICET)
2. They may hallucinate incorrect drug dosages, mechanisms, or treatment protocols
3. Medical guidelines evolve — AI may use outdated standards

**Goal:** Improve accuracy of AI-generated medical content without increasing user wait time.

**Strategy:** 3-layer safety net:

- **Layer 1 (Baseline):** Enhanced medical accuracy prompts
- **Layer 2 (Proactive):** Entity-based background fact-checking against trusted sources (DBMCI/BTR transcripts, Wikipedia/PubMed)
- **Layer 3 (Reactive):** User flagging UI + "Flagged Content" review screen

**Future roadmap:** MedTE (Medical Text Embedding) integration for semantic similarity validation (cloud API, not on-device due to 438MB model size).

---

## Architecture Overview

```
User requests content (e.g., "Generate keypoints for Malaria")
         ↓
AI generates content (instant, shown to user immediately)
         ↓
Content cached in ai_cache table
         ↓
BACKGROUND PROCESS (non-blocking, user doesn't wait):
  1. Extract medical entities (drugs, diseases, dosages, procedures)
  2. Cross-reference against trusted sources:
     - DBMCI One / BTR lecture transcripts (existing DB)
     - Wikipedia/PubMed via medicalSearch.ts
  3. Compare AI claims vs trusted sources
  4. If contradiction found → auto-flag content (is_flagged = 1)
  5. Log fact-check result in content_fact_checks table
         ↓
User sees content immediately, gets notification later if flagged
         ↓
User can also manually flag content anytime via flag button
         ↓
Flagged Content Review Screen → Regenerate or Dismiss
```

---

## Layer 1: Enhanced Medical Accuracy Prompts

### Purpose

Add medical accuracy guardrails to all AI content generation prompts. This is the first line of defense — better prompts produce better content.

### Location

`src/constants/prompts.ts`

### Changes

Add new constant `MEDICAL_ACCURACY_GUARDRAIL` — appended to all content generation prompts:

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

### Integration

Append `MEDICAL_ACCURACY_GUARDRAIL` to the end of each content prompt builder:

```typescript
// src/constants/prompts.ts
export function buildKeyPointsPrompt(topicName: string, subjectName: string): string {
  return `${existing_prompt}
${MEDICAL_ACCURACY_GUARDRAIL}`;
}
```

Do the same for all prompt builders: `buildQuizPrompt`, `buildMustKnowPrompt`, `buildFlashcardsPrompt`, etc.

**Note:** The `SYSTEM_PROMPT` already includes INICET/NEET-PG difficulty instructions. The `MEDICAL_ACCURACY_GUARDRAIL` supplements it with factual accuracy requirements.

---

## Layer 2: Entity-Based Background Fact-Checking

### Purpose

After AI generates content, automatically extract medical entities and cross-reference against trusted source material. Flag content if contradictions are found.

### Location

New file: `src/services/ai/medicalFactCheck.ts`

### Entity Extraction

Lightweight regex-based extraction (no ML model needed). Extract:

1. **Drug names** — curated list of ~500 high-yield NEET-PG drugs
2. **Diseases/conditions** — common medical conditions
3. **Dosages** — numeric + unit patterns (e.g., "500mg", "2.5ml", "10000 IU")
4. **Procedures/tests** — ECG, CT scan, biopsy, etc.
5. **Key claims** — extract sentences containing medical assertions

```typescript
interface ExtractedEntities {
  drugs: string[];
  diseases: string[];
  dosages: string[];
  procedures: string[];
  claims: Array<{
    sentence: string;
    entities: string[]; // drugs/diseases mentioned in this claim
  }>;
}

function extractMedicalEntities(content: AIContent): ExtractedEntities {
  const text = JSON.stringify(content);

  // Drug names (curated high-yield list)
  const drugs = text.match(DRUG_REGEX)?.map((d) => d.toLowerCase()) ?? [];

  // Diseases/conditions
  const diseases = text.match(DISEASE_REGEX)?.map((d) => d.toLowerCase()) ?? [];

  // Dosages
  const dosages = text.match(DOSAGE_REGEX)?.map((d) => d.trim()) ?? [];

  // Procedures/tests
  const procedures = text.match(PROCEDURE_REGEX)?.map((p) => p.toLowerCase()) ?? [];

  // Claims: sentences containing drug + disease co-occurrence
  const claims = extractClaims(text, drugs, diseases);

  return {
    drugs: [...new Set(drugs)],
    diseases: [...new Set(diseases)],
    dosages: [...new Set(dosages)],
    procedures: [...new Set(procedures)],
    claims,
  };
}
```

**Entity lists location:** `src/services/ai/medicalEntities.ts` — curated lists of regex patterns and keywords.

### Trusted Sources

1. **DBMCI One / BTR lecture transcripts** (primary — "gold standard" for NEET-PG)

   - Source: `lecture_notes` table with `appName = 'DBMCI One'` or `appName = 'BTR'`
   - Query: `getLectureTranscriptsBySubject()` + filter by topic similarity

2. **Wikipedia/PubMed via medicalSearch.ts** (secondary — for contradictions)
   - Source: Existing `searchLatestMedicalSources()` function
   - Query: Use extracted entity names as search terms

### Contradiction Detection

Simple string-based similarity check:

```typescript
function detectContradictions(
  aiClaims: ExtractedClaims,
  trustedSources: TrustedSource[],
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  for (const claim of aiClaims) {
    for (const source of trustedSources) {
      const similarity = calculateTextSimilarity(claim.sentence, source.text);

      // If claim mentions same entities but different conclusion → contradiction
      if (similarity > 0.3 && hasConflictingConclusion(claim.sentence, source.text)) {
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
```

**Similarity algorithm:** Simple Jaccard similarity on word overlap (no embedding model needed).

```typescript
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}
```

### New Database Tables

```sql
-- Fact-check results for automated background checks
CREATE TABLE IF NOT EXISTS content_fact_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  check_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(check_status IN ('pending', 'passed', 'failed', 'inconclusive')),
  contradictions_json TEXT,
  checked_at INTEGER NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

-- User-submitted content flags
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
);
```

### Background Execution

Trigger fact-check immediately after content caching — but execute asynchronously so user doesn't wait:

```typescript
// src/services/ai/content.ts — modify fetchContent()
export async function fetchContent(topic, contentType, forceProvider?) {
  // ... existing code (get from cache or generate) ...

  const contentWithMeta = await generateContent(...);
  await setCachedContent(topic.id, contentType, contentWithMeta, modelUsed);

  // AFTER caching — trigger background fact-check (non-blocking)
  scheduleBackgroundFactCheck(topic.id, contentType, contentWithMeta);

  return contentWithMeta;
}

function scheduleBackgroundFactCheck(topicId: number, contentType: ContentType, content: AIContent) {
  // Use setTimeout to defer execution to next tick (non-blocking)
  setTimeout(async () => {
    try {
      await runMedicalFactCheck(topicId, contentType, content);
    } catch (err) {
      if (__DEV__) {
        console.warn('[FactCheck] Background check failed:', err);
      }
      // Don't crash — content is already cached and visible to user
    }
  }, 0);
}
```

### Fact-Check Result Handling

```typescript
async function runMedicalFactCheck(topicId: number, contentType: ContentType, content: AIContent) {
  // 1. Extract entities
  const entities = extractMedicalEntities(content);

  // 2. Get trusted sources
  const dbmciTranscripts = await getLectureTranscriptsByTopic(topicId);
  const wikiSources = await searchLatestMedicalSources(entities.drugs.slice(0, 3).join(' '), 3);

  // 3. Detect contradictions
  const contradictions = detectContradictions(entities.claims, [
    ...dbmciTranscripts,
    ...wikiSources,
  ]);

  // 4. Log result
  const status = contradictions.length > 0 ? 'failed' : 'passed';
  await logFactCheckResult(topicId, contentType, status, contradictions);

  // 5. Auto-flag if contradictions found
  if (contradictions.length > 0) {
    await setContentFlagged(topicId, contentType, true);
    // Optional: Show subtle notification to user
    // showNotification('⚠️ This content needs review — tap to see details');
  }
}
```

---

## Layer 3: User Feedback & Flagging UI

### Purpose

Users can manually flag inaccurate content. Dedicated review screen lets them regenerate or dismiss flags.

### 3A. Flag Button on Content Cards

Add a small flag button to every content card component:

**Components to modify:**

- `KeyPointsCard.tsx`
- `QuizCard.tsx`
- `FlashcardCard.tsx`
- `StoryCard.tsx`
- `MnemonicCard.tsx`
- All other content card types

**Implementation:**

```tsx
// src/components/ContentFlagButton.tsx (new reusable component)
interface ContentFlagButtonProps {
  topicId: number;
  contentType: ContentType;
}

export function ContentFlagButton({ topicId, contentType }: ContentFlagButtonProps) {
  const [showBottomSheet, setShowBottomSheet] = useState(false);

  const handleFlag = async (reason: FlagReason, note?: string) => {
    await flagContentWithReason(topicId, contentType, reason, note);
    setShowBottomSheet(false);
    showToast('Content flagged. Thank you for the feedback!');
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowBottomSheet(true)}
        style={styles.flagButton}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Icon name="flag-outline" size={16} color="#FF6B6B" />
      </TouchableOpacity>

      {showBottomSheet && (
        <FlagReasonSheet onFlag={handleFlag} onClose={() => setShowBottomSheet(false)} />
      )}
    </>
  );
}
```

**Flag Reasons:**

- "Incorrect medical fact"
- "Outdated information"
- "Wrong drug dosage"
- "Missing key concept"
- "Other (type note)"

### 3B. Flag Content with Reason

New database query function:

```typescript
// src/db/queries/contentFlags.ts
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

  // Also set the is_flagged flag on ai_cache for easy querying
  await setContentFlagged(topicId, contentType, true);
}
```

### 3C. Flagged Content Review Screen

**File:** `src/screens/FlaggedContentScreen.tsx`

**Navigation route:** Add to Settings tab as "Flagged Content Review"

**Features:**

- List of all flagged content (both auto-flagged and user-flagged)
- For each item:
  - Topic name + subject
  - Content type (quiz, keypoints, etc.)
  - Flag reason (auto-detected contradiction or user-submitted)
  - "View Content" — shows the flagged content
  - "Regenerate" — one-click fresh generation with stronger medical prompt
  - "Dismiss Flag" — removes flag if content is actually fine

**Regenerate flow:**

```typescript
async function handleRegenerate(topicId: number, contentType: ContentType) {
  // 1. Delete old flagged content
  await clearSpecificContentCache(topicId, contentType);

  // 2. Generate fresh content (with MEDICAL_ACCURACY_GUARDRAIL already included in prompts)
  await fetchContent(topic, contentType);

  // 3. Remove flag
  await setContentFlagged(topicId, contentType, false);

  // 4. Mark user flags as resolved
  await resolveContentFlags(topicId, contentType);
}
```

**Dismiss flow:**

```typescript
async function handleDismiss(topicId: number, contentType: ContentType) {
  // 1. Remove flag
  await setContentFlagged(topicId, contentType, false);

  // 2. Mark user flags as resolved
  await resolveContentFlags(topicId, contentType);
}
```

---

## Data Flow — Complete Sequence

```
1. User taps "Generate Keypoints" on Malaria topic
         ↓
2. AI generates content (2-3 seconds, user waits)
         ↓
3. Content shown to user immediately
         ↓
4. Content cached in ai_cache (is_flagged = 0)
         ↓
5. BACKGROUND PROCESS STARTS (user doesn't wait):
   a. extractMedicalEntities(content)
      → drugs: ['artemisinin', 'lumefantrine']
      → diseases: ['falciparum malaria']
      → dosages: ['20mg/kg']
      → claims: [
          "Artemisinin-based combination therapy is first-line for falciparum malaria",
          "Standard adult dose is 20mg/kg artemether + 120mg/kg lumefantrine"
        ]
         ↓
   b. getLectureTranscriptsByTopic(malaria)
      → DBMCI transcript: "ACT is drug of choice — artemether 80mg + lumefantrine 480mg twice daily for 3 days"
         ↓
   c. searchLatestMedicalSources("artemisinin lumefantrine falciparum malaria", 3)
      → Wikipedia: "WHO recommends ACT as first-line treatment for P. falciparum malaria"
      → PubMed: "Artemether-lumefantrine remains effective in India (2024 study)"
         ↓
   d. detectContraddictions(aiClaims, trustedSources)
      → Claim: "20mg/kg artemether" vs DBMCI: "80mg artemether twice daily"
      → CONTRADICTION DETECTED: dosage mismatch
         ↓
   e. logFactCheckResult(topicId, 'keypoints', 'failed', [contradiction])
   f. setContentFlagged(topicId, 'keypoints', true)
         ↓
6. User sees subtle notification: "⚠️ Malaria keypoints flagged for review — tap to see details"
         ↓
7. User navigates to Flagged Content screen:
   - Sees flagged keypoints with contradiction details
   - Taps "Regenerate" → fresh content generated
   - OR taps "Dismiss" if they think it's actually correct
```

---

## Files Changed/Created

### New Files

| File                                   | Purpose                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `src/services/ai/medicalFactCheck.ts`  | Entity extraction, contradiction detection, background fact-check pipeline  |
| `src/services/ai/medicalEntities.ts`   | Curated medical entity lists (drug names, diseases, dosages regex patterns) |
| `src/screens/FlaggedContentScreen.tsx` | Review flagged content, regenerate/dismiss UI                               |
| `src/components/ContentFlagButton.tsx` | Reusable flag button for content cards                                      |
| `src/components/FlagReasonSheet.tsx`   | Bottom sheet for selecting flag reason                                      |
| `src/db/queries/contentFlags.ts`       | user_content_flags CRUD operations                                          |

### Modified Files

| File                                   | Change                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `src/constants/prompts.ts`             | Add `MEDICAL_ACCURACY_GUARDRAIL` constant, append to all content prompt builders |
| `src/services/ai/content.ts`           | Trigger `scheduleBackgroundFactCheck()` after `setCachedContent()`               |
| `src/db/schema.ts`                     | Add `content_fact_checks` and `user_content_flags` table schemas                 |
| `src/db/migrations.ts`                 | Migration for new tables (new user_version)                                      |
| `src/navigation/types.ts`              | Add `FlaggedContent` to SettingsStackParamList                                   |
| `src/navigation/SettingsNavigator.tsx` | Add route to FlaggedContentScreen                                                |
| Content card components (6-8 files)    | Add `<ContentFlagButton>` to each card                                           |

---

## Error Handling

1. **Fact-check fails (API timeout, no trusted sources)** → content stays as-is, no flag (don't false-flag on technical errors). Status: `inconclusive`.
2. **No trusted sources found** → mark as `inconclusive`, don't auto-flag.
3. **Regeneration fails** → show error toast, keep old flagged content.
4. **User flags spam** → limit to 3 flags per topic per content type per user (prevent abuse — though this is single-user, so just a soft limit).

---

## Future Roadmap: MedTE Integration

**Status:** Planned — not in current scope.

### What is MedTE?

MedTE (Medical Text Embedding) is the state-of-the-art medical embedding model with benchmark score 0.578 on MedTEB (51 medical tasks). It outperforms MedEmbed, GTE Base, and general-purpose embedding models on medical text.

### Why Not Now?

- **Size:** 438 MB — too large for mobile APK (Guru's APK is already ~200-300MB)
- **Complexity:** Requires ONNX runtime setup + vector database
- **ROI:** Entity-based fact-checking solves 80% of the problem with zero APK size increase

### How to Add Later

1. **Cloud API option (recommended):** Host MedTE on Hugging Face Inference API or Replicate. Pay-per-call, no APK bloat.
2. **On-device option:** Convert MedTE to ONNX, bundle as optional download (~438MB additional storage).
3. **Integration:** Replace `calculateTextSimilarity()` (Jaccard) with MedTE cosine similarity for more nuanced contradiction detection.

### When to Add

- After core fact-checking system is stable
- When you notice entity-based checks missing paraphrased contradictions (e.g., AI says "drug X treats Y" but DBMCI says "drug X is ineffective for Y" — different wording, same concept)
- When you have cloud API budget (~$0.001-0.01 per fact-check call)

---

## Testing Strategy

### Unit Tests

1. **Entity extraction accuracy:**

   - Input: AI-generated quiz with known drug names, diseases, dosages
   - Expected: All entities extracted correctly
   - Test: `extractMedicalEntities()` returns correct lists

2. **Similarity calculation:**

   - Input: Two similar medical texts
   - Expected: Jaccard similarity score in reasonable range (0.3-0.8)
   - Test: `calculateTextSimilarity()` returns expected scores

3. **Contradiction detection:**
   - Input: AI claim + trusted source with known contradiction
   - Expected: `detectContradictions()` returns contradiction
   - Test: Various contradiction scenarios (dosage mismatch, outdated guideline, wrong mechanism)

### Integration Tests

1. **Fact-check pipeline:**

   - Generate content → trigger background check → verify flag status
   - Test: Content with known errors gets auto-flagged

2. **User flagging flow:**
   - Flag content → verify database state → regenerate → verify new content is different
   - Test: End-to-end flag → review → regenerate cycle

### E2E Tests (Detox)

1. **Flag button interaction:**

   - Navigate to topic → view keypoints → tap flag button → select reason → submit → verify notification

2. **Flagged Content screen:**
   - Navigate to Settings → Flagged Content → see flagged items → regenerate → verify item removed from list

### Manual QA

1. Generate 50 quizzes on known topics (malaria, diabetes, hypertension, etc.)
2. Verify flagged content actually has medical errors (spot-check)
3. Verify non-flagged content is accurate (spot-check)
4. Measure false positive rate (content flagged incorrectly)
5. Measure false negative rate (content with errors not flagged)

**Target:** <20% false positive rate, <30% false negative rate (good enough for v1 — MedTE will improve this later)

---

## Open Questions / Assumptions

- **Assumption:** DBMCI/BTR lecture transcripts are "gold standard" — if they have errors, we'll propagate those errors. This is acceptable because DBMCI is the user's primary learning source.
- **Assumption:** Jaccard similarity is sufficient for v1. If paraphrased contradictions are missed, MedTE will catch them later.
- **Assumption:** Single-user app — no abuse prevention needed for user flagging (just soft limits).
- **Open:** Should auto-flagged content show a visible warning to the user, or just silently flag for later review? **Decision:** Silently flag for now — avoid alarming the user. They'll see it in the Flagged Content screen.

---

## Success Criteria

1. **Medical accuracy improvement:** 80%+ of generated content passes fact-check without contradictions
2. **Zero user waiting:** Content generation time unchanged (background fact-check doesn't block UI)
3. **User adoption:** User flags 5+ inaccurate pieces of content per week (indicates engagement with the system)
4. **Regeneration rate:** 50%+ of flagged content is regenerated (user finds the review screen useful)

---

## Future Enhancements

1. **Confidence decay:** If a topic is flagged multiple times, increase regeneration prompt strength
2. **Crowdsource accuracy:** Track which content types/topics are flagged most — prioritize manual review
3. **Trusted source expansion:** Add textbook excerpts, standard guidelines (WHO, ICMR) as additional reference sources
4. **MedTE integration:** As described in Future Roadmap
5. **Auto-regeneration:** If confidence < threshold, automatically regenerate without user intervention
