# CAMPO 26 — Futebol

Public URL: https://kmworks.dev/futebol/ (also www). Exact path redirects to trailing slash.

Currently deployed: static Three.js/WebGL2 and Rapier/WASM game. Nginx non-root, port8080 internal only, proxy network, read-only filesystem, tmpfs32MiB, no capabilities,96MiB RAM,.25CPU,64PIDs. TLS/headers/compression use existing Traefik. No database, environment secrets, persistent volume or multiplayer server. Settings and controller profiles stay in browser localStorage.

Product build stays outside infra at `/opt/futebol/releases/<release-id>`; `/opt/futebol/current` is the active build context. Product workspace: `/Users/eduardokmanrique/Work/games/futebol`. Build locally using `npm ci && npm run build`; upload only dist, Dockerfile, nginx.conf and SHA256SUMS. Source animation database and tests are not published.

## Deploy

Use versioned release bundle and `deploy/activate-vps.sh <release-id>` from product workspace. Registration installer adds only this app and domain row, with pre-deployment backups. Scoped command:

```sh
sudo docker compose -f /opt/kmworks-infra/apps/futebol/docker-compose.yml -p kmworks-infra up -d --build --no-deps futebol
curl -fsS https://kmworks.dev/futebol/healthz
```

## Rollback

Point `/opt/futebol/current` at a previous release and run the scoped command. Immutable image tags use release ids. Never use `down` on the shared project. Existing services must retain their container IDs.

## Backend overlay (prepared, not deployed)

The local project now includes an authoritative Node/Rapier backend. `docker-compose.backend.yml` is an opt-in overlay with a separate build context and a higher-priority `/futebol/api/` route. The existing frontend activation script does not activate this service. See the product documentation `docs/backend.md` for packaging, configuration, protocol compatibility and rollout requirements. Applying the overlay requires an explicit deployment request.
