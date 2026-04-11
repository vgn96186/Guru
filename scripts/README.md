# Scripts

## Active Scripts

| Script                  | Purpose                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `force_seed.ts`         | Force-reseeds the database by calling `initDatabase(true)`. Run with `npx ts-node scripts/force_seed.ts`.                                 |
| `generateStaticSeed.js` | Generates `guru_seed.json` from syllabus constants. Used for backup/export templates.                                                     |
| `adb-reverse.js`        | Reverses Metro's port `8081` to the connected Android device. Run with `npm run adb:reverse`.                                             |
| `android-dev.js`        | Development workflow: starts Metro with cleared cache and launches the app on a connected Android device. Run with `npm run android:dev`. |

## Deprecated: `scripts/archive/`

The `archive/` folder contains **deprecated regex-based patch scripts**. These were one-time migrations that modified source files (App.tsx, RootNavigator.tsx, aiService.ts, schema.ts, etc.) via string replacement.

**All their changes are already in source.** The source code is the canonical state. Do not run these scripts.

- **Do not reintroduce patch scripts.** Add features directly to source files.
- See `ARCHIVE_MANIFEST.md` for the full inventory and verification that each feature exists in source.
