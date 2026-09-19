#!/usr/bin/env bash
set -euo pipefail
release="${1:?release id required}"
[[ "$release" =~ ^[0-9]{8}-[a-f0-9]{12}$ ]] || { echo 'Invalid release id' >&2; exit 1; }
infra=/opt/kmworks-infra
product=/opt/futebol
app_compose="$infra/apps/futebol/docker-compose.yml"
stage="$(mktemp -d /tmp/futebol-stage.XXXXXX)"
tar --no-same-owner -xzf "/tmp/futebol-$release.tar.gz" -C "$stage"
sudo -n install -d -m 0755 "$product/releases/$release" "$product/deploy-backups/$release"
sudo -n cp -a "$stage/product/." "$product/releases/$release/"
(cd "$product/releases/$release" && sha256sum -c SHA256SUMS)
sudo -n cp "$infra/docker-compose.yml" "$product/deploy-backups/$release/docker-compose.yml.before"
sudo -n cp "$infra/docs/domains.md" "$product/deploy-backups/$release/domains.md.before"
sudo -n docker ps --format '{{.Names}} {{.ID}}' > "$stage/containers-before.txt"
sudo -n cp "$stage/containers-before.txt" "$product/deploy-backups/$release/containers-before.txt"
sudo -n python3 "$stage/deploy/install-infra.py" "$infra"
sudo -n ln -sfn "releases/$release" "$product/current"
sudo -n docker compose -f "$app_compose" -p kmworks-infra config --quiet
sudo -n docker compose -f "$app_compose" -p kmworks-infra build futebol
sudo -n docker image tag kmworks/futebol:local "kmworks/futebol:$release"
sudo -n docker compose -f "$app_compose" -p kmworks-infra up -d --no-deps futebol
container="$(sudo -n docker compose -f "$app_compose" -p kmworks-infra ps -q futebol)"
for attempt in $(seq 1 40); do
  status="$(sudo -n docker inspect --format '{{.State.Health.Status}}' "$container")"
  if [[ "$status" == healthy ]]; then break; fi
  if [[ "$status" == unhealthy ]]; then
    sudo -n docker logs --tail 30 "$container"
    exit 1
  fi
  sleep 1
done
[[ "$status" == healthy ]] || { echo 'Healthcheck timed out' >&2; exit 1; }
sudo -n docker compose -f "$app_compose" -p kmworks-infra ps
sudo -n docker exec "$container" wget -q -O - http://127.0.0.1:8080/healthz
while read -r name before; do
  [[ "$name" == kmworks-infra-futebol-1 ]] && continue
  now="$(sudo -n docker inspect --format '{{.Id}}' "$name")"
  [[ "$now" == "$before"* ]] || { echo "Unexpected container replacement: $name" >&2; exit 1; }
done < "$stage/containers-before.txt"
printf 'DEPLOY_OK release=%s; existing containers preserved\n' "$release"
