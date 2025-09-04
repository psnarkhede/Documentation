// const express = require("express");
// const axios = require('axios');

// const fileRetrievarRoute = express.Router();

// // Recursive function to fetch all .ts files (excluding .spec.ts)
// async function fetchAllFiles(items) {
//     let files = [];

//     for (const item of items) {
//         if (item.type === 'file' && item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts')) {
//             // Push only necessary properties
//             files.push({
//                 name: item.name,
//                 path: item.path,
//                 download_url: item.download_url,
//                 type: item.type
//             });
//         } 
//         else if (item.type === 'dir') {
//             const response = await axios.get(item.url);
//             // GitHub API returns the JSON array directly
//             files = files.concat(await fetchAllFiles(response.data));
//         }
//     }

//     return files;
// }

// // POST endpoint to receive GitHub content and return flattened files
// fileRetrievarRoute.post("/", async (req, res) => {
//     try {
//         const items = req.body; // Accept array of files/directories
//         if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array of files/directories' });

//         const files = await fetchAllFiles(items);

//         // Return flat array directly (not wrapped in endpoints)
//         res.json(files);

//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: 'Fetching files failed', details: err.message });
//     }
// });

// module.exports = fileRetrievarRoute;


// Above code is for developer guide


const express = require("express");
const axios = require("axios");

const fileRetrievarRoute = express.Router();

// Important root-level files for onboarding docs
const importantFiles = [
  "README.md",
  "package.json",
  "swagger.json",
  "developerGuide.text",
  "nest-cli.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "vercel.json"
];

// Recursive function to fetch files
async function fetchAllFiles(items) {
  let files = [];

  for (const item of items) {
    // ✅ Include important root/project files
    if (item.type === "file" && importantFiles.includes(item.name)) {
      files.push({
        name: item.name,
        path: item.path,
        download_url: item.download_url,
        type: item.type,
      });
    }

    // ✅ Include .ts files except *.spec.ts
    else if (
      item.type === "file" &&
      item.name.endsWith(".ts") &&
      !item.name.endsWith(".spec.ts")
    ) {
      files.push({
        name: item.name,
        path: item.path,
        download_url: item.download_url,
        type: item.type,
      });
    }

    // ✅ Recurse into directories (src, dto, etc.)
    else if (item.type === "dir") {
      const response = await axios.get(item.url);
      files = files.concat(await fetchAllFiles(response.data));
    }
  }

  return files;
}

// POST endpoint to receive GitHub content and return flattened files
fileRetrievarRoute.post("/", async (req, res) => {
  try {
    const items = req.body; // Accept array of files/directories
    if (!Array.isArray(items))
      return res
        .status(400)
        .json({ error: "Expected array of files/directories" });

    const files = await fetchAllFiles(items);

    // Return flat array directly
    res.json(files);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Fetching files failed", details: err.message });
  }
});

module.exports = fileRetrievarRoute;

