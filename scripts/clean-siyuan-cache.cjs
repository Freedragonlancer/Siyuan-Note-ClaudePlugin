/**
 * Clean SiYuan Browser Cache Script
 *
 * This script clears SiYuan's internal browser cache (not just temp files).
 * Use this when:
 * - CSS changes not applying despite rebuild
 * - Settings UI layout not updating
 * - JavaScript behaving with old cached code
 * - Visual glitches that persist after plugin update
 *
 * Difference from clean-cache.cjs:
 * - clean-cache.cjs: Deletes N:/Siyuan-Note/temp (runtime cache)
 * - clean-siyuan-cache.cjs: Deletes %APPDATA%/SiYuan/Cache (browser cache)
 *
 * Usage:
 *   npm run clean-siyuan-cache
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠ ${message}`, 'yellow');
}

/**
 * Find SiYuan cache directories
 */
function findSiYuanCacheDirectories() {
    const possiblePaths = [];

    if (os.platform() === 'win32') {
        // Windows paths
        const appData = process.env.APPDATA;
        const localAppData = process.env.LOCALAPPDATA;

        if (appData) {
            possiblePaths.push(path.join(appData, 'SiYuan', 'Cache'));
            possiblePaths.push(path.join(appData, 'SiYuan', 'GPUCache'));
        }

        if (localAppData) {
            possiblePaths.push(path.join(localAppData, 'SiYuan', 'Cache'));
            possiblePaths.push(path.join(localAppData, 'SiYuan', 'GPUCache'));
        }
    } else if (os.platform() === 'darwin') {
        // macOS paths
        const homeDir = os.homedir();
        possiblePaths.push(path.join(homeDir, 'Library', 'Application Support', 'SiYuan', 'Cache'));
        possiblePaths.push(path.join(homeDir, 'Library', 'Application Support', 'SiYuan', 'GPUCache'));
    } else {
        // Linux paths
        const homeDir = os.homedir();
        possiblePaths.push(path.join(homeDir, '.config', 'SiYuan', 'Cache'));
        possiblePaths.push(path.join(homeDir, '.config', 'SiYuan', 'GPUCache'));
    }

    // Filter to only existing directories
    return possiblePaths.filter(p => fs.existsSync(p));
}

/**
 * Check if SiYuan is running
 */
function isSiYuanRunning() {
    const isWindows = os.platform() === 'win32';

    try {
        if (isWindows) {
            const output = execSync('tasklist /FI "IMAGENAME eq SiYuan.exe"', {
                encoding: 'utf-8',
                stdio: 'pipe'
            });
            return output.includes('SiYuan.exe');
        } else {
            const output = execSync('pgrep -f SiYuan', {
                encoding: 'utf-8',
                stdio: 'pipe'
            });
            return output.trim() !== '';
        }
    } catch (error) {
        return false;
    }
}

/**
 * Get directory size
 */
function getDirSize(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return 0;
    }

    let totalSize = 0;

    function calcSize(currentPath) {
        try {
            const stats = fs.statSync(currentPath);
            if (stats.isDirectory()) {
                const files = fs.readdirSync(currentPath);
                files.forEach(file => {
                    calcSize(path.join(currentPath, file));
                });
            } else {
                totalSize += stats.size;
            }
        } catch (error) {
            // Ignore errors
        }
    }

    calcSize(dirPath);
    return totalSize;
}

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * Remove directory recursively
 */
function removeDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return { success: true, notFound: true };
    }

    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        return { success: true, notFound: false };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Main execution
 */
function main() {
    log('\n' + '='.repeat(60), 'bright');
    log('  SiYuan Plugin - Clean Browser Cache Script', 'bright');
    log('='.repeat(60) + '\n', 'bright');

    // Check if SiYuan is running
    if (isSiYuanRunning()) {
        logWarning('⚠ SiYuan is currently running!');
        log('\n┌─────────────────────────────────────────────────┐', 'red');
        log('│  WARNING: SiYuan MUST be closed!              │', 'red');
        log('│                                                 │', 'red');
        log('│  Cache cannot be properly cleaned while        │', 'red');
        log('│  SiYuan is running. Please:                    │', 'red');
        log('│                                                 │', 'red');
        log('│  1. Close SiYuan completely                    │', 'red');
        log('│  2. Run this script again                      │', 'red');
        log('│  3. Restart SiYuan                             │', 'red');
        log('└─────────────────────────────────────────────────┘\n', 'red');

        log('Press Ctrl+C to exit...', 'yellow');
        process.exit(1);
    }

    log('Searching for SiYuan cache directories...', 'cyan');
    const cacheDirectories = findSiYuanCacheDirectories();

    if (cacheDirectories.length === 0) {
        logWarning('No SiYuan cache directories found');
        log('\nPossible reasons:', 'yellow');
        log('  - SiYuan has never been run', 'yellow');
        log('  - SiYuan is installed in a non-standard location', 'yellow');
        log('  - Cache has already been cleared\n', 'yellow');
        process.exit(0);
    }

    log(`\nFound ${cacheDirectories.length} cache director${cacheDirectories.length > 1 ? 'ies' : 'y'}:`, 'green');

    let totalSizeBefore = 0;
    const cacheInfo = [];

    // Analyze cache sizes
    for (const dir of cacheDirectories) {
        const size = getDirSize(dir);
        totalSizeBefore += size;
        cacheInfo.push({ path: dir, size });
        log(`  - ${dir} (${formatSize(size)})`, 'yellow');
    }

    log(`\nTotal cache size: ${formatSize(totalSizeBefore)}`, 'cyan');

    // Confirm deletion
    log('\nRemoving cache directories...', 'cyan');

    let totalRemoved = 0;
    let successCount = 0;

    for (const info of cacheInfo) {
        const result = removeDir(info.path);

        if (result.success) {
            if (result.notFound) {
                logSuccess(`Already clean: ${path.basename(info.path)}`);
            } else {
                logSuccess(`Removed: ${path.basename(info.path)} (${formatSize(info.size)})`);
                totalRemoved += info.size;
                successCount++;
            }
        } else {
            logError(`Failed to remove ${path.basename(info.path)}: ${result.error}`);
        }
    }

    // Summary
    log('\n' + '='.repeat(60), 'green');
    log('  ✓ Cache cleanup completed!', 'green');
    log('='.repeat(60) + '\n', 'green');

    log('Summary:', 'cyan');
    log(`  - Directories processed: ${cacheDirectories.length}`, 'yellow');
    log(`  - Successfully removed: ${successCount}`, 'yellow');
    log(`  - Disk space freed: ${formatSize(totalRemoved)}`, 'yellow');

    log('\nNext steps:', 'cyan');
    log('  1. Start SiYuan', 'yellow');
    log('  2. Open plugin settings (⚙️ Claude AI 设置)', 'yellow');
    log('  3. Verify layout shows 2 columns:', 'yellow');
    log('     - Left: Navigation sidebar', 'yellow');
    log('     - Right: Content + bottom action bar', 'yellow');
    log('  4. Buttons should be at bottom right (not separate column)\n', 'yellow');

    if (successCount === cacheDirectories.length) {
        log('✓ All cache cleared successfully!', 'green');
        process.exit(0);
    } else {
        log('⚠ Some caches could not be removed', 'yellow');
        log('Try running as administrator or check file permissions\n', 'yellow');
        process.exit(1);
    }
}

// Run main function
main();
