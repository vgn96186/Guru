import fs from 'fs';
import path from 'path';

describe('sqlite-vec bundling config', () => {
  it('enables withSQLiteVecExtension for expo-sqlite', () => {
    const appJsonPath = path.join(__dirname, '..', '..', 'app.json');
    const raw = fs.readFileSync(appJsonPath, 'utf8');
    const appJson = JSON.parse(raw) as any;
    const plugins: any[] = appJson?.expo?.plugins ?? [];

    const sqlitePlugin = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-sqlite');
    expect(sqlitePlugin).toBeTruthy();
    expect(sqlitePlugin[1]?.withSQLiteVecExtension).toBe(true);
  });
});
