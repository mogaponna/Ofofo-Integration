# Environment Setup for Production

When installing the app from DMG/ZIP on a new machine, you need to create a `.env` file in the app's data directory.

## Location:

**macOS:** `~/Library/Application Support/ofofo-integration-agent/.env`

**Windows:** `%APPDATA%/ofofo-integration-agent/.env`

**Linux:** `~/.config/ofofo-integration-agent/.env`

## Required Content:

```env
# Database Connection (from neon.tech)
DATABASE_URL=postgresql://user:password@your-host.neon.tech/your-database?sslmode=require

# Backend API
BACKEND_SERVICE_URL=https://orchestrate.ofofo.ai

# Azure Storage (if using blob storage)
AZURE_STORAGE_CONNECTION_STRING=your_connection_string
AZURE_STORAGE_CONTAINER_NAME=dataroom
```

## Steps:

1. Create the directory if it doesn't exist
2. Create `.env` file with the content above
3. Fill in your actual credentials
4. Restart the application

**Note:** The app will not work without the DATABASE_URL set!

