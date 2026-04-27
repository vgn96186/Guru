const apiKey = process.env.EXPO_PUBLIC_VERTEX_AI_TOKEN || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("No API key available to test.");
  process.exit(1);
}
const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-3-flash-preview:generateContent`;
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
  })
}).then(async r => {
  console.log(r.status);
  console.log(await r.text());
}).catch(console.error);
