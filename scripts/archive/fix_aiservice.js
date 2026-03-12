const fs = require('fs');
let content = fs.readFileSync('../src/services/aiService.ts', 'utf-8');

const oldFunc = `function parseJsonResponse(raw: string): AIContent {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const clean = raw.replace(/\\\`\\\`\\\`json/g, '').replace(/\\\`\\\`\\\`/g, '').trim();
    parsed = JSON.parse(clean);
  }
  return AIContentSchema.parse(parsed);
} catch {
    const clean = raw.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    return JSON.parse(clean);
  }
}`;

const cleanFunc = `function parseJsonResponse(raw: string): AIContent {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const clean = raw.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    parsed = JSON.parse(clean);
  }
  return AIContentSchema.parse(parsed);
}`;

content = content.replace(oldFunc, cleanFunc);
// wait, the literal backticks might not match because I used \\\`\\\`\\\` in my replace script. Let's just use regex on the lines.
