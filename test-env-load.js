// Quick test script to verify .env loading
const path = require('path');
const fs = require('fs');

// Simulate production path
const resourcesPath = process.argv[2] || path.join(__dirname, 'release', 'mac-arm64', 'Ofofo Integration Agent.app', 'Contents', 'Resources');
const envPath = path.join(resourcesPath, '.env');

console.log('Testing .env loading...');
console.log('Resources path:', resourcesPath);
console.log('Env file path:', envPath);
console.log('File exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  console.log('\n.env file content:');
  console.log(content.substring(0, 500));
  
  const hasKey = content.includes('AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING');
  console.log('\nContains AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING:', hasKey);
  
  // Test dotenv parsing
  require('dotenv').config({ path: envPath });
  const connStr = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
  console.log('\nAfter dotenv load:');
  console.log('Key exists:', !!connStr);
  console.log('Key length:', connStr ? connStr.length : 0);
  console.log('Key value (first 50 chars):', connStr ? connStr.substring(0, 50) : 'N/A');
}

