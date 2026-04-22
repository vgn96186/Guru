# G4F Proxy — One-Time Deploy

Deploys a public HTTPS OpenAI-compatible G4F proxy on Fly.io. Free-tier
covers personal use. Auto-sleeps when idle (~10 s cold start on wake).

## Steps (first time only)

```bash
# 1. Install flyctl
brew install flyctl

# 2. Sign up or log in
flyctl auth signup      # or: flyctl auth login

# 3. Pick a unique app name — edit deploy/g4f/fly.toml line 4
#    Replace "guru-g4f-CHANGEME" with e.g. "guru-g4f-vishnu"

# 4. Deploy (from repo root)
cd deploy/g4f
flyctl launch --copy-config --no-deploy   # answer "Yes" to use existing config
flyctl deploy

# 5. Note the URL — will look like:
#    https://guru-g4f-vishnu.fly.dev

# 6. Add to project .env (repo root):
echo 'EXPO_PUBLIC_G4F_URL=https://guru-g4f-vishnu.fly.dev/v1/chat/completions' >> ../../.env

# 7. Rebuild the app
cd ../..
npm run build:android:release    # or whatever your release build cmd is
```

## After deploy

App reads `EXPO_PUBLIC_G4F_URL` at build time. `createG4FModel()` picks it
up automatically. No code edits per machine.

To redeploy after upstream G4F image updates:

```bash
cd deploy/g4f && flyctl deploy
```

To tear down:

```bash
flyctl apps destroy guru-g4f-vishnu
```

## Optional — add an API key

Edit `fly.toml` → set `G4F_API_KEY = "somesecret"`, redeploy. Then pass
the key when building the model:

```ts
createG4FModel({ apiKey: 'somesecret' });
```
