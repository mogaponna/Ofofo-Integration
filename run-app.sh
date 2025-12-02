#!/bin/bash
# Script to run the Ofofo Integration Agent app from terminal to see logs

# Try release folder first (for testing)
RELEASE_APP_PATH="$(pwd)/release/mac-arm64/Ofofo Integration Agent.app/Contents/MacOS/Ofofo Integration Agent"
INSTALLED_APP_PATH="/Applications/Ofofo Integration Agent.app/Contents/MacOS/Ofofo Integration Agent"

if [ -f "$RELEASE_APP_PATH" ]; then
    APP_PATH="$RELEASE_APP_PATH"
    echo "Using release build: $APP_PATH"
elif [ -f "$INSTALLED_APP_PATH" ]; then
    APP_PATH="$INSTALLED_APP_PATH"
    echo "Using installed app: $APP_PATH"
else
    echo "App not found at either location:"
    echo "  Release: $RELEASE_APP_PATH"
    echo "  Installed: $INSTALLED_APP_PATH"
    echo ""
    echo "Please build the app first: npm run package:mac"
    exit 1
fi

echo ""
echo "Running Ofofo Integration Agent..."
echo "Main process logs will appear below:"
echo "==================================="
echo ""

"$APP_PATH"

