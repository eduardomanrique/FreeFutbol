#!/usr/bin/env bash
# Scoped frontend/backend rollout. Run on the VPS after uploading both archives.
set -euo pipefail
front="${1:?frontend release required}"; back="${2:?backend release required}"
for release in "$front" "$back"; do
  [[ "$release" =~ ^[0-9]{8}-[a-f0-9]{12}$ ]] || exit 2
done
infra=/opt/kmworks-infra
product=/opt/futebol
stage=$(mktemp -d /tmp/futebol-stack.XXXXXX)
backup="$product/deploy-backups/stack-$front"
tar --no-same-owner -xzf "/tmp/futebol-$front.tar.gz" -C "$stage"
tar --no-same-owner -xzf "/tmp/futebol-backend-$back.tar.gz" -C "$stage"
(cd "$stage/product" && sha256sum -c SHA256SUMS >/dev/null)
(cd "$stage/backend" && sha256sum -c SHA256SUMS >/dev/null)
sudo -n install -d "$product/releases/$front" "$product/backend-releases/$back" "$backup"
sudo -n cp -a "$stage/product/." "$product/releases/$front/"
sudo -n cp -a "$stage/backend/." "$product/backend-releases/$back/"
sudo -n cp -a "$infra/apps/futebol" "$backup/app"
sudo -n cp "$infra/docker-compose.yml" "$backup/root-compose.yml"
readlink "$product/current" > "$stage/previous-front"
readlink "$product/backend-current" > "$stage/previous-back" || true
sudo -n docker ps --format '{{.Names}} {{.ID}}' > "$stage/containers-before"
sudo -n cp "$stage/previous-front" "$stage/previous-back" "$stage/containers-before" "$backup/"
for name in docker-compose.yml docker-compose.backend.yml README.md; do
  sudo -n cp "$stage/deploy/infra/apps/futebol/$name" "$infra/apps/futebol/$name"
done
sudo -n python3 - "$infra/docker-compose.yml" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
if '\n  futebol-backend:\n' not in s:
    assert 'services:\n' in s and 'name: kmworks-infra' in s
    s=s.replace('services:\n','services:\n  futebol-backend:\n    extends:\n      file: apps/futebol/docker-compose.backend.yml\n      service: futebol-backend\n\n',1)
    p.write_text(s)
PY
compose=(sudo -n docker compose -f "$infra/apps/futebol/docker-compose.yml" -f "$infra/apps/futebol/docker-compose.backend.yml" -p kmworks-infra)
# Build directly from verified releases before changing either running service.
export FUTEBOL_ROOT="$product/releases/$front" FUTEBOL_BACKEND_ROOT="$product/backend-releases/$back"
export FUTEBOL_IMAGE="kmworks/futebol:$front" FUTEBOL_BACKEND_IMAGE="kmworks/futebol-backend:$back"
compose=(sudo -n env "FUTEBOL_ROOT=$FUTEBOL_ROOT" "FUTEBOL_BACKEND_ROOT=$FUTEBOL_BACKEND_ROOT" "FUTEBOL_IMAGE=$FUTEBOL_IMAGE" "FUTEBOL_BACKEND_IMAGE=$FUTEBOL_BACKEND_IMAGE" docker compose -f "$infra/apps/futebol/docker-compose.yml" -f "$infra/apps/futebol/docker-compose.backend.yml" -p kmworks-infra)
"${compose[@]}" config --quiet
"${compose[@]}" --progress plain build futebol futebol-backend
sudo -n docker image tag "$FUTEBOL_IMAGE" kmworks/futebol:local
sudo -n docker image tag "$FUTEBOL_BACKEND_IMAGE" kmworks/futebol-backend:local
sudo -n ln -sfn "releases/$front" "$product/current"
sudo -n ln -sfn "backend-releases/$back" "$product/backend-current"
"${compose[@]}" up -d --no-deps futebol futebol-backend
for service in futebol futebol-backend; do
  container=$("${compose[@]}" ps -q "$service")
  for attempt in $(seq 1 60); do
    health=$(sudo -n docker inspect --format '{{.State.Health.Status}}' "$container")
    [[ "$health" == healthy ]] && break
    if [[ "$health" == unhealthy ]]; then sudo -n docker logs --tail 30 "$container"; exit 1; fi
    sleep 1
  done
  [[ "$health" == healthy ]] || { echo "$service unhealthy; backup=$backup"; exit 1; }
done
while read -r name before; do
  [[ "$name" == kmworks-infra-futebol-1 || "$name" == kmworks-infra-futebol-backend-1 ]] && continue
  now=$(sudo -n docker inspect --format '{{.Id}}' "$name")
  [[ "$now" == "$before"* ]] || { echo "Unexpected replacement: $name"; exit 1; }
done < "$stage/containers-before"
"${compose[@]}" ps
printf 'DEPLOY_OK frontend=%s backend=%s backup=%s\n' "$front" "$back" "$backup"
