// src/services/ai/medicalEntities.ts

/**
 * Curated medical entity patterns for fact-checking AI-generated content.
 * Covers high-yield NEET-PG drugs, diseases, dosages, and procedures.
 */

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
    'acyclovir',
    'valacyclovir',
    'oseltamivir',
    'artemisinin',
    'artemether',
    'lumefantrine',
    'chloroquine',
    'primaquine',
    'quinine',
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
    'metformin',
    'glimepiride',
    'glibenclamide',
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

export const DRUG_REGEX = new RegExp(`\\b(${ALL_DRUGS.join('|')})\\b`, 'gi');

export const DISEASE_REGEX =
  /\b(malaria|tuberculosis|diabetes|hypertension|pneumonia|meningitis|hepatitis|typhoid|dengue|cholera|hiv|aids|cancer|carcinoma|leukemia|lymphoma|anemia|asthma|copd|heart failure|myocardial infarction|stroke|sepsis|appendicitis|cholecystitis|pancreatitis|cirrhosis|nephrotic|nephritic|thyroid|hyperthyroidism|hypothyroidism|migraine|epilepsy|schizophrenia|depression|osteoporosis|gout|rheumatoid|psoriasis|glaucoma|cataract|sinusitis|endometriosis|pcos)\b/gi;

export const DOSAGE_REGEX =
  /\b(\d+\.?\d*)\s*(mg|ml|mcg|μg|g|units|IU|mmol|meq|micrograms|milligrams|grams)\b/gi;

export const PROCEDURE_REGEX =
  /\b(ecg|ekg|ct scan|mri|ultrasound|x.?ray|biopsy|endoscopy|colonoscopy|laparoscopy|echocardiogram|spirometry|pap smear|blood culture|urine culture|widal|mantoux|gram.?stain|af.?b|elisa|pcr)\b/gi;

export function extractSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

export function extractMedicalEntities(text: string) {
  return {
    drugs: (text.match(DRUG_REGEX) ?? []).map((d) => d.toLowerCase()),
    diseases: (text.match(DISEASE_REGEX) ?? []).map((d) => d.toLowerCase()),
    dosages: (text.match(DOSAGE_REGEX) ?? []).map((d) => d.trim()),
    procedures: (text.match(PROCEDURE_REGEX) ?? []).map((p) => p.toLowerCase()),
  };
}

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
