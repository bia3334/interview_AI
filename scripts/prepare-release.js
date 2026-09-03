const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runGit(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function parseSemver(str) {
  const clean = str.replace(/^v/, '').trim();
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: `${match[1]}.${match[2]}.${match[3]}`
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function bumpSemver(ver, type) {
  if (type === 'major') {
    return `${ver.major + 1}.0.0`;
  }
  if (type === 'minor') {
    return `${ver.major}.${ver.minor + 1}.0`;
  }
  return `${ver.major}.${ver.minor}.${ver.patch + 1}`;
}

function detectBumpTypeFromCommit(commitMsg, defaultType = 'patch') {
  if (!commitMsg) return defaultType;
  if (/\[major\]|BREAKING CHANGE:/i.test(commitMsg)) return 'major';
  if (/\[minor\]|^feat(\(.*\))?:/i.test(commitMsg)) return 'minor';
  return defaultType;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const manualVersion = (process.env.MANUAL_VERSION || '').trim();
  const manualBumpType = (process.env.BUMP_TYPE || '').trim();
  const refName = (process.env.GITHUB_REF_NAME || '').trim();
  const refType = (process.env.GITHUB_REF_TYPE || '').trim();

  const latestCommit = runGit('git log -1 --pretty=%B');
  const githubOutput = process.env.GITHUB_OUTPUT;

  // Check for [skip release] unless manually triggered or tag push
  if (!manualVersion && refType !== 'tag' && /\[skip release\]/i.test(latestCommit)) {
    console.log('Found [skip release] in commit message. Skipping release.');
    if (githubOutput) {
      fs.appendFileSync(githubOutput, `skip=true\n`);
    }
    return;
  }

  let targetVersion = '';

  // 1. Manual version provided
  if (manualVersion) {
    const parsed = parseSemver(manualVersion);
    if (!parsed) {
      console.error(`Invalid manual version format: ${manualVersion}. Expected X.Y.Z or vX.Y.Z`);
      process.exit(1);
    }
    targetVersion = parsed.raw;
    console.log(`Using manually specified version: ${targetVersion}`);
  }
  // 2. Triggered by a tag push (e.g. v1.2.3)
  else if (refType === 'tag' && refName.startsWith('v')) {
    const parsed = parseSemver(refName);
    if (parsed) {
      targetVersion = parsed.raw;
      console.log(`Using version from git tag: ${targetVersion}`);
    }
  }

  // 3. Automated determination (e.g. merge into main)
  if (!targetVersion) {
    // Fetch latest tags if in git repo
    runGit('git fetch --tags --force');
    const rawTags = runGit('git tag -l "v*"').split('\n').filter(Boolean);
    const semverTags = rawTags
      .map(t => parseSemver(t))
      .filter(Boolean)
      .sort(compareSemver);

    const highestTag = semverTags.length > 0 ? semverTags[semverTags.length - 1] : null;
    const pkgVer = parseSemver(pkg.version) || { major: 1, minor: 0, patch: 0, raw: '1.0.0' };

    console.log(`Package version in package.json: ${pkgVer.raw}`);
    if (highestTag) {
      console.log(`Highest existing git tag: v${highestTag.raw}`);
    } else {
      console.log('No existing semver tags found.');
    }

    if (!highestTag || compareSemver(pkgVer, highestTag) > 0) {
      // package.json was explicitly bumped in the PR/commit
      targetVersion = pkgVer.raw;
      console.log(`package.json version (${targetVersion}) is newer than latest tag. Using it.`);
    } else {
      // Auto-bump from highest tag
      const latestCommit = runGit('git log -1 --pretty=%B');
      const bumpType = manualBumpType || detectBumpTypeFromCommit(latestCommit, 'patch');
      targetVersion = bumpSemver(highestTag, bumpType);
      console.log(`Auto-bumping (${bumpType}) from v${highestTag.raw} -> ${targetVersion}`);
    }
  }

  const tag = `v${targetVersion}`;
  const releaseName = `Screen Genius ${tag}`;

  console.log('--- Release Summary ---');
  console.log(`Version:      ${targetVersion}`);
  console.log(`Tag:          ${tag}`);
  console.log(`Release Name: ${releaseName}`);

  // Write to GitHub Actions outputs if available
  if (githubOutput) {
    fs.appendFileSync(githubOutput, `skip=false\n`);
    fs.appendFileSync(githubOutput, `version=${targetVersion}\n`);
    fs.appendFileSync(githubOutput, `tag=${tag}\n`);
    fs.appendFileSync(githubOutput, `release_name=${releaseName}\n`);
  }
}

main();
