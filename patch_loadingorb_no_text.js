const fs = require('fs');

let content = fs.readFileSync('src/components/LoadingOrb.tsx', 'utf8');

// Remove textOpacity usage
content = content.replace(/  \/\/ Text\n  const textOpacity = useSharedValue\(1\);\n/g, '');
content = content.replace(/    \/\/ Text[^\n]*\n    textOpacity\.value = withRepeat\(withTiming\(0\.85, \{ duration: 2000 \}\), -1, true\);\n/g, '');

content = content.replace(/  const styleText = useAnimatedStyle\(\(\) => \(\{\n    opacity: textOpacity\.value,\n  \}\)\);\n/g, '');

// Clean up styles
content = content.replace(/  textContainer: {[\s\S]*?},\n  text: {[\s\S]*?},\n/g, '');

fs.writeFileSync('src/components/LoadingOrb.tsx', content);
