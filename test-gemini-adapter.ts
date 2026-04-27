import { createGeminiModel } from './src/services/ai/v2/providers/gemini';

const model = createGeminiModel({
  modelId: 'gemini-3-flash-preview',
  apiKey: 'FAKE_KEY_AQ123',
  fetch: async (url, init) => {
    console.log("FETCH CALLED WITH URL:", url);
    console.log("HEADERS:", init.headers);
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] })
    } as any;
  }
});

model.doGenerate({
  prompt: [{ role: 'user', content: 'test' }],
  mode: { type: 'regular' }
}).then(res => console.log("SUCCESS:", res)).catch(e => console.error("ERROR:", e));

