#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function toPascalCase(str) {
  return str.replace(/(^\w|-\w)/g, (match) => match.replace('-', '').toUpperCase());
}

function toKebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

const COMPONENT_TEMPLATE = (name) => `import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import LinearText from '../../components/primitives/LinearText';
import useLinearTheme from '../../hooks/useLinearTheme';

export interface ${name}Props extends ViewProps {
  title?: string;
}

export default function ${name}({ title = '${name}', style, ...rest }: ${name}Props) {
  const theme = useLinearTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        style,
      ]}
      {...rest}
    >
      <LinearText variant="label" style={styles.title}>
        {title}
      </LinearText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
});
`;

const TEST_TEMPLATE = (name) => `import React from 'react';
import { renderWithProviders } from '../../../test-utils/renderWrappers';
import ${name} from '../${name}';

describe('${name}', () => {
  it('renders correctly with default props', () => {
    const { getByText } = renderWithProviders(<${name} />);
    expect(getByText('${name}')).toBeTruthy();
  });

  it('renders correctly with custom title', () => {
    const { getByText } = renderWithProviders(<${name} title="Custom Title" />);
    expect(getByText('Custom Title')).toBeTruthy();
  });
});
`;

async function main() {
  console.log('--- Component Scaffolding Generator ---');
  
  let name = process.argv[2];
  if (!name) {
    name = await ask('Component Name (e.g., SettingsCard): ');
  }
  if (!name) {
    console.error('Name is required.');
    process.exit(1);
  }

  const pascalName = toPascalCase(name);
  const featureDir = await ask('Target Feature Directory under src/components (e.g., settings): ');
  
  if (!featureDir) {
    console.error('Feature directory is required.');
    process.exit(1);
  }

  const targetPath = path.join(process.cwd(), 'src', 'components', featureDir);
  const testPath = path.join(targetPath, '__tests__');

  // Ensure directories exist
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
  if (!fs.existsSync(testPath)) {
    fs.mkdirSync(testPath, { recursive: true });
  }

  const componentFile = path.join(targetPath, \`\${pascalName}.tsx\`);
  const testFile = path.join(testPath, \`\${pascalName}.unit.test.tsx\`);

  if (fs.existsSync(componentFile)) {
    console.error(\`\nError: Component \${pascalName}.tsx already exists in \${targetPath}\`);
    process.exit(1);
  }

  fs.writeFileSync(componentFile, COMPONENT_TEMPLATE(pascalName));
  console.log(\`✅ Created \${componentFile}\`);
  
  fs.writeFileSync(testFile, TEST_TEMPLATE(pascalName));
  console.log(\`✅ Created \${testFile}\`);
  
  // Optionally update barrel file (index.ts) if it exists in the folder
  const barrelFile = path.join(targetPath, 'index.ts');
  if (fs.existsSync(barrelFile)) {
    const exportLine = \`export { default as \${pascalName} } from './\${pascalName}';\n\`;
    fs.appendFileSync(barrelFile, exportLine);
    console.log(\`✅ Exported in \${barrelFile}\`);
  } else {
    console.log(\`ℹ️ No index.ts found in \${targetPath}. Skipping barrel export.\`);
  }

  rl.close();
}

main().catch(console.error);
