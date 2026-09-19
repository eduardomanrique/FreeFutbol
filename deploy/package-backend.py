"""Prepare a versioned backend archive locally. Does not deploy or change release.json."""
from pathlib import Path
import datetime
import hashlib
import shutil
import tarfile
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="futebol-backend-") as temporary:
    stage = Path(temporary)
    for name in ("package.json", "package-lock.json"):
        shutil.copy(root / name, stage / name)
    for name in ("src", "shared", "server"):
        shutil.copytree(root / name, stage / name)
    manifest = "".join(hashlib.sha256(p.read_bytes()).hexdigest() + "  " + str(p.relative_to(stage)) + "\n"
                       for p in sorted(stage.rglob("*")) if p.is_file())
    (stage / "SHA256SUMS").write_text(manifest)
    release = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d") + "-" + hashlib.sha256(manifest.encode()).hexdigest()[:12]
    archive = Path(tempfile.gettempdir()) / f"futebol-backend-{release}.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(stage, arcname="backend")
    print(release, archive, archive.stat().st_size)
