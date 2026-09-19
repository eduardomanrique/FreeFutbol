"""Add only the game's deployment descriptor and registration to an infra checkout."""
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
source = Path(__file__).resolve().parent / 'infra' / 'apps' / 'futebol'
compose = root / 'docker-compose.yml'
text = compose.read_text()
if 'name: kmworks-infra' not in text or 'services:\n' not in text:
    raise SystemExit('Unexpected infrastructure Compose file; refusing to modify it.')
target = root / 'apps' / 'futebol'
target.mkdir(parents=True, exist_ok=True)
for filename in ('docker-compose.yml', 'README.md'):
    destination = target / filename
    payload = (source / filename).read_bytes()
    if destination.exists() and destination.read_bytes() != payload:
        raise SystemExit(f'{destination} already has different content; inspect before updating.')
    destination.write_bytes(payload)
if '\n  futebol:\n' not in text:
    block = '  futebol:\n    extends:\n      file: apps/futebol/docker-compose.yml\n      service: futebol\n\n'
    compose.write_text(text.replace('services:\n', 'services:\n' + block, 1))
domains = root / 'docs' / 'domains.md'
text = domains.read_text()
if '`kmworks.dev/futebol/`' not in text:
    row = '| `kmworks.dev/futebol/` | `futebol` | active | CAMPO 26; 3D football, browser-local settings; also available on www |\n'
    marker = '| --- | --- | --- | --- |\n'
    if marker not in text:
        raise SystemExit('Unexpected domain table; inspect before updating.')
    domains.write_text(text.replace(marker, marker + row, 1))
history = root / 'history' / '2026-09-17-001-futebol.md'
if not history.exists():
    history.write_text('''# CAMPO 26 deployment

User requested publishing the game on the existing KMWorks VPS.

- Public route: https://kmworks.dev/futebol/ (www alias).
- Followed the documented shared-domain/subpath routing model, so no DNS change was needed.
- Product source remains outside infrastructure at /opt/futebol/releases/<release-id>, with a current symlink used by the Docker build.
- Only an compiled static product release is uploaded; no tests, archive, secrets or development server are published.
- Added a dedicated non-root, read-only Nginx container on proxy, port 8080 internal only, with a healthcheck and resource limits.
- Nginx base is pinned to the digest already present on the VPS.
- TLS, compression and headers reuse the existing Traefik configuration. A trailing-slash redirect preserves relative assets and query parameters.
- Root Compose registration and domain documentation were added incrementally; pre-existing server changes were preserved.
- Deploy only this service with the scoped Compose command in apps/futebol/README.md. Do not redeploy the whole stack.
- Product workspace is not a Git repository yet; source deployment uses explicit versioned release bundles rather than assuming a remote repository.
''')
print(f'Installed futebol deployment descriptors in {root}')
