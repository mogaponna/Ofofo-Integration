# Production Readiness Guide

## Current Status

### ✅ Fixed Issues
1. **Code Signing Configuration** - Set to `null` to skip signing for now (can be configured later)
2. **URL/searchParams Polyfill** - Comprehensive polyfill added to handle Electron's file:// protocol issues
3. **Error Handling** - Detailed logging added throughout the email service flow

### ⚠️ Known Issue
**searchParams Error** - Still occurring when clicking "Send OTP". The error happens in Azure SDK's internal HTTP client when it tries to parse URLs.

## For Production Deployment

### Code Signing (Required for Distribution)

According to [electron-builder macOS documentation](https://www.electron.build/mac), you have two options:

#### Option 1: Developer ID Certificate (Recommended for Distribution)
1. Get a Developer ID Application certificate from Apple Developer Program
2. Update `electron-builder.json`:
```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)",
  "hardenedRuntime": true,
  "notarize": true
}
```
3. Set environment variables for notarization:
   - `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` (recommended)
   - OR `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

#### Option 2: Ad-hoc Signing (For Testing)
```json
"mac": {
  "identity": "-",
  "hardenedRuntime": false
}
```

### Current Configuration
- `identity: null` - No signing (app will show security warnings)
- `hardenedRuntime: false` - Disabled (required for unsigned apps)
- `gatekeeperAssess: false` - Disabled

## Testing the searchParams Fix

The polyfill is in place, but the error persists. To debug:

1. **Check Main Process Logs**: When you run the app, check the terminal/console where it was launched
2. **Look for these logs**:
   - `[Main Process] URL/searchParams polyfill initialized`
   - `[Email Service] URL polyfill applied BEFORE Azure SDK load`
   - `[Email] URL polyfill verified - searchParams available`

3. **If error still occurs**, the Azure SDK might be:
   - Using a cached reference to the original URL
   - Accessing URL.searchParams on an undefined object (not a URL object)
   - Using URL in a way our polyfill doesn't catch

## Next Steps

1. **Test the current build** - Install DMG and test if searchParams error still occurs
2. **If error persists**, we may need to:
   - Patch Azure SDK's internal HTTP client
   - Use a different approach to email sending
   - Add a workaround that catches the error and retries

3. **For CEO Demo**:
   - The app should open and show the login screen
   - The searchParams error appears when clicking "Send OTP"
   - You can explain this is a known issue being worked on
   - OR we can add a temporary workaround that shows a friendly error message

## Files Modified

1. `src/main/index.js` - Main process URL polyfill
2. `src/main/email-service.js` - Email service URL polyfill + error handling
3. `src/main/preload.js` - Renderer process polyfill
4. `src/renderer/main.tsx` - Renderer polyfill backup
5. `index.html` - HTML-level polyfill
6. `electron-builder.json` - Code signing configuration

## Build Commands

```bash
# Build and package for macOS
npm run package:mac

# Output files:
# - release/Ofofo Integration Agent-1.0.0.dmg (Intel)
# - release/Ofofo Integration Agent-1.0.0-arm64.dmg (Apple Silicon)
```

