# Syllabus UI — DB Schema & Metric Definitions (Reference)

Reference for wiring the Syllabus UI to the database: exact table definitions, how metrics are stored, and the TypeScript shape expected by the Subject Card.

---

## 1. DB schema (Subjects, Topics, Progress)

### subjects

```sql
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  inicet_weight INTEGER NOT NULL,
  neet_weight INTEGER NOT NULL,
  display_order INTEGER NOT NULL
);
```

| Column        | Type    | Notes          |
| ------------- | ------- | -------------- |
| id            | INTEGER | PK             |
| name          | TEXT    | e.g. "Anatomy" |
| short_code    | TEXT    | e.g. "ANAT"    |
| color_hex     | TEXT    | UI color       |
| inicet_weight | INTEGER | INICET weight  |
| neet_weight   | INTEGER | NEET weight    |
| display_order | INTEGER | Sort order     |

---

### topics

```sql
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  parent_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  estimated_minutes INTEGER DEFAULT 35,
  inicet_priority INTEGER DEFAULT 5,
  embedding BLOB,
  UNIQUE(subject_id, name)
);
```

| Column            | Type    | Notes                                      |
| ----------------- | ------- | ------------------------------------------ |
| id                | INTEGER | PK, AUTOINCREMENT                          |
| subject_id        | INTEGER | FK → subjects.id                           |
| parent_topic_id   | INTEGER | FK → topics.id (null = root “micro” topic) |
| name              | TEXT    | Topic name                                 |
| estimated_minutes | INTEGER | Default 35                                 |
| inicet_priority   | INTEGER | 1–10; used for “High Yield” (see below)    |
| embedding         | BLOB    | Optional vector for semantic match         |

---

### topic_progress (progress/reviews per topic)

```sql
CREATE TABLE IF NOT EXISTS topic_progress (
  topic_id INTEGER PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unseen'
    CHECK(status IN ('unseen','seen','reviewed','mastered')),
  confidence INTEGER NOT NULL DEFAULT 0,
  last_studied_at INTEGER,
  times_studied INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  next_review_date TEXT,
  user_notes TEXT NOT NULL DEFAULT '',
  wrong_count INTEGER NOT NULL DEFAULT 0,
  is_nemesis INTEGER NOT NULL DEFAULT 0,
  fsrs_due TEXT,
  fsrs_stability REAL DEFAULT 0,
  fsrs_difficulty REAL DEFAULT 0,
  fsrs_elapsed_days INTEGER DEFAULT 0,
  fsrs_scheduled_days INTEGER DEFAULT 0,
  fsrs_reps INTEGER DEFAULT 0,
  fsrs_lapses INTEGER DEFAULT 0,
  fsrs_state INTEGER DEFAULT 0,
  fsrs_last_review TEXT
);
```

| Column           | Type    | Notes                                          |
| ---------------- | ------- | ---------------------------------------------- |
| topic_id         | INTEGER | PK, FK → topics.id                             |
| status           | TEXT    | 'unseen' \| 'seen' \| 'reviewed' \| 'mastered' |
| confidence       | INTEGER | 0–3                                            |
| last_studied_at  | INTEGER | Epoch ms (nullable)                            |
| times_studied    | INTEGER | Count of study events                          |
| xp_earned        | INTEGER | XP from this topic                             |
| next_review_date | TEXT    | Legacy date string (nullable)                  |
| user_notes       | TEXT    | Free-text notes; “Notes” = non-empty           |
| wrong_count      | INTEGER | Wrong-answer count                             |
| is_nemesis       | INTEGER | 0/1 flag                                       |
| fsrs_due         | TEXT    | ISO date (YYYY-MM-DD); **primary “due” field** |
| fsrs\_\*         | …       | FSRS spacing state                             |

---

### lecture_notes (lectures/transcripts; optional for syllabus aggregation)

```sql
CREATE TABLE IF NOT EXISTS lecture_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id),
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  transcript TEXT,
  summary TEXT,
  topics_json TEXT,
  app_name TEXT,
  duration_minutes INTEGER,
  confidence INTEGER DEFAULT 2,
  embedding BLOB,
  recording_path TEXT,
  recording_duration_seconds INTEGER,
  transcription_confidence REAL,
  processing_metrics_json TEXT,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);
```

Syllabus cards use **topics** + **topic_progress** (and **subjects**). **lecture_notes** and **lecture_learned_topics** are for transcript/lecture history, not for the “Due / HY / Unseen / Notes” counts on the card.

---

## 2. How the metrics are tracked

Syllabus currently aggregates **per subject** over **root-level topics only** (no child topics in the counts), using `topic_progress` and `topics` as below.

### Due (due for review)

