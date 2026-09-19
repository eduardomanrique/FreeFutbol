"""Package the compiled game only. Run npm run build first."""
from pathlib import Path
import datetime,hashlib,json,shutil,tarfile,tempfile
stage=Path(tempfile.mkdtemp(prefix='futebol-release-'))
product=stage/'product';product.mkdir()
shutil.copytree('dist',product/'dist')
for name in ('Dockerfile','nginx.conf','.dockerignore'):shutil.copy(name,product/name)
files=sorted(p for p in product.rglob('*') if p.is_file())
manifest=''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(product))+'\n' for p in files)
(product/'SHA256SUMS').write_text(manifest)
release=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')+'-'+hashlib.sha256(manifest.encode()).hexdigest()[:12]
(stage/'deploy').mkdir();shutil.copy('deploy/install-infra.py',stage/'deploy/install-infra.py');shutil.copytree('deploy/infra',stage/'deploy/infra')
archive=Path('/tmp')/f'futebol-{release}.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
 tar.add(product,arcname='product');tar.add(stage/'deploy',arcname='deploy')
Path('deploy/release.json').write_text(json.dumps({'release':release,'archive':str(archive),'url':'https://kmworks.dev/futebol/'},indent=2)+'\n')
print(release,archive,archive.stat().st_size)
