/**
 * Clean Cache Script for SiYuan Plugin Development
 *
 * This script clears SiYuan cache to force a fresh load of plugin resources.
 * Use this when:
 * - Plugin changes not reflecting after rebuild
 * - CSS/JS seems cached
 * - UI issues that might be cache-related
 *
 * This script does NOT:
 * - Delete plugin files
 * - Rebuild the plugin
 * - Close SiYuan (manual restart required)
 *
 * Usage:
 *   npm run clean-cache
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const CONFIG = {
    siyuanPath: 'N:/Siyuan-Note',
};

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
 * Get directory size (for reporting)
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
            // Ignore errors (permission issues, etc.)
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
 * Clean cache directories
 */
function cleanCache() {
    log('\n' + '='.repeat(60), 'bright');
    log('  SiYuan Plugin - Clean Cache Script', 'bright');
    log('='.repeat(60) + '\n', 'bright');

    // Check if SiYuan is running
    if (isSiYuanRunning()) {
        logWarning('⚠ SiYuan is currently running!');
        log('For best results:', 'yellow');
        log('  1. Close SiYuan before running this script', 'yellow');
        log('  2. Run this script', 'yellow');
        log('  3. Restart SiYuan\n', 'yellow');
        log('Press Ctrl+C to cancel, or wait 3 seconds to continue anyway...\n', 'yellow');

        // Wait 3 seconds
        const waitTime = 3000;
        const startTime = Date.now();
        while (Date.now() - startTime < waitTime) {
            // Busy wait
        }
    }

    const tempPath = path.join(CONFIG.siyuanPath, 'temp');

    log('Analyzing cache...', 'cyan');

    // Get size before cleanup
    const sizeBefore = getDirSize(tempPath);
    log(`Cache size: ${formatSize(sizeBefore)}`, 'yellow');

    // Remove cache
    log('\nRemoving cache directory...', 'cyan');
    const result = removeDir(tempPath);

    if (result.success) {
        if (result.notFound) {
            logSuccess('Cache directory not found (already clean)');
        } else {
            logSuccess(`Removed cache: ${tempPath}`);
            logSuccess(`Freed ${formatSize(sizeBefore)} of disk space`);
        }

        // Success summary
        log('\n' + '='.repeat(60), 'green');
        log('  ✓ Cache cleaned successfully!', 'green');
        log('='.repeat(60) + '\n', 'green');

        log('Next steps:', 'yellow');
        log('  1. Restart SiYuan (F5 or close and reopen)', 'yellow');
        log('  2. Open plugin settings to verify changes', 'yellow');
        log('  3. Use Ctrl+Shift+F5 in SiYuan for hard refresh\n', 'yellow');

        return true;
    } else {
        logError(`Failed to remove cache: ${result.error}`);
        log('\n' + '='.repeat(60), 'red');
        log('  ❌ Cache cleanup failed!', 'red');
        log('='.repeat(60) + '\n', 'red');

        log('Troubleshooting:', 'yellow');
        log('  1. Make sure SiYuan is closed', 'yellow');
        log('  2. Check file permissions', 'yellow');
        log('  3. Try running as administrator\n', 'yellow');

        return false;
    }
}

/**
 * Main execution
 */
function main() {
    const success = cleanCache();
    process.exit(success ? 0 : 1);
}

// Run main function
main();
