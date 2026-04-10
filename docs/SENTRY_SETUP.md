# Sentry Setup

Guru includes Sentry wiring, but it only sends events when `EXPO_PUBLIC_SENTRY_DSN` is set.

## Enable It

1. Create a React Native project in Sentry.
2. Copy the DSN.
3. Set `EXPO_PUBLIC_SENTRY_DSN` in the build environment used for the app.

Example:

```bash
EXPO_PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
```

## Notes

- The DSN is not a secret. Using `EXPO_PUBLIC_` is expected here.
- Without the DSN, the app still runs, but crash/error/navigation telemetry is disabled.
- After adding the DSN, ship a new build or update so the runtime picks it up.
