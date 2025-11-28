#!/usr/bin/env node

/**
 * Automatic version bumping script based on Conventional Commits
 *
 * Usage:
 *   node scripts/bump-version.js [major|minor|patch]
 *   npm run bump-version [major|minor|patch]
 *
 * If no argument provided, automatically determines bump type from git commits
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ Error: ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

/**
 * Get the latest git tag (cross-platform compatible)
 */
function getLatestTag() {
  try {
    // Get all tags sorted by version (descending)
    const tagsOutput = execSync('git tag --sort=-v:refname', { encoding: 'utf-8' }).trim();
    if (!tagsOutput) return null;

    // Filter for semantic version tags (v0.0.0 format)
    const tags = tagsOutput.split('\n');
    const semverRegex = /^v\d+\.\d+\.\d+$/;
    const latestTag = tags.find(tag => semverRegex.test(tag.trim()));

    return latestTag ? latestTag.trim() : null;
  } catch (err) {
    return null;
  }
}

/**
 * Analyze commits since last tag to determine bump type
 */
function analyzeCommits() {
  const latestTag = getLatestTag();
  const commitRange = latestTag ? `${latestTag}..HEAD` : 'HEAD';

  try {
    const commits = execSync(`git log ${commitRange} --pretty=format:"%s"`, { encoding: 'utf-8' }).trim();

    if (!commits) {
      warning('No new commits found since last tag');
      return null;
    }

    const commitLines = commits.split('\n');

    // Check for breaking changes
    const hasBreaking = commitLines.some(line =>
      line.includes('BREAKING CHANGE') || /^[a-z]+(\(.+\))?!:/.test(line)
    );

    if (hasBreaking) {
      info('Found BREAKING CHANGE commit(s)');
      return 'major';
    }

    // Check for features
    const hasFeature = commitLines.some(line =>
      /^feat(\(.+\))?:/.test(line)
    );

    if (hasFeature) {
      info('Found feat commit(s)');
      return 'minor';
    }

    // Check for fixes or performance improvements
    const hasFix = commitLines.some(line =>
      /^(fix|perf)(\(.+\))?:/.test(line)
    );

    if (hasFix) {
      info('Found fix/perf commit(s)');
      return 'patch';
    }

    // Only non-version-bumping commits (docs, style, refactor, test, chore, etc.)
    warning('No version-bumping commits found (only docs, style, refactor, test, chore, etc.)');
    return null;
  } catch (err) {
    error(`Failed to analyze commits: ${err.message}`);
  }
}

/**
 * Parse semantic version string
 */
function parseVersion(versionString) {
  const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    error(`Invalid version format: ${versionString}. Expected: MAJOR.MINOR.PATCH`);
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

/**
 * Bump version based on type
 */
function bumpVersion(currentVersion, bumpType) {
  const version = parseVersion(currentVersion);

  switch (bumpType) {
    case 'major':
      version.major += 1;
      version.minor = 0;
      version.patch = 0;
      break;
    case 'minor':
      version.minor += 1;
      version.patch = 0;
      break;
    case 'patch':
      version.patch += 1;
      break;
    default:
      error(`Invalid bump type: ${bumpType}. Use: major, minor, or patch`);
  }

  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Update package.json version
 */
function updatePackageJson(newVersion) {
  const packagePath = path.join(process.cwd(), 'package.json');

  if (!fs.existsSync(packagePath)) {
    error('package.json not found');
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const oldVersion = packageJson.version;

  packageJson.version = newVersion;

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

  success(`Updated package.json: ${oldVersion} → ${newVersion}`);
}

/**
 * Update plugin.json version
 */
function updatePluginJson(newVersion) {
  const pluginPath = path.join(process.cwd(), 'plugin.json');

  if (!fs.existsSync(pluginPath)) {
    error('plugin.json not found');
  }

  const pluginJson = JSON.parse(fs.readFileSync(pluginPath, 'utf-8'));
  const oldVersion = pluginJson.version;

  pluginJson.version = newVersion;

  fs.writeFileSync(pluginPath, JSON.stringify(pluginJson, null, 2) + '\n');

  success(`Updated plugin.json: ${oldVersion} → ${newVersion}`);
}

/**
 * Verify git repository is clean
 */
function verifyCleanRepo() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();

    if (status) {
      warning('Working directory has uncommitted changes:');
      console.log(status);
      console.log('');
      warning('It is recommended to commit or stash changes before bumping version.');
      console.log('');
    }
  } catch (err) {
    error(`Failed to check git status: ${err.message}`);
  }
}

/**
 * Main function
 */
function main() {
  log('═══════════════════════════════════════════', 'cyan');
  log('   SiYuan Plugin Version Bump Script', 'cyan');
  log('═══════════════════════════════════════════', 'cyan');
  console.log('');

  // Verify git repository
  verifyCleanRepo();

  // Read current version from package.json
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const currentVersion = packageJson.version;

  info(`Current version: ${currentVersion}`);
  console.log('');

  // Determine bump type
  let bumpType = process.argv[2];

  if (!bumpType) {
    info('No bump type specified, analyzing commits...');
    bumpType = analyzeCommits();

    if (!bumpType) {
      warning('No version bump needed. Exiting.');
      process.exit(0);
    }
  } else {
    // Validate bump type argument
    if (!['major', 'minor', 'patch'].includes(bumpType)) {
      error(`Invalid bump type: ${bumpType}. Use: major, minor, or patch`);
    }
    info(`Using specified bump type: ${bumpType}`);
  }

  // Calculate new version
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log('');
  log('─────────────────────────────────────────', 'cyan');
  log(`  ${currentVersion} → ${newVersion} (${bumpType.toUpperCase()})`, 'bright');
  log('─────────────────────────────────────────', 'cyan');
  console.log('');

  // Update version files
  updatePackageJson(newVersion);
  updatePluginJson(newVersion);

  console.log('');
  log('═══════════════════════════════════════════', 'green');
  log('   Version Bump Complete!', 'green');
  log('═══════════════════════════════════════════', 'green');
  console.log('');

  info('Next steps:');
  console.log('  1. Review changes: git diff package.json plugin.json');
  console.log('  2. Commit changes: git add package.json plugin.json');
  console.log(`  3. Commit: git commit -m "chore: bump version to ${newVersion}"`);
  console.log(`  4. Create tag: git tag v${newVersion}`);
  console.log('  5. Push: git push origin main --tags');
  console.log('');
  info('Or use the automated release script:');
  console.log('  npm run release');
  console.log('');
}

// Run script
try {
  main();
} catch (err) {
  error(`Unexpected error: ${err.message}`);
}
