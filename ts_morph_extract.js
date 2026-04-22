const { Project, SyntaxKind } = require('/tmp/ts-morph-temp/node_modules/ts-morph');
const fs = require('fs');

const project = new Project();
project.addSourceFileAtPath('/Users/vishnugnair/Guru/debug/src/screens/ContentCard.tsx');

const file = project.getSourceFile('ContentCard.tsx');

const toExtract = {
  TopicImage: { type: 'VariableStatement', name: 'TopicImage', dest: 'shared/TopicImage.tsx' },
  QuestionImage: {
    type: 'VariableStatement',
    name: 'QuestionImage',
    dest: 'shared/QuestionImage.tsx',
  },
  ConfidenceRating: {
    type: 'FunctionDeclaration',
    name: 'ConfidenceRating',
    dest: 'shared/ConfidenceRating.tsx',
  },
  ExplainablePoint: {
    type: 'FunctionDeclaration',
    name: 'ExplainablePoint',
    dest: 'shared/ExplainablePoint.tsx',
  },
  ConceptChip: { type: 'FunctionDeclaration', name: 'ConceptChip', dest: 'shared/ConceptChip.tsx' },
  DeepExplanationBlock: {
    type: 'FunctionDeclaration',
    name: 'DeepExplanationBlock',
    dest: 'shared/DeepExplanationBlock.tsx',
  },
  QuizOptionBtn: {
    type: 'FunctionDeclaration',
    name: 'QuizOptionBtn',
    dest: 'shared/QuizOptionBtn.tsx',
  },
  stripImageFraming: {
    type: 'FunctionDeclaration',
    name: 'stripImageFraming',
    dest: 'utils/stripImageFraming.ts',
  },
  isQuizImageHttpUrl: {
    type: 'FunctionDeclaration',
    name: 'isQuizImageHttpUrl',
    dest: 'utils/isQuizImageHttpUrl.ts',
  },
  compactLines: {
    type: 'FunctionDeclaration',
    name: 'compactLines',
    dest: 'utils/compactLines.ts',
  },
  extractMedicalConcepts: {
    type: 'FunctionDeclaration',
    name: 'extractMedicalConcepts',
    dest: 'utils/extractMedicalConcepts.ts',
  },
  formatQuizExplanation: {
    type: 'FunctionDeclaration',
    name: 'formatQuizExplanation',
    dest: 'utils/formatQuizExplanation.ts',
  },
  buildGuruContext: {
    type: 'FunctionDeclaration',
    name: 'buildGuruContext',
    dest: 'guruContext.ts',
  },
  useCardScrollPaddingBottom: {
    type: 'FunctionDeclaration',
    name: 'useCardScrollPaddingBottom',
    dest: 'hooks/useCardScrollPadding.ts',
    isAppend: true,
  },
  useCardScrollContentStyle: {
    type: 'FunctionDeclaration',
    name: 'useCardScrollContentStyle',
    dest: 'hooks/useCardScrollPadding.ts',
    isAppend: true,
  },
};

const extractedTexts = {};

for (const [key, info] of Object.entries(toExtract)) {
  let node;
  if (info.type === 'FunctionDeclaration') {
    node = file.getFunction(info.name);
  } else if (info.type === 'VariableStatement') {
    node = file.getVariableStatement(info.name);
  }

  if (node) {
    let fullText = node.getFullText();
    // if node has leading comments, they are in fullText

    if (info.isAppend) {
      extractedTexts[info.dest] = (extractedTexts[info.dest] || '') + '\n' + fullText;
    } else {
      extractedTexts[info.dest] = fullText;
    }

    // remove from file
    node.remove();
    console.log('Extracted', key);
  } else {
    console.log('Could not find', key);
  }
}

// Extract styles
const sNode = file.getVariableStatement('s');
if (sNode) {
  extractedTexts['styles.ts'] = sNode.getFullText();
  sNode.remove();
  console.log('Extracted s');
}

const flashcardNode = file.getVariableStatement('FLASHCARD_RATINGS');
if (flashcardNode) {
  extractedTexts['styles.ts'] += '\n' + flashcardNode.getFullText();
  flashcardNode.remove();
  console.log('Extracted FLASHCARD_RATINGS');
}

const propsNode = file.getInterface('Props');
if (propsNode) {
  extractedTexts['types.ts'] = propsNode.getFullText();
  propsNode.remove();
  console.log('Extracted Props');
}

const contextUpdaterNode = file.getTypeAlias('ContextUpdater');
if (contextUpdaterNode) {
  extractedTexts['types.ts'] += '\n' + contextUpdaterNode.getFullText();
  contextUpdaterNode.remove();
  console.log('Extracted ContextUpdater');
}

// Add imports
file.insertImportDeclarations(file.getImportDeclarations().length, [
  { moduleSpecifier: './ContentCard/styles', namedImports: ['s', 'FLASHCARD_RATINGS'] },
  { moduleSpecifier: './ContentCard/types', namedImports: ['Props', 'ContextUpdater'] },
  { moduleSpecifier: './ContentCard/utils/compactLines', namedImports: ['compactLines'] },
  { moduleSpecifier: './ContentCard/guruContext', namedImports: ['buildGuruContext'] },
  {
    moduleSpecifier: './ContentCard/utils/extractMedicalConcepts',
    namedImports: ['extractMedicalConcepts'],
  },
  {
    moduleSpecifier: './ContentCard/utils/formatQuizExplanation',
    namedImports: ['formatQuizExplanation'],
  },
  { moduleSpecifier: './ContentCard/utils/stripImageFraming', namedImports: ['stripImageFraming'] },
  {
    moduleSpecifier: './ContentCard/utils/isQuizImageHttpUrl',
    namedImports: ['isQuizImageHttpUrl'],
  },
]);

for (const [dest, text] of Object.entries(extractedTexts)) {
  // if dest is styles or utils, write it, but wait we need to add EXPORT!
  let finalText = text;

  if (dest.includes('utils/') || dest.includes('guruContext') || dest.includes('hooks/')) {
    finalText = finalText.replace(/function /, 'export function ');
  }
  if (dest === 'types.ts') {
    finalText = finalText
      .replace(/interface /, 'export interface ')
      .replace(/type /, 'export type ');
  }
  if (dest === 'styles.ts') {
    finalText = finalText
      .replace(/const s =/, 'export const s =')
      .replace(/const FLASHCARD_RATINGS =/, 'export const FLASHCARD_RATINGS =');
  }

  // write the file
  fs.writeFileSync(`/Users/vishnugnair/Guru/debug/src/screens/ContentCard/${dest}`, finalText);
}

// Save modified ContentCard.tsx
file.saveSync();
