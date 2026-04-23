const fs = require('fs');
const filePath = 'src/services/ai/medicalSearch.unit.test.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Fix createSource types
content = content.replace(
  'const createSource = (sourceName, title, snippet, publishedAt = undefined) => ({',
  'const createSource = (sourceName: string, title: string, snippet: string, publishedAt?: string): MedicalGroundingSource => ({'
);

// Fix sources array types
content = content.replace(
  'const sources = [',
  'const sources: MedicalGroundingSource[] = ['
);
content = content.replace(
  'const sources = [',
  'const sources: MedicalGroundingSource[] = ['
);

fs.writeFileSync(filePath, content);
console.log('Fixed types');
