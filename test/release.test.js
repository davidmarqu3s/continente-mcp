import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease } from '../scripts/check-release.js';
const pkg = {name:'continente-mcp',version:'4.0.0-rc.1'};
const lock = {name:pkg.name,version:pkg.version,packages:{'':pkg}};
const changelog = '## 4.0.0-rc.1\n\nCandidate changes.\n\n## 3.1.0\n\nOld release.';
test('release candidate stays on next and uses its own notes', () => {
 assert.deepEqual(checkRelease(pkg,lock,changelog,'v4.0.0-rc.1'),{version:'4.0.0-rc.1',distTag:'next',notes:'Candidate changes.'});
});
test('stable version uses latest', () => {
 const stable={name:pkg.name,version:'4.0.0'};
 assert.equal(checkRelease(stable,{...stable,packages:{'':stable}},'## 4.0.0\n\nStable.','v4.0.0').distTag,'latest');
});
test('mismatched tag, lockfile or missing release notes cannot publish', () => {
 assert.throws(()=>checkRelease(pkg,lock,changelog,'v3.2.0'),/tag/i);
 assert.throws(()=>checkRelease(pkg,{...lock,version:'3.2.0'},changelog,'v4.0.0-rc.1'),/lock/i);
 assert.throws(()=>checkRelease(pkg,{...lock,packages:{'':{...pkg,version:'3.2.0'}}},changelog),/lock/i);
 assert.throws(()=>checkRelease(pkg,lock,'## 3.1.0\nOld', 'v4.0.0-rc.1'),/notes/i);
});

test('Windows line endings preserve release notes', () => {
  assert.equal(checkRelease(pkg,lock,changelog.replaceAll('\n','\r\n'),'v4.0.0-rc.1').notes,'Candidate changes.');
});
