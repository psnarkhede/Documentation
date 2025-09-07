// const express = require("express");
// const axios = require('axios');
// const { parse } = require('@typescript-eslint/typescript-estree');
// const parserRoute = express.Router();

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


// // Get latest commit SHA of repo
// async function getLatestCommitSha(owner, repo, branch = 'main') {
//     try {
//         const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`);
//         return res.data.sha;
//     } catch (err) {
//         console.error('Failed to fetch latest commit SHA', err.message);
//         return null;
//     }
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


// parserRoute.post("/", async (req, res) => {
//   try {
//         const items = req.body; // Accept old style array directly
//         if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array of files' });


//         // Optional: extract owner/repo/branch from first file path
//         const firstFile = items[0];
//         let owner = null; // replace with default if needed
//         let repo = null;
//         let branch = null;
//         if (firstFile && firstFile.html_url) {
//             const parts = firstFile.html_url.split('/');
//             owner = parts[3];
//             repo = parts[4];
//             branch = firstFile.html_url.includes('tree') ? parts[6] : 'main';
//         }


//         const version = await getLatestCommitSha(owner, repo, branch);


//         const endpoints = await parseGitHubFiles(items);
//         res.json({ version, endpoints });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: 'Parsing failed', details: err.message });
//     }
// });

// module.exports = parserRoute;


const express = require("express");
const axios = require("axios");
const { parse } = require("@typescript-eslint/typescript-estree");

const parserRoute = express.Router();

/* ---------- Type extraction helpers ---------- */
function getTypeName(typeNode) {
  if (!typeNode) return null;
  switch (typeNode.type) {
    case "TSTypeReference":
      if (typeNode.typeName.type === "Identifier") {
        let typeName = typeNode.typeName.name;
        if (typeNode.typeParameters?.params?.length) {
          const generics = typeNode.typeParameters.params
            .map((p) => getTypeName(p) || "any")
            .join(", ");
          typeName += `<${generics}>`;
        }
        return typeName;
      }
      if (typeNode.typeName.type === "TSQualifiedName") {
        return typeNode.typeName.right.name;
      }
      return "any";

    case "TSStringKeyword":
      return "string";
    case "TSNumberKeyword":
      return "number";
    case "TSBooleanKeyword":
      return "boolean";
    case "TSAnyKeyword":
      return "any";
    case "TSUnknownKeyword":
      return "unknown";
    case "TSVoidKeyword":
      return "void";

    case "TSArrayType":
      return (getTypeName(typeNode.elementType) || "any") + "[]";

    case "TSUnionType":
      return typeNode.types.map((t) => getTypeName(t) || "any").join(" | ");

    case "TSTypeLiteral":
      return "object";

    case "TSLiteralType":
      return typeNode.literal?.value !== undefined
        ? JSON.stringify(typeNode.literal.value)
        : "literal";

    default:
      return "any";
  }
}

