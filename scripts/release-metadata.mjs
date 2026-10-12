import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function writeReleaseMetadata({ rootDir, outputDir, releaseName }) {
  const git = args => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
  const changedPaths = git(['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean);
  const metadata = {
    formatVersion: 1, releaseName, builtAt: new Date().toISOString(),
    gitCommit: git(['rev-parse', 'HEAD']), gitBranch: git(['branch', '--show-current']),
    dirty: changedPaths.length > 0, changedPaths,
  };
  fs.writeFileSync(path.join(outputDir, 'release.json'), JSON.stringify(metadata, null, 2) + '\n');
  return metadata;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [rootDir, outputDir, releaseName] = process.argv.slice(2);
  console.log(JSON.stringify(writeReleaseMetadata({ rootDir, outputDir, releaseName })));
}
