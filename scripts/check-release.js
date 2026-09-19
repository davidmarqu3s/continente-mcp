import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkRelease(pkg, lock, changelog, tag) {
  const version = pkg.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid release version');
  if (tag && tag !== `v${version}`) throw new Error('Git tag must match package.json version');
  if (lock.version !== version || lock.packages?.['']?.version !== version) throw new Error('Lockfile version must match package.json');
  const sections = changelog.replace(/\r\n/g, '\n').split(/^## /m);
  const section = sections.find(section => {
    const heading = section.split('\n', 1)[0];
    return heading === version || heading.startsWith(`[${version}](`);
  });
  const notes = section?.split('\n').slice(1).join('\n').trim();
  if (!notes) throw new Error('Add release notes to CHANGELOG.md for this version');
  return { version, distTag: version.includes('-') ? 'next' : 'latest', notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkRelease(
    JSON.parse(readFileSync('package.json', 'utf8')),
    JSON.parse(readFileSync('package-lock.json', 'utf8')),
    readFileSync('CHANGELOG.md', 'utf8'), process.argv[2]
  );
  console.log(`Release ${result.version}; npm channel: ${result.distTag}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\ndist-tag=${result.distTag}\n`);
    writeFileSync('release-notes.md', result.notes);
  }
}
