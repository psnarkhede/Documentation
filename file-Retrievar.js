const express = require("express");
const axios = require('axios');

const fileRetrievarRoute = express.Router();

// Recursive function to fetch all .ts files (excluding .spec.ts)
async function fetchAllFiles(items) {
    let files = [];

    for (const item of items) {
        if (item.type === 'file' && item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts')) {
            // Push only necessary properties
            files.push({
                name: item.name,
                path: item.path,
                download_url: item.download_url,
                type: item.type
            });
        } 
        // else if (item.type === 'dir') {
        //     const response = await axios.get(item.url);
        //     // GitHub API returns the JSON array directly
        //     files = files.concat(await fetchAllFiles(response.data));
        // }
    }

    return files;
}

// POST endpoint to receive GitHub content and return flattened files
fileRetrievarRoute.post("/", async (req, res) => {
    try {
        const items = req.body; // Accept array of files/directories
        if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array of files/directories' });

        const files = await fetchAllFiles(items);

        // Return flat array directly (not wrapped in endpoints)
        res.json(files);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fetching files failed', details: err.message });
    }
});

module.exports = fileRetrievarRoute;
