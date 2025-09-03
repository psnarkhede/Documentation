const axios = require('axios');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'; // Change this to your Vercel URL when testing

async function testEndpoints() {
    console.log(`Testing endpoints at: ${BASE_URL}`);
    
    try {
        // Test GET / (root endpoint)
        console.log('\n1. Testing GET /');
        const rootResponse = await axios.get(`${BASE_URL}/`);
        console.log('✅ Root endpoint:', rootResponse.data);
        
        // Test GET /health
        console.log('\n2. Testing GET /health');
        const healthResponse = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health endpoint:', healthResponse.data);
        
        // Test POST /parse with sample data
        console.log('\n3. Testing POST /parse');
        const sampleData = [
            {
                type: 'file',
                name: 'test.ts',
                download_url: 'https://raw.githubusercontent.com/example/repo/main/test.ts',
                html_url: 'https://github.com/example/repo/blob/main/test.ts'
            }
        ];
        
        const parseResponse = await axios.post(`${BASE_URL}/parse`, sampleData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('✅ Parse endpoint:', parseResponse.data);
        
    } catch (error) {
        console.error('❌ Error testing endpoints:', error.response?.data || error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        }
    }
}

// Run tests
testEndpoints();
