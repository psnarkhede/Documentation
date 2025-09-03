// const express = require('express');
// const axios = require('axios');
// const { parse } = require('@typescript-eslint/typescript-estree');

// const app = express();
// app.use(express.json());
// const PORT = 3000;

// // Utility: get type name from AST node (handles Identifier and TSQualifiedName)
// function getTypeName(typeNode) {
//     if (!typeNode) return null;
//     if (typeNode.typeName) {
//         if (typeNode.typeName.type === 'Identifier') return typeNode.typeName.name;
//         if (typeNode.typeName.type === 'TSQualifiedName') return typeNode.typeName.right.name;
//     }
//     return null;
// }

// // Parse TypeScript code and extract DTOs and endpoints
// function parseFileContent(code, dtoMap) {
//     const ast = parse(code, { loc: true, range: true });
//     const endpoints = [];

//     function walk(node, controllerName = '') {
//         if (!node) return;

//         // Class: detect controller or DTO
//         if (node.type === 'ClassDeclaration') {
//             const isController = node.decorators?.some(d => d.expression?.callee?.name === 'Controller');

//             if (isController) {
//                 const controllerDec = node.decorators.find(d => d.expression?.callee?.name === 'Controller');
//                 controllerName = controllerDec.expression.arguments[0]?.value || node.id?.name || 'UnnamedController';
//             } else if (node.id?.name) {
//                 // DTO class
//                 const dto = { name: node.id.name, properties: [] };
//                 for (const bodyEl of node.body.body) {
//                     if (bodyEl.type === 'PropertyDefinition') {
//                         dto.properties.push({
//                             name: bodyEl.key.name,
//                             type: getTypeName(bodyEl.typeAnnotation?.typeAnnotation) || 'any',
//                             optional: !!bodyEl.optional
//                         });
//                     }
//                 }
//                 dtoMap.set(dto.name, dto);
//             }
//         }

//         // Controller methods
//         if (node.type === 'MethodDefinition' && node.decorators?.length > 0) {
//             node.decorators.forEach(dec => {
//                 const decName = dec.expression?.callee?.name;
//                 if (['Get','Post','Put','Delete','Patch'].includes(decName)) {
//                     const routePath = dec.expression.arguments[0]?.value || '/';
//                     const endpoint = {
//                         method: decName.toUpperCase(),
//                         path: routePath,
//                         functionName: node.key.name,
//                         controller: controllerName,
//                         requestDto: null,
//                         responseDto: null
//                     };

//                     // Request DTO from method parameters
//                     node.value.params?.forEach(param => {
//                         const typeName = getTypeName(param.typeAnnotation?.typeAnnotation);
//                         if (typeName && dtoMap.has(typeName)) endpoint.requestDto = dtoMap.get(typeName);
//                     });

//                     // Response DTO from return type
//                     const returnTypeName = getTypeName(node.value.returnType?.typeAnnotation);
//                     if (returnTypeName && dtoMap.has(returnTypeName)) endpoint.responseDto = dtoMap.get(returnTypeName);

//                     endpoints.push(endpoint);
//                 }
//             });
//         }

//         // Recurse into child nodes
//         for (const key in node) {
//             const child = node[key];
//             if (Array.isArray(child)) child.forEach(c => walk(c, controllerName));
//             else if (typeof child === 'object' && child !== null) walk(child, controllerName);
//         }
//     }

//     walk(ast);
//     return endpoints;
// }

// // Recursively fetch all files (handles directories)
// async function fetchAllFiles(items) {
//     let files = [];

//     for (const item of items) {
//         if (item.type === 'file' && item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts')) {
//             files.push(item);
//         } else if (item.type === 'dir') {
//             const response = await axios.get(item.url);
//             files = files.concat(await fetchAllFiles(response.data));
//         }
//     }

//     return files;
// }

// // Parse GitHub files: build DTO map and endpoints
// async function parseGitHubFiles(items) {
//     const dtoMap = new Map();
//     let allEndpoints = [];

//     const files = await fetchAllFiles(items);

//     // First pass: build DTO map
//     for (const file of files) {
//         const response = await axios.get(file.download_url);
//         parseFileContent(response.data, dtoMap);
//     }

//     // Second pass: extract endpoints and attach DTOs
//     for (const file of files) {
//         const response = await axios.get(file.download_url);
//         const endpoints = parseFileContent(response.data, dtoMap);
//         allEndpoints = allEndpoints.concat(endpoints.filter(e => e.controller));
//     }

//     return allEndpoints;
// }

// // Express POST endpoint
// app.post('/parse', async (req, res) => {
//     try {
//         const items = req.body;
//         if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array of files' });

//         const endpoints = await parseGitHubFiles(items);
//         res.json(endpoints);
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: 'Parsing failed', details: err.message });
//     }
// });

// app.listen(PORT, () => console.log(`🚀 Parser API running at http://localhost:${PORT}`));


const express = require('express');
const axios = require('axios');
const { parse } = require('@typescript-eslint/typescript-estree');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());
const PORT = 3000;

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

// Express POST endpoint
app.post('/parse', async (req, res) => {
    try {
        const items = req.body; // Accept old style array directly
        if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array of files' });

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
        res.json({ version, endpoints });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Parsing failed', details: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Parser API running at http://localhost:${PORT}`));