/* ---------- AST parse: build DTOs and endpoints ---------- */
function parseFileContent(code, dtoMap) {
  const ast = parse(code, { loc: true, range: true });
  const endpoints = [];

  function walk(node, controllerPrefix = "") {
    if (!node) return;

    // DTO classes and Controllers
    if (node.type === "ClassDeclaration" && node.id?.name) {
      // Detect controller decorator more robustly
      const decorators = node.decorators || [];
      const isController = decorators.some((d) => {
        try {
          return (
            (d.expression?.callee?.name === "Controller") ||
            (d.expression?.name === "Controller") // some AST shapes
          );
        } catch {
          return false;
        }
      });

      if (isController) {
        const dec = decorators.find((d) => {
          try {
            return (
              (d.expression?.callee?.name === "Controller") ||
              (d.expression?.name === "Controller")
            );
          } catch {
            return false;
          }
        });
        let path = "/";
        try {
          // attempt to read literal arg; fallback to '/'
          const arg = dec.expression?.arguments?.[0];
          if (arg) {
            if (arg.type === "Literal" || arg.type === "StringLiteral") path = arg.value || "/";
            else if (arg.value) path = arg.value;
            else path = "/";
          }
        } catch {}
        controllerPrefix = path.startsWith("/") ? path : "/" + path;
      } else {
        // DTO class
        const dto = { name: node.id.name, properties: [] };
        for (const prop of node.body.body) {
          if (prop.type === "PropertyDefinition" && prop.key?.name) {
            dto.properties.push({
              name: prop.key.name,
              type: getTypeName(prop.typeAnnotation?.typeAnnotation) || "any",
              optional: !!prop.optional,
            });
          }
        }
        dtoMap.set(dto.name, dto);
      }
    }

    // Controller method -> endpoints
    if (node.type === "MethodDefinition" && (node.decorators || []).length > 0) {
      (node.decorators || []).forEach((dec) => {
        let decName;
        try {
          decName = dec.expression?.callee?.name || dec.expression?.name;
        } catch {
          decName = null;
        }
        if (["Get", "Post", "Put", "Delete", "Patch"].includes(decName)) {
          // route arg
          let routePath = "/";
          try {
            const arg = dec.expression?.arguments?.[0];
            if (arg) {
              routePath = arg.value || "/";
            }
          } catch {}
          if (!routePath.startsWith("/")) routePath = "/" + routePath;

          // Build full path with safe joining (avoid double slashes)
          const prefix = controllerPrefix && controllerPrefix !== "/" ? controllerPrefix.replace(/\/$/, "") : "";
          const fullPath = (prefix + (routePath === "/" ? "/" : routePath)).replace(/\/{2,}/g, "/");
          const endpoint = {
            method: decName.toUpperCase(),
            path: fullPath.startsWith("/") ? fullPath : "/" + fullPath,
            functionName: node.key.name,
            requestDto: null,
            responseDto: null,
          };

          // Request DTO detection from params
          (node.value.params || []).forEach((param) => {
            const typeName = getTypeName(param.typeAnnotation?.typeAnnotation);
            if (typeName) {
              // if generic or array like BookingRequestDto[] or Paginated<BookingRequestDto>, take raw name attempts
              const candidates = [
                typeName,
                typeName.replace(/\[\]$/, ""),
                ...(typeName.match(/<(.+)>/) ? [typeName.replace(/^.+<(.+)>$/, "$1")] : []),
              ];
              for (const c of candidates) {
                if (dtoMap.has(c)) {
                  endpoint.requestDto = dtoMap.get(c);
                  break;
                }
              }
            }
          });

          // Response DTO detection (handle Promise<T>, arrays, generics)
          let returnTypeName = getTypeName(node.value.returnType?.typeAnnotation);
          if (returnTypeName) {
            // unwrap Promise<...>
            const promiseMatch = returnTypeName.match(/^Promise<(.+)>$/);
            if (promiseMatch) returnTypeName = promiseMatch[1];
            // unwrap array suffix
            if (returnTypeName.endsWith("[]")) returnTypeName = returnTypeName.replace(/\[\]$/, "");
            // if generic like Paginated<BookingResponseDto>
            const genericMatch = returnTypeName.match(/^.+<(.+)>$/);
            if (genericMatch) returnTypeName = genericMatch[1];
          }
          if (returnTypeName && dtoMap.has(returnTypeName)) endpoint.responseDto = dtoMap.get(returnTypeName);

          endpoints.push(endpoint);
        }
      });
    }

    // recurse children
    for (const key in node) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => walk(c, controllerPrefix));
      else if (typeof child === "object" && child !== null) walk(child, controllerPrefix);
    }
  }

  walk(ast);
  return endpoints;
}

/* ---------- GitHub file fetch helpers with caching ---------- */
async function fetchFileContent(url, cache) {
  if (cache.has(url)) return cache.get(url);
  const res = await axios.get(url);
  cache.set(url, res.data);
  return res.data;
}

// fetch all ts files (used for parsing endpoints/dtos)
async function fetchAllTsFiles(items) {
  let files = [];
  for (const item of items) {
    if (item.type === "file" && item.name.endsWith(".ts") && !item.name.endsWith(".spec.ts")) {
      files.push(item);
    } else if (item.type === "dir") {
      const response = await axios.get(item.url);
      files = files.concat(await fetchAllTsFiles(response.data));
    }
  }
  return files;
}

// fetch all repo files (all extensions) to preserve README/package.json etc.
async function fetchAllRepoFiles(items) {
  let files = [];
  for (const item of items) {
    if (item.type === "file") files.push(item);
    else if (item.type === "dir") {
      const response = await axios.get(item.url);
      files = files.concat(await fetchAllRepoFiles(response.data));
    }
  }
  return files;
}

