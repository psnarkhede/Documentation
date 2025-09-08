const express = require("express");
const axios = require("axios");
const { parse } = require("@typescript-eslint/typescript-estree");

const parserRoute = express.Router();

/* ---------- GitHub authentication ---------- */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const axiosInstance = axios.create({
  headers: GITHUB_TOKEN
    ? { Authorization: `token ${GITHUB_TOKEN}` }
    : {},
});

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
    case "TSStringKeyword": return "string";
    case "TSNumberKeyword": return "number";
    case "TSBooleanKeyword": return "boolean";
    case "TSAnyKeyword": return "any";
    case "TSUnknownKeyword": return "unknown";
    case "TSVoidKeyword": return "void";
    case "TSArrayType": return (getTypeName(typeNode.elementType) || "any") + "[]";
    case "TSUnionType": return typeNode.types.map(t => getTypeName(t) || "any").join(" | ");
    case "TSTypeLiteral": return "object";
    case "TSLiteralType": return typeNode.literal?.value !== undefined
      ? JSON.stringify(typeNode.literal.value)
      : "literal";
    default: return "any";
  }
}

/* ---------- Expand nested DTOs recursively ---------- */
function expandDto(dtoMap, dto, visited = new Set()) {
  if (!dto) return null;
  if (visited.has(dto.name)) return { name: dto.name }; // prevent infinite recursion
  visited.add(dto.name);

  const expanded = { name: dto.name, properties: [] };
  for (const prop of dto.properties) {
    const nestedDto = dtoMap.get(prop.type);
    if (nestedDto) {
      expanded.properties.push({
        name: prop.name,
        type: expandDto(dtoMap, nestedDto, visited),
        optional: prop.optional,
      });
    } else {
      expanded.properties.push(prop);
    }
  }
  return expanded;
}

