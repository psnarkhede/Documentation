const express = require("express");
const axios = require('axios');

const fileRetrievarRoute = express.Router();

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

fileRetrievarRoute.post("/", async (req, res) => {
  try {
        const items = req.body; // Accept old style array directly
        if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array of files' });

        const endpoints = await fetchAllFiles(items);
        res.json({ endpoints });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Parsing failed', details: err.message });
    }
});

module.exports = fileRetrievarRoute;