/* ---------- Optional: get latest commit SHA ---------- */
async function getLatestCommitSha(owner, repo, branch = "main") {
  try {
    const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`);
    return res.data.commit.sha;
  } catch (err) {
    console.error("Failed to fetch latest commit SHA", err.message);
    return null;
  }
}

/* ---------- Helper: generate TypeScript DTO content string ---------- */
function generateDtoContent(dto) {
  let content = `export class ${dto.name} {\n`;
  dto.properties.forEach((p) => {
    content += `  ${p.name}${p.optional ? "?" : ""}: ${p.type};\n`;
  });
  content += `}\n`;
  return content;
}

/* ---------- Main parse logic (route) ---------- */
parserRoute.post("/", async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Expected array of files" });

    // derive owner/repo/branch if possible from first file
    const firstFile = items[0];
    let owner = null,
      repo = null,
      branch = "main";
    if (firstFile && firstFile.download_url) {
      const parts = firstFile.download_url.split("/");
      owner = parts[3];
      repo = parts[4];
      if (firstFile.download_url.includes("tree")) branch = parts[6];
    }

    const version = await getLatestCommitSha(owner, repo, branch);

    // Build DTO map and endpoints (with caching)
    const dtoMap = new Map();
    const cache = new Map();

    // fetch .ts files to parse
    const tsFiles = await fetchAllTsFiles(items);

    // First pass: build DTO map
    for (const file of tsFiles) {
      try {
        const content = await fetchFileContent(file.download_url, cache);
        parseFileContent(content, dtoMap); // populates dtoMap
      } catch (err) {
        console.warn(`Failed to fetch/parse ${file.download_url}: ${err.message}`);
      }
    }

    // Second pass: extract endpoints per file
    const allEndpoints = [];
    for (const file of tsFiles) {
      try {
        const content = await fetchFileContent(file.download_url, cache);
        const endpoints = parseFileContent(content, dtoMap);
        if (endpoints.length) allEndpoints.push({ name: file.name, path: file.path, endpoints });
      } catch (err) {
        console.warn(`Failed to fetch/parse ${file.download_url}: ${err.message}`);
      }
    }

    // Now build developerGuide, architectureDocumentation, other arrays using all repo files
    const developerGuide = [];
    const architectureDocumentation = [];
    const other = [];

    const repoFiles = await fetchAllRepoFiles(items);

    for (const file of repoFiles) {
      // skip directories with no download_url
      if (!file.download_url) continue;
      try {
        const content = await fetchFileContent(file.download_url, cache);
        const contentObj = { name: file.name, path: file.path, content };

        // classify files
        if (file.name.endsWith(".module.ts") || file.name.endsWith(".service.ts") || file.name.endsWith(".controller.ts")) {
          developerGuide.push(contentObj);
          if (!architectureDocumentation.some((f) => f.path === contentObj.path)) architectureDocumentation.push(contentObj);
        } else if (file.name.endsWith(".dto.ts") || file.name.endsWith(".dto.ts".toLowerCase())) {
          // dto files into architecture docs
          if (!architectureDocumentation.some((f) => f.path === contentObj.path)) architectureDocumentation.push(contentObj);
        } else if (["main.ts", "package.json", "nest-cli.json", "README.md"].includes(file.name)) {
          if (!architectureDocumentation.some((f) => f.path === contentObj.path)) architectureDocumentation.push(contentObj);
        } else {
          other.push(contentObj);
        }
      } catch (err) {
        console.warn(`Failed to fetch ${file.download_url}: ${err.message}`);
      }
    }

    // Add DTOs that are referenced by endpoints into developerGuide & architectureDocumentation (generated content)
    const dtoSet = new Set();
    allEndpoints.forEach((file) => {
      file.endpoints.forEach((ep) => {
        if (ep.requestDto) dtoSet.add(ep.requestDto.name);
        if (ep.responseDto) dtoSet.add(ep.responseDto.name);
      });
    });

    dtoMap.forEach((dto, name) => {
      if (dtoSet.has(name)) {
        const dtoFileName = name + ".ts";
        const dtoContent = { name: dtoFileName, path: `dto/${dtoFileName}`, content: generateDtoContent(dto) };

        if (!developerGuide.some((f) => f.name === dtoContent.name && f.path === dtoContent.path)) developerGuide.push(dtoContent);
        if (!architectureDocumentation.some((f) => f.name === dtoContent.name && f.path === dtoContent.path)) architectureDocumentation.push(dtoContent);
      }
    });

    // Final response matches your desired structure
    res.json({
      version,
      apiDocumentation: allEndpoints,
      developerGuide,
      architectureDocumentation,
      other,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Parsing failed", details: err.message });
  }
});

module.exports = parserRoute;
