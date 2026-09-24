"""Package the compiled game without duplicating its potentially large assets."""
from pathlib import Path
import datetime
import hashlib
import io
import json
import tarfile
import tempfile

root = Path(__file__).resolve().parents[1]
product_files = sorted(
    path for path in (root / "dist").rglob("*") if path.is_file()
)
product_files += [root / name for name in ("Dockerfile", "nginx.conf", ".dockerignore")]
manifest = "".join(
    hashlib.sha256(path.read_bytes()).hexdigest()
    + "  "
    + str(Path("dist") / path.relative_to(root / "dist"))
    + "\n"
    for path in product_files
    if path.is_relative_to(root / "dist")
)
manifest += "".join(
    hashlib.sha256(path.read_bytes()).hexdigest() + "  " + path.name + "\n"
    for path in product_files
    if not path.is_relative_to(root / "dist")
)
release = (
    datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    + "-"
    + hashlib.sha256(manifest.encode()).hexdigest()[:12]
)
archive = Path(tempfile.gettempdir()) / f"futebol-{release}.tar.gz"

with tarfile.open(archive, "w:gz") as tar:
    for path in product_files:
        relative = (
            Path("dist") / path.relative_to(root / "dist")
            if path.is_relative_to(root / "dist")
            else Path(path.name)
        )
        tar.add(path, arcname=str(Path("product") / relative))
    manifest_info = tarfile.TarInfo("product/SHA256SUMS")
    manifest_info.size = len(manifest.encode())
    tar.addfile(manifest_info, io.BytesIO(manifest.encode()))
    tar.add(root / "deploy/install-infra.py", arcname="deploy/install-infra.py")
    tar.add(root / "deploy/infra", arcname="deploy/infra")

Path(root / "deploy/release.json").write_text(
    json.dumps({"release": release, "archive": str(archive), "url": "https://kmworks.dev/futebol/"}, indent=2) + "\n"
)
print(release, archive, archive.stat().st_size)
