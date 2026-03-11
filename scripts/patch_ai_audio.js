const fs = require('fs');
let code = fs.readFileSync('../src/services/aiService.ts', 'utf-8');

const audioFunction = `
export async function transcribeAndSummarizeAudio(
  base64Audio: string,
  apiKey: string
): Promise<string> {
  const url = \`\${GEMINI_BASE}/\${PRIMARY_MODEL}:generateContent?key=\${apiKey}\`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: "You are a medical lecture assistant. Transcribe and extract the absolute highest-yield medical facts and clinical pearls from this lecture snippet. Return ONLY a concise, bulleted list of 1-3 key points. If no clear medical concepts are spoken, return 'NO_CONTENT'." },
            { inlineData: { mimeType: 'audio/m4a', data: base64Audio } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
      }
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(\`Gemini Audio API error \${res.status}: \${err}\`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty audio response from Gemini');
  return text.trim();
}
`;

code = code + "\n" + audioFunction;
fs.writeFileSync('../src/services/aiService.ts', code);
console.log('Added audio processing to aiService.ts');
