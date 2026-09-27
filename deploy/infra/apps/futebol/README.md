# CAMPO 26 — Futebol

Public URL: https://kmworks.dev/futebol/ (also www). Exact path redirects to trailing slash.

Currently deployed: Three.js/WebGL2 and Rapier/WASM frontend plus Node backend (protocol2). Release `20260927-cf1469562495` / `20260927-951d5e4e9136`, source commit `b32e14f`. Includes natural dribbling across speeds, turn and ball recovery fixes, animation freeze correction, defensive posture, athlete refinements and game audio. Existing container resource and isolation settings are unchanged.

Released 2026-09-27. Frontend and backend containers healthy; protocol2; zero rooms/matches before rollout; unrelated container IDs preserved. Public HTML matches the local production build byte-for-byte. Public browser smoke passed with no errors. Backup: `/opt/futebol/deploy-backups/stack-20260927-cf1469562495`. Previous frontend/backend: `20260926-c864e802bacc` / `20260926-1c1326482e91`.

Product build stays outside infra at `/opt/futebol/releases/<release-id>`; `/opt/futebol/current` is the active build context. Product workspace: `/Users/eduardokmanrique/Work/games/futebol`. Build locally using `npm ci && npm run build`; upload only dist, Dockerfile, nginx.conf and SHA256SUMS. Source animation database and tests are not published.

## Deploy

Package the frontend and backend with `deploy/package-release.py` and `deploy/package-backend.py`, then use `deploy/activate-stack.sh <frontend-id> <backend-id>` for a coordinated rollout. It backs up the current descriptors and release links, and updates only futebol and futebol-backend. Use the older frontend-only `activate-vps.sh` only when the backend protocol remains compatible.

```sh
sudo docker compose -f /opt/kmworks-infra/apps/futebol/docker-compose.yml -p kmworks-infra up -d --build --no-deps futebol
curl -fsS https://kmworks.dev/futebol/healthz
```

## Rollback

Point `/opt/futebol/current` at a previous release and run the scoped command. Immutable image tags use release ids. Never use `down` on the shared project. Existing services must retain their container IDs.

## Backend overlay (deployed 2026-09-19)

The published stack includes an authoritative Node/Rapier backend, using768MiB and1CPU, with8 rooms and2 simultaneous matches. `docker-compose.backend.yml` is an opt-in overlay with a separate build context and a higher-priority `/futebol/api/` route. The existing frontend activation script does not activate this service. See the product documentation `docs/backend.md` for packaging, configuration, protocol compatibility and rollout requirements. Applying the overlay requires an explicit deployment request.

## Joint frontend/backend rollout

`deploy/activate-stack.sh <frontend-id> <backend-id>` extracts both uploaded `/tmp/futebol-*.tar.gz` archives, checks SHA256 manifests, backs up the current descriptors and release links, builds both immutable release images and updates only futebol/futebol-backend. Requires administrative write access to `/opt/futebol` and `/opt/kmworks-infra/apps/futebol`. It verifies both container health checks and preserves unrelated container IDs. Never deploy the shared stack with `down`.

For rollback, restore the saved app descriptors/root registration and previous release links from `/opt/futebol/deploy-backups/stack-<frontend-id>`, then deploy only these services with the previous immutable images. If rolling back the first backend deployment, stop/remove only futebol-backend. Backend replacement ends its in-memory matches.
