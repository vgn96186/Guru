# Data Safety QA Checklist

Use this after changes to backup, restore, transcript saving, or lecture recovery.

## 1. Safe Syllabus Sync

Goal: verify syllabus sync does not wipe topic progress.

Steps:

1. Open a subject and mark at least one topic as studied.
2. Go to Syllabus.
3. Tap the sync button.
4. Confirm the dialog.
5. Return to the same topic.

Expected:

- Progress is still present.
- No streak, XP, or notes are reset.
- New vault topics may appear, but existing progress remains.

## 2. JSON Backup Export/Import

Goal: verify JSON backup restores full app data instead of partial data.

Setup:

1. Create at least one lecture note/transcript.
2. Complete at least one study session.
3. Add one brain dump.
4. Ensure daily log and topic progress exist.

Steps:

1. Open Settings -> Backup & Restore.
2. Export JSON backup.
3. Change some data locally:
   - mark another topic,
   - delete a transcript,
   - add a brain dump.
4. Import the JSON backup you just exported.
5. Re-open the affected screens.

Expected:

- Topic progress returns to backup state.
- Lecture notes/transcripts return.
- Sessions return.
- Brain dumps return.
- Daily logs return.
- Import either fully succeeds or keeps current data unchanged if it fails.

## 3. SQLite .db Import Safety

Goal: verify invalid DB files do not overwrite live data.

Steps:

1. Export a `.db` backup from Settings.
2. Try importing a non-database file renamed to `.db`.
3. Re-open the app and verify normal data is still present.
4. Then import a valid exported `.db` file.

Expected:

- Invalid file is rejected.
- Existing app data remains intact after rejected import.
- Valid `.db` import succeeds and app data remains readable after restart.

## 4. Transcript Delete Confirmation

Goal: prevent accidental transcript deletion.

Steps:

1. Open Transcript History.
2. Open any saved transcript.
3. Tap delete.
4. Cancel once.
5. Confirm delete on second attempt.

Expected:

- Cancel keeps the transcript.
- Confirm removes only that transcript.

## 5. Failed Transcription Recovery

Goal: verify recordings are preserved and retried after failure.

Setup:

1. Start a lecture recording flow from Home.
2. Return to Guru with a valid recording.

Failure path:

1. Remove/disable the transcription engine:
   - clear Groq key, or
   - disable local Whisper path.
2. Let transcription fail in the return sheet.
3. Dismiss the sheet.
4. Re-enable Groq or local Whisper.
5. Background and foreground the app, or relaunch it.

Expected:

- Recording is not deleted on failure.
- Session remains recoverable.
- App retries pending transcription automatically.
- On success, transcript/note is saved and audio can be deleted safely.

## 6. Crash Window Around Save

Goal: verify a transcribed-but-not-saved session is still recoverable.

Steps:

1. Return from a lecture and wait until transcription results appear.
2. Before tapping "Mark as Studied" or "Save & Done", kill the app.
3. Relaunch the app.

Expected:

- Session is retried because it is still marked recoverable.
- Transcript/note can still be completed after relaunch.

## 7. Regression Check

Run:

```sh
npx tsc --noEmit
```

Expected:

- No TypeScript errors.
