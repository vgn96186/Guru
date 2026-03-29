const fs = require('fs');

const content = fs.readFileSync('src/constants/syllabus.ts', 'utf-8');
const lines = content.split('\n');

const parsedLines = [];
const parentNames = new Set();
const allNames = new Set();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.trim().startsWith('[') && line.includes(']')) {
    const start = line.indexOf('[');
    const end = line.lastIndexOf(']');

    let arr = null;
    try {
      const arrayStr = line.substring(start, end + 1);
      arr = eval(arrayStr);
    } catch (e) {
      // Ignore if eval fails
    }

    if (arr && Array.isArray(arr) && arr.length >= 4 && typeof arr[0] === 'number') {
      parsedLines.push({
        type: 'topic',
        line,
        indent: line.substring(0, start),
        arr,
        trailing: line.substring(end + 1),
      });

      if (arr.length >= 5 && arr[4]) {
        parentNames.add(arr[4]);
      }
      allNames.add(arr[1]);
      continue;
    }
  }

  parsedLines.push({
    type: 'text',
    line,
  });
}

function getSubTopicsForSubject(subjectId) {
  switch (subjectId) {
    case 1: // Anatomy
      return [
        'Embryological Development',
        'Gross Anatomy & Structure',
        'Relations & Boundaries',
        'Blood Supply & Lymphatics',
        'Nerve Supply & Innervation',
        'Applied & Clinical Anatomy',
      ];
    case 2: // Physiology
      return [
        'Basic Concepts & Functions',
        'Cellular Mechanisms',
        'Physiological Regulation & Control',
        'Pathophysiology',
        'Clinical Evaluation & Tests',
      ];
    case 3: // Biochemistry
      return [
        'Structure & Properties',
        'Metabolic Pathways',
        'Enzymes & Regulation',
        'Clinical Biochemistry & Lab Tests',
        'Associated Inborn Errors / Disorders',
      ];
    case 4: // Pathology
      return [
        'Etiology & Pathogenesis',
        'Gross Morphology',
        'Microscopic Pathology / Histology',
        'Clinical Correlation',
        'Prognostic Markers',
      ];
    case 5: // Microbiology
      return [
        'Agent Characteristics & Morphology',
        'Pathogenesis & Virulence Factors',
        'Clinical Syndromes',
        'Laboratory Diagnosis',
        'Treatment, Prevention & Control',
      ];
    case 6: // Pharmacology
      return [
        'Classification & Chemistry',
        'Mechanism of Action & Pharmacodynamics',
        'Pharmacokinetics (ADME)',
        'Clinical Indications & Dosing',
        'Adverse Effects & Toxicity',
        'Contraindications & Drug Interactions',
      ];
    case 7: // FMT
      return [
        'Medicolegal Importance',
        'Pathological Findings',
        'Toxicological Aspects',
        'Legal Sections & Acts',
      ];
    case 17: // Radiology
    case 18: // Anesthesia
      return [
        'Basic Principles & Physics',
        'Indications & Patient Selection',
        'Technique & Procedure',
        'Interpretation of Results',
        'Complications & Management',
      ];
    case 19: // PSM
      return [
        'Epidemiological Determinants',
        'Risk Factors & Transmission',
        'Screening & Early Diagnosis',
        'Prevention Strategies',
        'National Health Programs Integration',
      ];
    default: // Clinical Subjects (Medicine, Surgery, OBG, Peds, etc)
      return [
        'Etiology & Risk Factors',
        'Pathophysiology',
        'Clinical Presentation & Signs',
        'Differential Diagnosis',
        'Investigations & Lab Findings',
        'Medical & Surgical Management',
        'Complications & Prognosis',
      ];
  }
}

const newLines = [];
let addedTopicsCount = 0;

for (const parsed of parsedLines) {
  newLines.push(parsed.line);

  if (parsed.type === 'topic') {
    const arr = parsed.arr;
    const subjectId = arr[0];
    const name = arr[1];
    const minutes = arr[3];

    // If it's a leaf node, let's expand it into 4-7 highly specific sub-topics
    if (!parentNames.has(name)) {
      const subTopics = getSubTopicsForSubject(subjectId);

      const subIndent = parsed.indent + '  ';
      const dividedMinutes = Math.max(5, Math.floor(minutes / subTopics.length));

      for (const st of subTopics) {
        const newName = name + ' - ' + st;
        const line =
          subIndent +
          '[' +
          subjectId +
          ", '" +
          newName.replace(/'/g, "\\'") +
          "', " +
          arr[2] +
          ', ' +
          dividedMinutes +
          ", '" +
          name.replace(/'/g, "\\'") +
          "'],";
        newLines.push(line);
        addedTopicsCount++;
      }
    }
  }
}

fs.writeFileSync('src/constants/syllabus.ts', newLines.join('\n'));
console.log(
  'Successfully expanded. Added ' + addedTopicsCount + ' new extremely granular sub-topics.',
);