/* ---------- AST parse: build DTOs and endpoints ---------- */
function parseFileContent(code, dtoMap) {
  const ast = parse(code, { loc: true, range: true });
  const endpoints = [];

  function walk(node, controllerPrefix = "") {
    if (!node) return;

    if (node.type === "ClassDeclaration" && node.id?.name) {
      const decorators = node.decorators || [];
      const isController = decorators.some(d => {
        try {
          return d.expression?.callee?.name === "Controller" || d.expression?.name === "Controller";
        } catch { return false; }
      });

      if (isController) {
        const dec = decorators.find(d => {
          try { return d.expression?.callee?.name === "Controller" || d.expression?.name === "Controller"; }
          catch { return false; }
        });
        let path = "/";
        try {
          const arg = dec.expression?.arguments?.[0];
          if (arg) path = arg.value || "/";
        } catch {}
        controllerPrefix = path.startsWith("/") ? path : "/" + path;
      } else {
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

    if (node.type === "MethodDefinition" && (node.decorators || []).length > 0) {
      (node.decorators || []).forEach(dec => {
        let decName;
        try { decName = dec.expression?.callee?.name || dec.expression?.name; } catch { decName = null; }
        if (["Get","Post","Put","Delete","Patch"].includes(decName)) {
          let routePath = "/";
          try { const arg = dec.expression?.arguments?.[0]; if(arg) routePath = arg.value || "/"; } catch {}
          if(!routePath.startsWith("/")) routePath = "/" + routePath;
          const prefix = controllerPrefix && controllerPrefix !== "/" ? controllerPrefix.replace(/\/$/,"") : "";
          const fullPath = (prefix + (routePath === "/" ? "/" : routePath)).replace(/\/{2,}/g,"/");
          const endpoint = { method: decName.toUpperCase(), path: fullPath, functionName: node.key.name, requestDto: null, responseDto: null };

          (node.value.params || []).forEach(param => {
            const typeName = getTypeName(param.typeAnnotation?.typeAnnotation);
            if(typeName) {
              const candidates = [typeName, typeName.replace(/\[\]$/,""), ...(typeName.match(/<(.+)>/) ? [typeName.replace(/^.+<(.+)>$/,"$1")]:[])];
              for(const c of candidates) { if(dtoMap.has(c)) { endpoint.requestDto = dtoMap.get(c); break; } }
            }
          });

          let returnTypeName = getTypeName(node.value.returnType?.typeAnnotation);
          if(returnTypeName) {
            const promiseMatch = returnTypeName.match(/^Promise<(.+)>$/);
            if(promiseMatch) returnTypeName = promiseMatch[1];
            if(returnTypeName.endsWith("[]")) returnTypeName = returnTypeName.replace(/\[\]$/,"");
            const genericMatch = returnTypeName.match(/^.+<(.+)>$/);
            if(genericMatch) returnTypeName = genericMatch[1];
          }
          if(returnTypeName && dtoMap.has(returnTypeName)) endpoint.responseDto = dtoMap.get(returnTypeName);

          endpoints.push(endpoint);
        }
      });
    }

    for(const key in node){
      const child = node[key];
      if(Array.isArray(child)) child.forEach(c => walk(c, controllerPrefix));
      else if(typeof child === "object" && child !== null) walk(child, controllerPrefix);
    }
  }

  walk(ast);
  return endpoints;
}

/* ---------- GitHub fetch helpers ---------- */
async function fetchFileContent(url, cache) {
  if(cache.has(url)) return cache.get(url);
  try{
    const res = await axiosInstance.get(url);
    cache.set(url, res.data);
    return res.data;
  } catch(err){
    console.warn(`Skipping ${url}: ${err.response?.status} ${err.response?.statusText}`);
    return null;
  }
}

async function fetchAllTsFiles(items){
  let files = [];
  for(const item of items){
    if(item.type==="file" && item.name.endsWith(".ts") && !item.name.endsWith(".spec.ts")) files.push(item);
    else if(item.type==="dir"){
      const res = await axiosInstance.get(item.url);
      files = files.concat(await fetchAllTsFiles(res.data));
    }
  }
  return files;
}

async function fetchAllRepoFiles(items){
  let files = [];
  for(const item of items){
    if(item.type==="file") files.push(item);
    else if(item.type==="dir"){
      const res = await axiosInstance.get(item.url);
      files = files.concat(await fetchAllRepoFiles(res.data));
    }
  }
  return files;
}

/* ---------- Latest commit ---------- */
async function getLatestCommitSha(owner, repo, branch="main"){
  try{
    const res = await axiosInstance.get(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`);
    return res.data.commit.sha;
  }catch(err){
    console.error("Failed to fetch latest commit SHA", err.message);
    return null;
  }
}

/* ---------- Generate DTO content ---------- */
function generateDtoContent(dto){
  let content = `export class ${dto.name} {\n`;
  dto.properties.forEach(p => {
    content += `  ${p.name}${p.optional ? "?" : ""}: ${p.type};\n`;
  });
  content += `}\n`;
  return content;
}

/* ---------- Collect all nested DTOs recursively ---------- */
function collectNestedDtos(dtoMap, dto, collected = new Map()) {
  if(!dto || collected.has(dto.name)) return;
  collected.set(dto.name, dto);
  for(const prop of dto.properties){
    if(prop.type && typeof prop.type === "object" && prop.type.name){
      const nestedDto = dtoMap.get(prop.type.name);
      collectNestedDtos(dtoMap, nestedDto, collected);
    }
  }
}

/* ---------- Main parse route ---------- */
parserRoute.post("/", async (req,res)=>{
  try{
    const items = req.body;
    if(!Array.isArray(items)) return res.status(400).json({error:"Expected array of files"});

    const firstFile = items[0];
    let owner=null, repo=null, branch="main";
    if(firstFile && firstFile.download_url){
      const parts = firstFile.download_url.split("/");
      owner = parts[3];
      repo = parts[4];
      if(firstFile.download_url.includes("tree")) branch = parts[6];
    }

    const version = await getLatestCommitSha(owner, repo, branch);
    const dtoMap = new Map();
    const cache = new Map();

    const tsFiles = await fetchAllTsFiles(items);
    for(const file of tsFiles){
      const content = await fetchFileContent(file.download_url, cache);
      if(content) parseFileContent(content, dtoMap);
    }

    const allEndpoints = [];
    for(const file of tsFiles){
      const content = await fetchFileContent(file.download_url, cache);
      if(!content) continue;
      const endpoints = parseFileContent(content, dtoMap).map(ep=>{
        return {
          ...ep,
          requestDto: expandDto(dtoMap, ep.requestDto),
          responseDto: expandDto(dtoMap, ep.responseDto)
        }
      });
      if(endpoints.length) allEndpoints.push({version, name:file.name, path:file.path, endpoints});
    }

    const developerGuide = [];
    const architectureDocumentation = [];
    const onboardingDocument = [];
    const userManual = [];

    const repoFiles = await fetchAllRepoFiles(items);
    for(const file of repoFiles){
      if(!file.download_url) continue;
      const content = await fetchFileContent(file.download_url, cache);
      if(!content) continue;

      const contentObj = {version, name:file.name, path:file.path, content};

      if(file.name.endsWith(".module.ts") || file.name.endsWith(".service.ts") || file.name.endsWith(".controller.ts")){
        developerGuide.push(contentObj);
        if(!architectureDocumentation.some(f=>f.path===contentObj.path)) architectureDocumentation.push(contentObj);
      } else if(file.name.endsWith(".dto.ts")){
        if(!architectureDocumentation.some(f=>f.path===contentObj.path)) architectureDocumentation.push(contentObj);
      } else if(["main.ts","package.json","nest-cli.json","README.md"].includes(file.name)){
        if(!architectureDocumentation.some(f=>f.path===contentObj.path)) architectureDocumentation.push(contentObj);
        onboardingDocument.push(contentObj);
        // Only keep necessary ones for user manual
        if(["README.md","package.json"].includes(file.name)){
          userManual.push(contentObj);
        }
      }
    }

    // Include all referenced DTOs and nested DTOs in guides
    const dtoSet = new Map();
    allEndpoints.forEach(file=>{
      file.endpoints.forEach(ep=>{
        collectNestedDtos(dtoMap, ep.requestDto, dtoSet);
        collectNestedDtos(dtoMap, ep.responseDto, dtoSet);
      })
    });

    dtoSet.forEach((dto,name)=>{
      const dtoContent = {version, name:`${name}.ts`, path:`dto/${name}.ts`, content:generateDtoContent(dto)};
      if(!developerGuide.some(f=>f.name===dtoContent.name && f.path===dtoContent.path)) developerGuide.push(dtoContent);
      if(!architectureDocumentation.some(f=>f.name===dtoContent.name && f.path===dtoContent.path)) architectureDocumentation.push(dtoContent);
    });

    res.json({
      apiDocumentation: allEndpoints,
      developerGuide,
      architectureDocumentation,
      onboardingDocument,
      userManual
    });
  }catch(err){
    console.error(err);
    res.status(500).json({error:"Parsing failed", details:err.message});
  }
});

module.exports = parserRoute;
