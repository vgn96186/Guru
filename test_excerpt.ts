import { buildRepresentativeTranscriptExcerpt } from './src/services/transcription/transcriptExcerpt';

const longText = Array.from({length: 1000}, (_, i) => `Paragraph ${i}: This is a long transcript. It goes on and on to simulate a very long lecture. We need to test if it chunks properly.`).join('\n\n');

console.log("Original length:", longText.length);
const excerpt = buildRepresentativeTranscriptExcerpt(longText, 64000, 4);
console.log("Excerpt length:", excerpt.length);
console.log("Excerpt starts with:", excerpt.substring(0, 100));
console.log("Excerpt ends with:", excerpt.substring(excerpt.length - 100));
console.log("Excerpt includes separators:", excerpt.includes('[...]'));
