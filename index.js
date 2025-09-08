const express = require('express');
const app = express();
app.use(express.json());
const PORT = 3000;

const parserRoute = require('./parser');

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the Parser API' });
});

app.use('/parse', parserRoute);

app.listen(PORT, () => console.log(`🚀 Parser API running at http://localhost:${PORT}`));
