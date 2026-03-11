const fs = require('fs');

let code = fs.readFileSync('../src/screens/ContentCard.tsx', 'utf-8');
const imports = `import * as Speech from 'expo-speech';\nimport * as Haptics from 'expo-haptics';\n`;

code = code.replace("import React, { useState } from 'react';", "import React, { useState } from 'react';\n" + imports);

// We want to add a "Read Aloud" button for keypoints, story, mnemonic
// Let's add a function to read text
const readFunc = `
  const handleReadAloud = (text: string) => {
    Speech.isSpeakingAsync().then(speaking => {
      if (speaking) {
        Speech.stop();
      } else {
        Speech.speak(text, { rate: 0.9, pitch: 1 });
      }
    });
  };
`;
// Let's inject this into the component. We can just add it before `switch (content.type) {`
code = code.replace("switch (content.type) {", readFunc + "\n  switch (content.type) {");

// Now we need to add the button to the renders. This might be tricky via regex without seeing the file structure.
// I'll just write it back to disk for now.
fs.writeFileSync('../src/screens/ContentCard.tsx', code);
console.log('Patched ContentCard.tsx with Speech and Haptics imports');
