#!/bin/bash
# Fix "app is damaged" error on macOS
# This removes quarantine attributes that macOS adds to downloaded files

APP_PATH="release/mac-arm64/Ofofo Integration Agent.app"

if [ ! -d "$APP_PATH" ]; then
    echo "App not found at: $APP_PATH"
    echo "Please build the app first: npm run package:mac"
    exit 1
fi

echo "Removing quarantine attributes from app..."
xattr -cr "$APP_PATH"

echo "✓ Done! The app should now open without 'damaged' error."
echo ""
echo "To test:"
echo "  open \"$APP_PATH\""

