/**
 * Script to create a symbolic link for development
 * Usage: node scripts/make_dev_link.js --dir=/path/to/siyuan/workspace/data/plugins
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// Parse command line arguments
const args = process.argv.slice(2);
let pluginsDir = null;

for (const arg of args) {
    if (arg.startsWith("--dir=")) {
        pluginsDir = arg.substring(6);
    }
}

if (!pluginsDir) {
    console.error("Error: Please specify the plugins directory with --dir=/path/to/plugins");
    console.error("Example: node scripts/make_dev_link.js --dir=C:/SiYuan/data/plugins");
    process.exit(1);
}

// Get plugin name from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
const pluginName = packageJson.name;

// Source and target paths
const sourceDir = path.join(__dirname, "..", "dist");
const targetDir = path.join(pluginsDir, pluginName);

// Check if source directory exists
if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Source directory does not exist: ${sourceDir}`);
    console.error("Please run 'pnpm build' first");
    process.exit(1);
}

// Check if target directory already exists
if (fs.existsSync(targetDir)) {
    console.log(`Removing existing directory: ${targetDir}`);
    fs.rmSync(targetDir, { recursive: true, force: true });
}

// Create symbolic link
try {
    if (os.platform() === "win32") {
        // Windows: use junction
        fs.symlinkSync(sourceDir, targetDir, "junction");
    } else {
        // Unix-like systems: use symbolic link
        fs.symlinkSync(sourceDir, targetDir, "dir");
    }
    console.log(`✓ Created symbolic link:`);
    console.log(`  ${targetDir} -> ${sourceDir}`);
    console.log(`\nPlugin is now linked for development.`);
    console.log(`Run 'pnpm dev' to start watching for changes.`);
} catch (error) {
    console.error(`Error creating symbolic link: ${error.message}`);
    process.exit(1);
}
