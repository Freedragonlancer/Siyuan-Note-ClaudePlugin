#!/usr/bin/env node

/**
 * Automated release script for SiYuan Plugin
 *
 * Features:
 * - Automatically determines version bump type from git commits
 * - Updates package.json and plugin.json
 * - Creates git commit and tag
 * - Pushes to remote repository
 * - Triggers GitHub Actions workflow
 *
 * Usage:
 *   npm run release          # Auto-detect bump type
 *   npm run release patch    # Force patch bump
 *   npm run release minor    # Force minor bump
 *   npm run release major    # Force major bump
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
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
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

function step(message) {
  log(`\n▶ ${message}`, 'cyan');
}

/**
 * Execute shell command and return output
 */
function exec(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    // When stdio is 'inherit', execSync returns null
    return result ? result.trim() : '';
  } catch (err) {
    if (!options.ignoreError) {
      error(`Command failed: ${command}\n${err.message}`);
    }
    return null;
  }
}

/**
 * Get current version from package.json
 */
function getCurrentVersion() {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  return packageJson.version;
}

/**
 * Verify git repository status
 */
function verifyGitStatus() {
  step('Checking git repository status...');

  // Check if we're in a git repository
  const isGitRepo = exec('git rev-parse --git-dir', { silent: true, ignoreError: true });
  if (!isGitRepo) {
    error('Not a git repository');
  }

  // Check for uncommitted changes (excluding specified files)
  const status = exec('git status --porcelain', { silent: true });
  if (status) {
    const excludePatterns = ['.claude/settings.local.json', 'CLAUDE.md'];
    const lines = status.split('\n');
    const relevantChanges = lines.filter(line => {
      const filePath = line.substring(3).trim();
      return !excludePatterns.some(pattern => filePath.includes(pattern));
    });

    if (relevantChanges.length > 0) {
      warning('Working directory has uncommitted changes:');
      relevantChanges.forEach(line => console.log(`  ${line}`));
      console.log('');
      warning('Please commit or stash changes before releasing.');
      process.exit(1);
    }
  }

  success('Git repository is clean');
}

/**
 * Run bump-version script
 */
function bumpVersion(bumpType) {
  step(`Bumping version (${bumpType || 'auto-detect'})...`);

  const command = bumpType
    ? `node scripts/bump-version.cjs ${bumpType}`
    : 'node scripts/bump-version.cjs';

  exec(command);
}

/**
 * Create git commit for version bump
 */
function createCommit(newVersion) {
  step('Creating git commit...');

  exec('git add package.json plugin.json');
  exec(`git commit -m "chore: bump version to ${newVersion}"`);

  success(`Created commit: chore: bump version to ${newVersion}`);
}

/**
 * Create git tag
 */
function createTag(version) {
  step('Creating git tag...');

  const tagName = `v${version}`;

  // Check if tag already exists
  const existingTag = exec(`git tag -l ${tagName}`, { silent: true, ignoreError: true });
  if (existingTag) {
    warning(`Tag ${tagName} already exists`);
    const response = exec('echo n', { silent: true }); // Default to 'n' for automation
    if (response !== 'y' && response !== 'Y') {
      info('Skipping tag creation');
      return;
    }
    exec(`git tag -d ${tagName}`);
  }

  exec(`git tag ${tagName}`);
  success(`Created tag: ${tagName}`);
}

/**
 * Push to remote repository
 */
function pushToRemote() {
  step('Pushing to remote repository...');

  exec('git push origin main');
  exec('git push origin --tags');

  success('Pushed commits and tags to remote');
}

/**
 * Display release summary
 */
function displaySummary(oldVersion, newVersion) {
  console.log('');
  log('═══════════════════════════════════════════', 'green');
  log('   🎉 Release Complete!', 'green');
  log('═══════════════════════════════════════════', 'green');
  console.log('');

  log(`Version: ${oldVersion} → ${newVersion}`, 'bright');
  log(`Tag: v${newVersion}`, 'bright');
  console.log('');

  const repoUrl = 'https://github.com/Freedragonlancer/Siyuan-Note-ClaudePlugin';
  info('Next steps:');
  console.log(`  1. Monitor GitHub Actions: ${repoUrl}/actions`);
  console.log(`  2. Check release: ${repoUrl}/releases/tag/v${newVersion}`);
  console.log('');
}

/**
 * Main function
 */
function main() {
  log('═══════════════════════════════════════════', 'magenta');
  log('   🚀 SiYuan Plugin Release Script', 'magenta');
  log('═══════════════════════════════════════════', 'magenta');

  try {
    // Get current version
    const oldVersion = getCurrentVersion();
    info(`Current version: ${oldVersion}`);

    // Verify git status
    verifyGitStatus();

    // Get bump type from command line argument
    const bumpType = process.argv[2];

    // Run bump-version script
    bumpVersion(bumpType);

    // Get new version after bump
    const newVersion = getCurrentVersion();

    if (oldVersion === newVersion) {
      warning('No version bump occurred. Exiting.');
      process.exit(0);
    }

    // Create commit
    createCommit(newVersion);

    // Create tag
    createTag(newVersion);

    // Push to remote
    pushToRemote();

    // Display summary
    displaySummary(oldVersion, newVersion);

  } catch (err) {
    error(`Release failed: ${err.message}`);
  }
}

// Run script
main();