- **Storage:** `topic_progress.fsrs_due` (TEXT, ISO date `YYYY-MM-DD`). Optional legacy: `next_review_date` (TEXT).
- **Meaning:** “Due” = number of **root** topics in that subject that are due for review (studied at least once and due today or overdue).
- **Logic in SQL:**  
  `status != 'unseen'` **and** (`fsrs_due IS NULL` **or** `DATE(fsrs_due) <= DATE('now')`).  
  In practice the app uses **fsrs_due** for scheduling; “due” count = topics with `fsrs_due` today or in the past and not unseen.

Current pattern (from `SyllabusScreen`):

```sql
SUM(CASE WHEN COALESCE(p.status, 'unseen') != 'unseen'
         AND (p.fsrs_due IS NULL OR DATE(p.fsrs_due) <= DATE('now'))
     THEN 1 ELSE 0 END) AS due
```

So: **due** is a **count**; the **underlying field** is the **date column** `topic_progress.fsrs_due` (and optionally `next_review_date`).

---

### High Yield (HY)

- **Storage:** `topics.inicet_priority` (INTEGER, default 5). Range in seed data is 1–10.
- **Meaning:** “High yield” = topic is important for INICET; no separate boolean. The app treats **inicet_priority >= 8** as “high yield” for the badge count.
- **Logic in SQL:**  
  Count of root topics where `t.inicet_priority >= 8`.

So: **HY** is **not** a boolean; it’s derived from **integer priority** (`inicet_priority >= 8`).

---

### Unseen

- **Storage:** `topic_progress.status` (TEXT) with CHECK `'unseen' | 'seen' | 'reviewed' | 'mastered'`. Default `'unseen'`.
- **Meaning:** “Unseen” = topic has never been studied (or progress row missing, treated as unseen).
- **Logic in SQL:**  
  Count of root topics where `COALESCE(p.status, 'unseen') = 'unseen'`.

So: **Unseen** is a **count**; the underlying field is the **status string** `topic_progress.status`, not a percentage.

---

### Notes (with notes)

- **Storage:** `topic_progress.user_notes` (TEXT NOT NULL, default `''`).
- **Meaning:** “Notes” = topic has at least some user-entered notes.
- **Logic in SQL:**  
  Count of root topics where `TRIM(COALESCE(p.user_notes, '')) <> ''`.

So: **Notes** is a **count**; the underlying field is a **text column** (`user_notes`), and “with notes” = non-empty after trim.

---

## 3. TypeScript: Subject Card and related types

### Subject (from `src/types/index.ts`)

```ts
export interface Subject {
  id: number;
  name: string;
  shortCode: string;
  colorHex: string;
  inicetWeight: number;
  neetWeight: number;
  displayOrder: number;
  topics?: TopicWithProgress[];
}
```

### SubjectCard props (from `src/components/SubjectCard.tsx`)

```ts
interface Props {
  subject: Subject;
  coverage: { total: number; seen: number };
  metrics?: {
    due: number;
    highYield: number;
    unseen: number;
    withNotes: number;
    weak: number;
  };
  matchingTopicsCount?: number;
  onPress: () => void;
}
```

So the **shape** your SQL aggregation should feed into each card is:

- **subject:** one row from **subjects** (mapped to `Subject`: snake_case → camelCase, e.g. `short_code` → `shortCode`, `color_hex` → `colorHex`).
- **coverage:** `{ total: number; seen: number }` (e.g. total root topics in subject, and count with `status IN ('seen','reviewed','mastered')`).
- **metrics:** optional object with **counts** (all numbers):
  - `due` — count due for review (fsrs_due logic above).
  - `highYield` — count with `inicet_priority >= 8`.
  - `unseen` — count with `status = 'unseen'`.
  - `withNotes` — count with non-empty `user_notes`.
  - `weak` — count studied but low confidence (e.g. `times_studied > 0 AND confidence < 3`).

Current SyllabusScreen uses the same shape and builds it from a single grouped query over `topics` + `topic_progress` with the exact metric definitions above; you can reuse that query or adapt it for your optimized aggregation.

---

## 4. Quick reference: columns used for each metric

| Metric     | Table          | Column(s)                 | Type    | How it’s used for the count                 |
| ---------- | -------------- | ------------------------- | ------- | ------------------------------------------- |
| Due        | topic_progress | fsrs_due, status          | TEXT    | status != 'unseen' AND (fsrs_due <= today)  |
| High Yield | topics         | inicet_priority           | INTEGER | inicet_priority >= 8                        |
| Unseen     | topic_progress | status                    | TEXT    | status = 'unseen' (or COALESCE to 'unseen') |
| Notes      | topic_progress | user_notes                | TEXT    | TRIM(COALESCE(user_notes,'')) <> ''         |
| Weak       | topic_progress | times_studied, confidence | INT     | times_studied > 0 AND confidence < 3        |

All counts in the current implementation are over **root-level topics only** (`WHERE NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = t.id)`).
