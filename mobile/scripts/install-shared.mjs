// Mobile CI uses a dependency snapshot without imposing a root lockfile on PWA releases.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../..', import.meta.url));
const target = resolve(root,'package-lock.json');
const snapshot = await readFile(resolve(root,'mobile/locks/shared-package-lock.json'));
const pkg = JSON.parse(await readFile(resolve(root,'package.json')));
const locked = JSON.parse(snapshot).packages[''];
if (JSON.stringify(pkg.dependencies) !== JSON.stringify(locked.dependencies) || JSON.stringify(pkg.devDependencies) !== JSON.stringify(locked.devDependencies)) throw new Error('Shared dependency snapshot is stale. Review and regenerate it before building mobile.');
// wx refuses to overwrite a developer's existing lockfile.
await writeFile(target,snapshot,{flag:'wx'});
try {
  const result=spawnSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:root,stdio:'inherit'});
  if (result.error || result.status !== 0) throw new Error('Shared mobile dependency installation failed.');
} finally { await unlink(target); }
