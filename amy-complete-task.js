#!/usr/bin/env node
/**
 * Amy 执行完成任务脚本
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, '.cookie');
const API_BASE = 'http://localhost:3000';

const taskId = process.argv[2];
if (!taskId) {
  console.error('用法: node amy-complete-task.js <任务ID>');
  process.exit(1);
}

function getCookie() {
  if (!fs.existsSync(COOKIE_FILE)) {
    console.error('错误: 未找到 cookie 文件');
    process.exit(1);
  }
  return fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
}

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method,
      headers: {
        'Cookie': getCookie(),
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve(body); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log(`🚀 开始处理任务 ${taskId}\n`);
  
  console.log('📝 更新状态为「待确认」...');
  await request('POST', `/api/tasks/${taskId}/status`, { status: 'review' });
  console.log('✅ 状态已更新\n');
  
  console.log('💬 添加评论「可以」...');
  await request('POST', `/api/comments/${taskId}/comments`, { content: '可以', author: 'Amy' });
  console.log('✅ 评论已添加\n');
  
  console.log('═'.repeat(40));
  console.log('  ✅ 任务完成！等待左右确认');
  console.log('═'.repeat(40));
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
