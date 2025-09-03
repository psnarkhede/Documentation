const express = require('express');
const app = express();
app.use(express.json());
const PORT = 3000;

const parserRoute = require('./parser');
const fileRetrievarRoute = require('./file-Retrievar');

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the Parser API' });
});

app.use('/parse', parserRoute);
app.use('/files', fileRetrievarRoute);

app.listen(PORT, () => console.log(`🚀 Parser API running at http://localhost:${PORT}`));
