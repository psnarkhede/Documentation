const express = require('express');
const axios = require('axios');
const { parse } = require('@typescript-eslint/typescript-estree');
const cors = require('cors');
const app = express();

// Middleware configuration
app.use(express.json({ limit: '10mb' })); // Increase limit for larger payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Utility: get type name from AST node
function getTypeName(typeNode) {
    if (!typeNode) return null;
    if (typeNode.typeName) {
        if (typeNode.typeName.type === 'Identifier') return typeNode.typeName.name;
        if (typeNode.typeName.type === 'TSQualifiedName') return typeNode.typeName.right.name;
    }
    return null;
}

// Parse TypeScript code and extract DTOs and endpoints
function parseFileContent(code, dtoMap) {
    const ast = parse(code, { loc: true, range: true });
    const endpoints = [];

    function walk(node, controllerName = '') {
        if (!node) return;

        // Class: detect controller or DTO
        if (node.type === 'ClassDeclaration') {
            const isController = node.decorators?.some(d => d.expression?.callee?.name === 'Controller');

            if (isController) {
                const controllerDec = node.decorators.find(d => d.expression?.callee?.name === 'Controller');
                controllerName = controllerDec.expression.arguments[0]?.value || node.id?.name || 'UnnamedController';
            } else if (node.id?.name) {
                // DTO class
                const dto = { name: node.id.name, properties: [] };
                for (const bodyEl of node.body.body) {
                    if (bodyEl.type === 'PropertyDefinition') {
                        dto.properties.push({
                            name: bodyEl.key.name,
                            type: getTypeName(bodyEl.typeAnnotation?.typeAnnotation) || 'any',
                            optional: !!bodyEl.optional
                        });
                    }
                }
                dtoMap.set(dto.name, dto);
            }
        }

        // Controller methods
        if (node.type === 'MethodDefinition' && node.decorators?.length > 0) {
            node.decorators.forEach(dec => {
                const decName = dec.expression?.callee?.name;
                if (['Get','Post','Put','Delete','Patch'].includes(decName)) {
                    const routePath = dec.expression.arguments[0]?.value || '/';
                    const endpoint = {
                        method: decName.toUpperCase(),
                        path: routePath,
                        functionName: node.key.name,
                        controller: controllerName,
                        requestDto: null,
                        responseDto: null
                    };

                    // Request DTO from method parameters
                    node.value.params?.forEach(param => {
                        const typeName = getTypeName(param.typeAnnotation?.typeAnnotation);
                        if (typeName && dtoMap.has(typeName)) endpoint.requestDto = dtoMap.get(typeName);
                    });

                    // Response DTO from return type
                    const returnTypeName = getTypeName(node.value.returnType?.typeAnnotation);
                    if (returnTypeName && dtoMap.has(returnTypeName)) endpoint.responseDto = dtoMap.get(returnTypeName);

                    endpoints.push(endpoint);
                }
            });
        }

        // Recurse into child nodes
        for (const key in node) {
            const child = node[key];
            if (Array.isArray(child)) child.forEach(c => walk(c, controllerName));
            else if (typeof child === 'object' && child !== null) walk(child, controllerName);
        }
    }

    walk(ast);
    return endpoints;
}

// Recursively fetch all files (handles directories)
async function fetchAllFiles(items) {
    let files = [];

    for (const item of items) {
        if (item.type === 'file' && item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts')) {
            files.push(item);
        } else if (item.type === 'dir') {
            const response = await axios.get(item.url);
            files = files.concat(await fetchAllFiles(response.data));
        }
    }

    return files;
}

// Get latest commit SHA of repo
async function getLatestCommitSha(owner, repo, branch = 'main') {
    try {
        const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`);
        return res.data.sha;
    } catch (err) {
        console.error('Failed to fetch latest commit SHA', err.message);
        return null;
    }
}

// Parse GitHub files: build DTO map and endpoints
async function parseGitHubFiles(items) {
    const dtoMap = new Map();
    let allEndpoints = [];

    const files = await fetchAllFiles(items);

    // First pass: build DTO map
    for (const file of files) {
        const response = await axios.get(file.download_url);
        parseFileContent(response.data, dtoMap);
    }

    // Second pass: extract endpoints and attach DTOs
    for (const file of files) {
        const response = await axios.get(file.download_url);
        const endpoints = parseFileContent(response.data, dtoMap);
        allEndpoints = allEndpoints.concat(endpoints.filter(e => e.controller));
    }

    return allEndpoints;
}

app.get('/',async (req,res)=>{
    res.send('Welcome to the Parser API');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Debug endpoint to see all registered routes
app.get('/debug', (req, res) => {
    const routes = [];
    app._router.stack.forEach(middleware => {
        if (middleware.route) {
            routes.push({
                path: middleware.route.path,
                methods: Object.keys(middleware.route.methods)
            });
        }
    });
    res.json({ 
        routes,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Express POST endpoint (changed from GET to POST)
app.post('/parse', async (req, res) => {
    try {
        console.log('Received parse request:', {
            method: req.method,
            headers: req.headers,
            bodyKeys: req.body ? Object.keys(req.body) : 'no body',
            bodyType: typeof req.body,
            bodyLength: req.body ? (Array.isArray(req.body) ? req.body.length : 'not array') : 'undefined'
        });

        // Check if body exists and is properly parsed
        if (!req.body) {
            console.log('No request body received');
            return res.status(400).json({ 
                error: 'No request body received',
                received: typeof req.body,
                headers: req.headers
            });
        }

        const items = req.body; // Now this will work properly with POST
        if (!Array.isArray(items)) {
            console.log('Invalid request body:', req.body);
            return res.status(400).json({ 
                error: 'Expected array of files',
                received: typeof req.body,
                bodyKeys: req.body ? Object.keys(req.body) : 'no body'
            });
        }

        console.log('Processing', items.length, 'files');

        // Optional: extract owner/repo/branch from first file path
        const firstFile = items[0];
        let owner = null; // replace with default if needed
        let repo = null;
        let branch = null;
        if (firstFile && firstFile.html_url) {
            const parts = firstFile.html_url.split('/');
            owner = parts[3];
            repo = parts[4];
            branch = firstFile.html_url.includes('tree') ? parts[6] : 'main';
        }

        const version = await getLatestCommitSha(owner, repo, branch);

        const endpoints = await parseGitHubFiles(items);
        console.log('Successfully parsed', endpoints.length, 'endpoints');
        res.json({ version, endpoints });
    } catch (err) {
        console.error('Parse endpoint error:', err);
        res.status(500).json({ 
            error: 'Parsing failed', 
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Catch-all route for debugging
app.use('*', (req, res) => {
    console.log('404 - Route not found:', req.method, req.originalUrl);
    res.status(404).json({
        error: 'Route not found',
        method: req.method,
        url: req.originalUrl,
        availableRoutes: ['GET /', 'GET /health', 'GET /debug', 'POST /parse']
    });
});

app.listen(3000, () => console.log(`🚀 Parser API running at http://localhost:${3000}`));
