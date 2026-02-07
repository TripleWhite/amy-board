#!/usr/bin/env node
/**
 * Amy Board Cron 检查脚本
 * 功能：检查是否有最近启动的任务
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./backend/db');

const PORT = 3000;
const HOST = 'localhost';
const RECENT_MINUTES = 1; // 检查最近 1 分钟

async function checkTasks() {
  try {
    await db.initDB();
    
    const now = Date.now();
    const cutoff = new Date(now - RECENT_MINUTES * 60 * 1000).toISOString();
    
    const tasks = await db.all(
      'SELECT * FROM tasks WHERE status = ? AND created_at > ?',
      ['doing', cutoff]
    );
    
    if (tasks.length > 0) {
      console.log('═'.repeat(40));
      console.log('  🚀 新任务启动');
      tasks.forEach(t => {
        const p = ['🔴 P0紧急','🟡 P1重要','🟢 P2普通'][t.priority] || '🟢 P2';
        console.log('  📝', t.title);
        console.log('  📋', p);
        console.log('  📄', t.description || '无描述');
        console.log('');
      });
      console.log('═'.repeat(40));
    } else {
      console.log(`最近 ${RECENT_MINUTES} 分钟没有新任务`);
    }
    
    // 列出所有进行中的任务
    const doingTasks = await db.all(
      'SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC',
      ['doing']
    );
    
    if (doingTasks.length > 0) {
      console.log('\n📋 进行中的任务:');
      doingTasks.forEach(t => {
        console.log('  -', t.title, '(' + t.status + ')');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

checkTasks();
