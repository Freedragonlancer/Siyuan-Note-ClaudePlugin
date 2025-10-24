#!/bin/bash
# Package plugin for GitHub release

VERSION=$(node -p "require('./package.json').version")
PLUGIN_NAME="siyuan-plugin-claude-assistant"
RELEASE_DIR="release"
PACKAGE_NAME="${PLUGIN_NAME}-v${VERSION}"

echo "📦 Packaging ${PACKAGE_NAME}"

# Build the plugin
echo "🔨 Building..."
npm run build

# Create release directory
rm -rf $RELEASE_DIR
mkdir -p $RELEASE_DIR/$PACKAGE_NAME

# Copy necessary files
echo "📋 Copying files..."
cp -r dist/* $RELEASE_DIR/$PACKAGE_NAME/
cp icon.png $RELEASE_DIR/$PACKAGE_NAME/
cp preview.png $RELEASE_DIR/$PACKAGE_NAME/
cp plugin.json $RELEASE_DIR/$PACKAGE_NAME/
cp README.md $RELEASE_DIR/$PACKAGE_NAME/
cp README_zh_CN.md $RELEASE_DIR/$PACKAGE_NAME/
cp -r i18n $RELEASE_DIR/$PACKAGE_NAME/

# Create zip
echo "🗜️  Creating zip..."
cd $RELEASE_DIR
zip -r "${PACKAGE_NAME}.zip" $PACKAGE_NAME
cd ..

echo "✅ Package created: ${RELEASE_DIR}/${PACKAGE_NAME}.zip"
echo "📊 Package size: $(du -h ${RELEASE_DIR}/${PACKAGE_NAME}.zip | cut -f1)"
