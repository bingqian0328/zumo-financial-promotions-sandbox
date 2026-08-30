# Zumo Financial Promotions sandbox launcher

A dependency-free Node.js reference app that creates a machine token server-side, generates a PKCE verifier/challenge pair, obtains a short-lived authorization code for an existing sandbox user, and launches Zumo's hosted Financial Promotions flow.

The launcher can also create a generated `Sandbox Tester` user through `POST /v1/users`. The generated user uses a unique `example.com` email and is intended only for sandbox testing.

## Run

1. Copy `.env.example` to `.env` and add the Zumo sandbox credentials.
2. Use Node.js 18 or newer.
3. Run `npm start`. In Codex Desktop's bundled runtime, use:

   ```sh
   /Users/bingqian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
   ```
4. Open `http://127.0.0.1:3000` and enter an existing Zumo sandbox user UUID.

The client secret is never returned to the browser. `.env` is excluded by `.gitignore`.

## Flow

`POST /api/launch` obtains an app access token from `/v1/auth/token`, posts the user's PKCE challenge to `/v1/auth/authorize`, and returns a URL containing `authCode`, `codeVerifier`, `organisationId`, and `userId`. The authorization code is single-use and expires after five minutes.

The hosted sandbox must be launched at `/financial-promotions/`. Zumo's frontend router uses that base path; loading the domain root results in an empty page even though its JavaScript bundle downloads.
