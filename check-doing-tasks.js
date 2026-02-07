#!/usr/bin/env node
const http = require('http');
const fs = require('fs');

const cookie = fs.readFileSync('/Users/Zhuanz/.openclaw/workspace/amy-board/.cookie', 'utf-8').trim();

const options = {
  hostname: '34.228.81.15',
  port: 3000,
  path: '/api/tasks?status=doing',
  method: 'GET',
  headers: {
    'Cookie': cookie
  },
  timeout: 8000
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Data:', data);
  });
});

req.on('error', (e) => {
  console.log('Error:', e.message);
});

req.on('timeout', () => {
  console.log('Timeout');
  req.destroy();
});

req.end();
