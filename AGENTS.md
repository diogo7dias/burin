# burin

## UI lint

- Run lintapple before calling UI work done.
- Serve and lint: `python3 -m http.server 8000` in the repo root, then `npx -y lintapple http://localhost:8000/`.
- Policy: `ui-policy.json` holds it once created; until then lintapple uses its defaults. Never publish it (the repo root is served as static files).
