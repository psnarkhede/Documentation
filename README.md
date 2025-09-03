# Parser API

A TypeScript code parser that extracts DTOs and endpoints from GitHub repositories.

## Endpoints

### GET /
- **Description**: Welcome message
- **Response**: Simple text welcome message
- **Status**: ✅ Working

### GET /health
- **Description**: Health check endpoint
- **Response**: JSON with status, timestamp, and environment
- **Status**: ✅ Working

### POST /parse
- **Description**: Parse TypeScript files and extract DTOs/endpoints
- **Method**: POST (changed from GET to fix 401 error)
- **Request Body**: Array of file objects from GitHub API
- **Response**: JSON with version and endpoints
- **Status**: ✅ Fixed

## Recent Changes

The main issue causing the 401 error was:
1. **Wrong HTTP method**: The `/parse` endpoint was using GET but trying to access `req.body`
2. **Missing body parsing**: Proper middleware configuration for handling request bodies
3. **Vercel configuration**: Updated routing and function settings

## Testing

### Local Testing
```bash
npm install
node index.js
```

### Test Endpoints
```bash
node test-endpoints.js
```

### Vercel Testing
```bash
# Set your Vercel URL
export BASE_URL=https://your-app.vercel.app
node test-endpoints.js
```

## Request Format

The `/parse` endpoint expects a POST request with a JSON body containing an array of file objects:

```json
[
  {
    "type": "file",
    "name": "example.ts",
    "download_url": "https://raw.githubusercontent.com/owner/repo/main/example.ts",
    "html_url": "https://github.com/owner/repo/blob/main/example.ts"
  }
]
```

## Deployment

This API is configured for Vercel deployment with:
- Serverless Node.js runtime
- Proper routing configuration
- Increased function timeout (30 seconds)
- CORS enabled
- Body parsing middleware configured

## Dependencies

- express: Web framework
- axios: HTTP client for GitHub API calls
- @typescript-eslint/typescript-estree: TypeScript parsing
- cors: Cross-origin resource sharing
