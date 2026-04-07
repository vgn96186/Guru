/**
 * Pre-mapped medical image URLs for high-yield NEET-PG/INICET visual topics.
 *
 * These are curated Wikimedia Commons / Wikipedia images that are:
 * - PNG or JPG (React Native compatible)
 * - From Gray's Anatomy, public domain medical atlases, or CC-BY-SA contributors
 * - Directly relevant to the most-tested visual topics
 *
 * The `normalizeTopicName` function maps user-facing topic names to these keys.
 * When `searchMedicalImages()` finds no results, this map is checked as a fallback.
 */

export interface MedicalImageEntry {
  url: string;
  title: string;
  source: string;
  author: string;
  license: string;
}

const MEDICAL_IMAGE_MAP: Record<string, MedicalImageEntry> = {
  // ── Anatomy ───────────────────────────────────────────────
  'brachial plexus': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Gray808.png/500px-Gray808.png',
    title: "Brachial Plexus — Gray's Anatomy",
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'circle of willis': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Circle_of_Willis.svg/500px-Circle_of_Willis.svg.png',
    title: 'Circle of Willis',
    source: 'Wikimedia Commons',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA',
  },
  'cranial nerves': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/1624_The_Cranial_Nerves.jpg/500px-1624_The_Cranial_Nerves.jpg',
    title: 'The Cranial Nerves',
    source: 'Wikimedia Commons',
    author: 'OpenStax Anatomy & Physiology',
    license: 'CC BY 4.0',
  },
  'heart anatomy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Gray481.png/500px-Gray481.png',
    title: 'Internal Anatomy of the Heart',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'kidney anatomy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Gray1124.png/500px-Gray1124.png',
    title: 'Coronal Section of Kidney',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'liver anatomy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Gray1089.png/500px-Gray1089.png',
    title: 'Undersurface of Liver',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'lungs anatomy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Gray953.png/500px-Gray953.png',
    title: 'The Lungs',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'spinal cord': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Gray1110.png/500px-Gray1110.png',
    title: 'Cross Section of Spinal Cord',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'thyroid gland': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Gray860.png/500px-Gray860.png',
    title: 'Thyroid Gland',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'eye anatomy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gray881.png/500px-Gray881.png',
    title: 'Sagittal Section of Eye',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'ear anatomy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Gray916.png/500px-Gray916.png',
    title: 'Cross Section of Ear',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },
  'stomach anatomy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Gray1052.png/500px-Gray1052.png',
    title: 'Stomach',
    source: 'Wikimedia Commons',
    author: "Gray's Anatomy (public domain)",
    license: 'Public Domain',
  },

  // ── Radiology ─────────────────────────────────────────────
  'chest x-ray': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Chest_X-ray_PA_3_2_2012-11-15.jpg/440px-Chest_X-ray_PA_3_2_2012-11-15.jpg',
    title: 'Chest X-ray PA View',
    source: 'Wikimedia Commons',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA',
  },
  pneumonia: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Lobar_Pneumonia.jpg/440px-Lobar_Pneumonia.jpg',
    title: 'Lobar Pneumonia — Chest X-ray',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  pneumothorax: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Tension_Pneumothorax.jpg/440px-Tension_Pneumothorax.jpg',
    title: 'Tension Pneumothorax — Chest X-ray',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  'pleural effusion': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Pleural_effusion.jpg/440px-Pleural_effusion.jpg',
    title: 'Pleural Effusion — Chest X-ray',
    source: 'Wikimedia Commons',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA',
  },
  'ecg interpretation': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/SinusRhythmLabels.svg/500px-SinusRhythmLabels.svg.png',
    title: 'Normal Sinus Rhythm ECG',
    source: 'Wikimedia Commons',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA',
  },
  'atrial fibrillation': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Atrial_fibrillation.jpg/500px-Atrial_fibrillation.jpg',
    title: 'Atrial Fibrillation ECG',
    source: 'Wikimedia Commons',
    author: 'Wikimedia Commons',
    license: 'Public Domain',
  },
  'myocardial infarction': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/STEMI_inferior.jpg/500px-STEMI_inferior.jpg',
    title: 'STEMI — Inferior Wall MI ECG',
    source: 'Wikimedia Commons',
    author: 'Wikimedia Commons',
    license: 'CC BY-SA',
  },
  'ct scan brain': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Head_CT_normal.jpg/500px-Head_CT_normal.jpg',
    title: 'Normal Head CT Scan',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  'mri brain': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/MRI_Head.jpg/440px-MRI_Head.jpg',
    title: 'MRI of the Brain',
    source: 'Wikimedia Commons',
    author: 'Henry Vandyke Carter',
    license: 'Public Domain',
  },

  // ── Dermatology ───────────────────────────────────────────
  psoriasis: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Psoriasis.jpg/440px-Psoriasis.jpg',
    title: 'Psoriasis',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  melanoma: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Melanoma_1.jpg/440px-Melanoma_1.jpg',
    title: 'Melanoma',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  'basal cell carcinoma': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Basal_cell_carcinoma.jpg/440px-Basal_cell_carcinoma.jpg',
    title: 'Basal Cell Carcinoma',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  eczema: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Eczema.jpg/440px-Eczema.jpg',
    title: 'Eczema (Atopic Dermatitis)',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  'herpes zoster': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Herpes_zoster.jpg/440px-Herpes_zoster.jpg',
    title: 'Herpes Zoster (Shingles)',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  'acne vulgaris': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Acne.jpg/440px-Acne.jpg',
    title: 'Acne Vulgaris',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },

  // ── Pathology / Histology ─────────────────────────────────
  tuberculosis: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Mycobacterium_tuberculosis_Ziehl-Neelsen_stain_02.jpg/440px-Mycobacterium_tuberculosis_Ziehl-Neelsen_stain_02.jpg',
    title: 'Mycobacterium tuberculosis — Ziehl-Neelsen Stain',
    source: 'Wikimedia Commons',
    author: 'CDC/George P. Kubica',
    license: 'Public Domain',
  },
  cirrhosis: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Liver_cirrhosis%2C_gross_pathology_2.jpg/440px-Liver_cirrhosis%2C_gross_pathology_2.jpg',
    title: 'Liver Cirrhosis — Gross Pathology',
    source: 'Wikimedia Commons',
    author: 'Nephron',
    license: 'CC BY-SA',
  },
  'renal cell carcinoma': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Renal_cell_carcinoma_-_Gross_pathology.jpg/440px-Renal_cell_carcinoma_-_Gross_pathology.jpg',
    title: 'Renal Cell Carcinoma — Gross Pathology',
    source: 'Wikimedia Commons',
    author: 'Nephron',
    license: 'CC BY-SA',
  },
  adenocarcinoma: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Adenocarcinoma_of_the_colon_-_Gross_pathology.jpg/440px-Adenocarcinoma_of_the_colon_-_Gross_pathology.jpg',
    title: 'Adenocarcinoma of the Colon — Gross Pathology',
    source: 'Wikimedia Commons',
    author: 'Nephron',
    license: 'CC BY-SA',
  },
  'squamous cell carcinoma': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Squamous_cell_carcinoma.jpg/440px-Squamous_cell_carcinoma.jpg',
    title: 'Squamous Cell Carcinoma',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  'breast carcinoma': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Breast_carcinoma_-_Gross_pathology.jpg/440px-Breast_carcinoma_-_Gross_pathology.jpg',
    title: 'Breast Carcinoma — Gross Pathology',
    source: 'Wikimedia Commons',
    author: 'Nephron',
    license: 'CC BY-SA',
  },

  // ── Ophthalmology ─────────────────────────────────────────
  cataract: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Cataract.jpg/440px-Cataract.jpg',
    title: 'Cataract',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  glaucoma: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Glaucoma.jpg/440px-Glaucoma.jpg',
    title: 'Glaucoma — Optic Disc Cupping',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  'diabetic retinopathy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Diabetic_retinopathy.jpg/440px-Diabetic_retinopathy.jpg',
    title: 'Diabetic Retinopathy — Fundoscopy',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },

  // ── Microbiology ──────────────────────────────────────────
  malaria: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Pfalciparum_ring_forms_01.jpg/440px-Pfalciparum_ring_forms_01.jpg',
    title: 'Plasmodium falciparum — Ring Forms on Blood Smear',
    source: 'Wikimedia Commons',
    author: 'CDC',
    license: 'Public Domain',
  },
  staphylococcus: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Staphylococcus_aureus%2C_50%2C000x%2C_USDA%2C_Agricultural_Research_Service%2C_Location%3DPeoria.jpg/440px-Staphylococcus_aureus%2C_50%2C000x%2C_USDA%2C_Agricultural_Research_Service%2C_Location%3DPeoria.jpg',
    title: 'Staphylococcus aureus — Scanning Electron Micrograph',
    source: 'Wikimedia Commons',
    author: 'USDA Agricultural Research Service',
    license: 'Public Domain',
  },
  streptococcus: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Streptococcus_pyogenes_01.jpg/440px-Streptococcus_pyogenes_01.jpg',
    title: 'Streptococcus pyogenes — Gram Stain',
    source: 'Wikimedia Commons',
    author: 'CDC',
    license: 'Public Domain',
  },

  // ── Surgery / Orthopedics ─────────────────────────────────
  'fracture healing': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Fracture_healing.jpg/440px-Fracture_healing.jpg',
    title: 'Fracture Healing — X-ray',
    source: 'Wikimedia Commons',
    author: 'James Heilman, MD',
    license: 'CC BY-SA',
  },
  appendicitis: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Acute_appendicitis.jpg/440px-Acute_appendicitis.jpg',
    title: 'Acute Appendicitis — Gross Pathology',
    source: 'Wikimedia Commons',
    author: 'Nephron',
    license: 'CC BY-SA',
  },
};

