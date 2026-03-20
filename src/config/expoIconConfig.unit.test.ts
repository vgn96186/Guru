import fs from 'fs';
import path from 'path';

describe('Expo Android icon configuration', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appJsonPath = path.join(projectRoot, 'app.json');
  const workflowPath = path.join(projectRoot, '.github/workflows/build-apk.yml');

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY = 'test-groq-key';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY;
  });

  it('uses the dedicated lighthouse adaptive icon asset for Android', () => {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    // Load the resolved Expo config to ensure app.config.js preserves the icon path.
    const appConfig = require('../../app.config.js');

    expect(appJson.expo.icon).toBe('./assets/icon.png');
    expect(appJson.expo.android.adaptiveIcon.foregroundImage).toBe('./assets/adaptive-icon.png');
    expect(appConfig.icon).toBe('./assets/icon.png');
    expect(appConfig.android.adaptiveIcon.foregroundImage).toBe('./assets/adaptive-icon.png');
  });

  it('does not ignore icon asset changes in the Android APK workflow', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).not.toContain("- 'assets/**'");
    expect(workflow).toContain('npx expo prebuild --platform android --clean');
  });
});
