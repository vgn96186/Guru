import { buildRepresentativeTranscriptExcerpt } from './src/services/transcription/transcriptExcerpt';

describe('buildRepresentativeTranscriptExcerpt', () => {
    it('should chunk correctly and not cut off words if possible', () => {
        const longText = Array.from({length: 1000}, (_, i) => `Paragraph ${i}: This is a long transcript. It goes on and on to simulate a very long lecture. We need to test if it chunks properly.`).join(' ');
        const excerpt = buildRepresentativeTranscriptExcerpt(longText, 64000, 4);
        console.log("Original length:", longText.length);
        console.log("Excerpt length:", excerpt.length);
        const segments = excerpt.split('\n\n[...]\n\n');
        segments.forEach((seg, i) => {
            console.log(`Segment ${i} start:`, seg.substring(0, 50));
            console.log(`Segment ${i} end:`, seg.substring(seg.length - 50));
        });
    });
});