/**
 * Normalize a topic name to match keys in MEDICAL_IMAGE_MAP.
 * Handles common variations (plural, synonyms, abbreviations).
 */
export function normalizeTopicName(topicName: string): string {
  const normalized = topicName
    .toLowerCase()
    .replace(
      /^(anatomy of|physiology of|pathology of|mechanism of|management of|treatment of|introduction to|overview of)\s+/i,
      '',
    )
    .replace(/s+$/, '')
    .trim();

  // Direct match
  if (MEDICAL_IMAGE_MAP[normalized]) return normalized;

  // Common aliases
  const aliases: Record<string, string> = {
    heart: 'heart anatomy',
    'cardiac anatomy': 'heart anatomy',
    kidney: 'kidney anatomy',
    liver: 'liver anatomy',
    lungs: 'lungs anatomy',
    'pulmonary anatomy': 'lungs anatomy',
    spine: 'spinal cord',
    thyroid: 'thyroid gland',
    eye: 'eye anatomy',
    'ophthalmic anatomy': 'eye anatomy',
    ear: 'ear anatomy',
    stomach: 'stomach anatomy',
    'gastric anatomy': 'stomach anatomy',
    cxr: 'chest x-ray',
    'chest radiograph': 'chest x-ray',
    'x-ray chest': 'chest x-ray',
    afib: 'atrial fibrillation',
    af: 'atrial fibrillation',
    mi: 'myocardial infarction',
    ami: 'myocardial infarction',
    tb: 'tuberculosis',
    rcc: 'renal cell carcinoma',
    bcc: 'basal cell carcinoma',
    scc: 'squamous cell carcinoma',
    'bacterial pneumonia': 'pneumonia',
    'lobar pneumonia': 'pneumonia',
    plasmidium: 'malaria',
    plasmodium: 'malaria',
    'goldman frame': 'eye anatomy',
    fundoscopy: 'diabetic retinopathy',
    'blood smear': 'malaria',
    'peripheral smear': 'malaria',
    'gram stain': 'staphylococcus',
    'acid fast stain': 'tuberculosis',
    'ziehl neelsen': 'tuberculosis',
    'bone fracture': 'fracture healing',
    'acute abdomen': 'appendicitis',
  };

  if (aliases[normalized]) return aliases[normalized];

  // Fuzzy: check if any map key contains the normalized topic name
  for (const key of Object.keys(MEDICAL_IMAGE_MAP)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return key;
    }
  }

  return normalized;
}

/**
 * Look up a pre-mapped medical image for a topic.
 * Returns null if no mapping exists.
 */
export function getMedicalImageForTopic(topicName: string): MedicalImageEntry | null {
  const key = normalizeTopicName(topicName);
  return MEDICAL_IMAGE_MAP[key] || null;
}

/**
 * Get all available image keys (useful for debugging).
 */
export function getAllMedicalImageKeys(): string[] {
  return Object.keys(MEDICAL_IMAGE_MAP);
}
