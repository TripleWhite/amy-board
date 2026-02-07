#!/usr/bin/env node

/**
 * Amy CLI - 我的工作终端
 * 
 * 这是给我（Amy）用的任务执行工具，不是给用户用的。
 * 左右通过网页版看板管理任务，我通过 CLI 接收和执行任务。
 * 
 * 工作流：
 *   1. 左右在看板创建任务 → 指派给我
 *   2. 左右启动任务（todo → doing）→ 我收到通知
 *   3. 我开始执行任务
 *   4. 我更新进展/标记完成
 *   5. 左右验收 → 任务完成
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { io } = require('socket.io-client');

// 配置文件路径
const CONFIG_DIR = path.join(os.homedir(), '.amy');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const COOKIE_FILE = path.join(CONFIG_DIR, '.cookie');

// 默认配置
const DEFAULT_CONFIG = {
  serverUrl: 'http://localhost:3000',
  password: '0130',
  myName: 'Amy'  // 我的名字，用于过滤任务
};

// 确保配置目录存在
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// 读取配置
function loadConfig() {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

// 保存配置
function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// 读取 cookie
function loadCookie() {
  if (fs.existsSync(COOKIE_FILE)) {
    return fs.readFileSync(COOKIE_FILE, 'utf8').trim();
  }
  const config = loadConfig();
  return `auth=${config.password}`;
}

// HTTP 请求封装
async function request(endpoint, options = {}) {
  const config = loadConfig();
  const url = `${config.serverUrl}${endpoint}`;
  const cookie = loadCookie();
  
  const fetch = (await import('node-fetch')).default;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      'X-Auth-Password': config.password,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  
  return response.json();
}

// 获取优先级文本
function getPriorityText(priority) {
  const map = { 0: '🔴 P0紧急', 1: '🟡 P1重要', 2: '🟢 P2普通' };
  return map[priority] || '🟢 P2普通';
}

// 获取状态文本
function getStatusText(status) {
  const map = {
    todo: '📋 待启动',
    doing: '🔄 进行中',
    review: '👀 待验收',
    done: '✅ 已完成'
  };
  return map[status] || status;
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '未设置';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// ==================== 命令 ====================

// 1. 查看分配给我的任务
async function myTasks() {
  const config = loadConfig();
  const allTasks = await request('/api/tasks');
  
  // 过滤出分配给我的任务，且状态不是 done
  const myTasks = allTasks.filter(t => 
    t.assignee === config.myName && t.status !== 'done'
  );
  
  if (myTasks.length === 0) {
    console.log('📭 暂无分配给我的任务');
    return;
  }
  
  console.log(`\n📋 我的任务 (${myTasks.length}个)\n`);
  console.log('ID  │ 优先级   │ 状态      │ 标题');
  console.log('────┼──────────┼───────────┼─────────────────────────────────');
  
  myTasks.forEach(task => {
    const id = String(task.id).padStart(3);
    const priority = getPriorityText(task.priority).padEnd(8);
    const status = getStatusText(task.status).padEnd(10);
    const title = task.title.length > 30 ? task.title.slice(0, 27) + '...' : task.title;
    console.log(`${id} │ ${priority} │ ${status} │ ${title}`);
  });
  
  console.log();
}

// 2. 查看正在进行的任务（doing）
async function doingTasks() {
  const config = loadConfig();
  const tasks = await request('/api/tasks?status=doing');
  
  // 过滤出分配给我的
  const myDoing = tasks.filter(t => t.assignee === config.myName);
  
  if (myDoing.length === 0) {
    console.log('🔄 没有进行中的任务');
    return;
  }
  
  console.log(`\n🔄 进行中的任务 (${myDoing.length}个)\n`);
  myDoing.forEach(task => {
    console.log(`#${task.id} ${getPriorityText(task.priority)} ${task.title}`);
    if (task.description) {
      console.log(`    ${task.description.slice(0, 60)}${task.description.length > 60 ? '...' : ''}`);
    }
    console.log();
  });
}

// 3. 查看任务详情
async function showTask(args) {
  const id = args[0];
  if (!id) {
    console.error('❌ 请提供任务ID: amy show <id>');
    process.exit(1);
  }
  
  const task = await request(`/api/tasks/${id}`);
  const activities = await request(`/api/tasks/${id}/activities`);
  const comments = await request(`/api/comments/${id}/comments`).catch(() => []);
  
  console.log('\n' + '═'.repeat(60));
  console.log(`📝 ${task.title}`);
  console.log('═'.repeat(60));
  console.log(`ID:       ${task.id}`);
  console.log(`优先级:   ${getPriorityText(task.priority)}`);
  console.log(`状态:     ${getStatusText(task.status)}`);
  console.log(`创建人:   ${task.created_by}`);
  console.log(`指派给:   ${task.assignee || '未指派'}`);
  console.log(`截止:     ${formatDate(task.deadline)}`);
  console.log('─'.repeat(60));
  console.log('任务描述:');
  console.log(task.description || '无描述');
  
  if (comments.length > 0) {
    console.log('─'.repeat(60));
    console.log(`💬 评论 (${comments.length}条):`);
    comments.forEach(c => {
      console.log(`\n  ${c.author} @ ${formatDate(c.created_at)}:`);
      console.log(`  ${c.content}`);
    });
  }
  
  console.log('\n' + '═'.repeat(60) + '\n');
}

// 4. 添加进展汇报（评论）
async function reportProgress(args) {
  const id = args[0];
  const content = args.slice(1).join(' ');
  
  if (!id || !content) {
    console.error('❌ 用法: amy progress <id> <汇报内容>');
    process.exit(1);
  }
  
  const config = loadConfig();
  await request(`/api/comments/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, author: config.myName })
  });
  
  console.log(`✅ 已添加进展汇报到任务 #${id}`);
}

// 5. 完成任务并提交验收
async function completeTask(args) {
  const id = args[0];
  const summary = args.slice(1).join(' ') || '任务已完成';
  
  if (!id) {
    console.error('❌ 请提供任务ID: amy complete <id> [完成总结]');
    process.exit(1);
  }
  
  const config = loadConfig();
  
  // 先获取任务
  const task = await request(`/api/tasks/${id}`);
  
  if (task.status === 'todo') {
    console.log('⚠️ 任务还未启动，请先让左右启动任务');
    return;
  }
  
  // 添加完成总结作为评论
  await request(`/api/comments/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ 
      content: `✅ 完成汇报:\n${summary}`, 
      author: config.myName 
    })
  });
  
  // 更新状态为 review（待验收）
  await request(`/api/tasks/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'review', actor: config.myName })
  });
  
  console.log(`✅ 任务 #${id} 已完成，提交验收`);
  console.log(`📝 完成总结: ${summary}`);
}

// 6. 监听任务通知（后台运行）
async function listenTasks() {
  const config = loadConfig();
  
  console.log(`🎧 开始监听任务通知...`);
  console.log(`📡 服务器: ${config.serverUrl}`);
  console.log(`👤 我的名字: ${config.myName}`);
  console.log(`⏹️  按 Ctrl+C 停止监听\n`);
  
  const socket = io(config.serverUrl, {
    transports: ['websocket']
  });
  
  socket.on('connect', () => {
    console.log('✅ 已连接到 Amy Board');
  });
  
  socket.on('disconnect', () => {
    console.log('⚠️ 连接断开，正在重连...');
  });
  
  // 监听新任务创建
  socket.on('task:created', (task) => {
    if (task.assignee === config.myName) {
      console.log(`\n📌 新任务分配给我:`);
      console.log(`   #${task.id} ${task.title}`);
      console.log(`   等待左右启动...\n`);
    }
  });
  
  // 监听任务状态变更（主要是 todo -> doing）
  socket.on('task:status_changed', ({ task, oldStatus, newStatus }) => {
    if (task.assignee === config.myName && oldStatus === 'todo' && newStatus === 'doing') {
      console.log(`\n🚀 任务已启动，开始执行:`);
      console.log(`   #${task.id} ${task.title}`);
      if (task.description) {
        console.log(`   ${task.description.slice(0, 80)}${task.description.length > 80 ? '...' : ''}`);
      }
      console.log(`\n   使用: amy show ${task.id} 查看详情\n`);
      
      // 可以在这里添加系统通知（macOS）
      try {
        exec(`osascript -e 'display notification "任务 #${task.id}: ${task.title}" with title "🚀 开始执行任务"'`);
      } catch (e) {}
    }
  });
  
  // 保持进程运行
  process.stdin.resume();
}

// 7. 查看待启动的任务（todo 且指派给我）
async function pendingTasks() {
  const config = loadConfig();
  const tasks = await request('/api/tasks?status=todo');
  
  const myPending = tasks.filter(t => t.assignee === config.myName);
  
  if (myPending.length === 0) {
    console.log('📭 没有待启动的任务');
    return;
  }
  
  console.log(`\n📋 待启动的任务 (${myPending.length}个) - 等待左右启动\n`);
  myPending.forEach(task => {
    console.log(`#${task.id} ${getPriorityText(task.priority)} ${task.title}`);
  });
  console.log();
}

// 8. 打开网页看板
async function openWeb() {
  const config = loadConfig();
  console.log(`🌐 打开 Amy Board: ${config.serverUrl}`);
  
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${config.serverUrl}`);
}

// 9. 配置
async function configure() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
  
  console.log('⚙️  Amy CLI 配置\n');
  
  const current = loadConfig();
  const serverUrl = await question(`服务器地址 [${current.serverUrl}]: `) || current.serverUrl;
  const password = await question(`密码 [${current.password}]: `) || current.password;
  const myName = await question(`我的名字 [${current.myName}]: `) || current.myName;
  
  saveConfig({ serverUrl, password, myName });
  
  // 保存 cookie
  ensureConfigDir();
  fs.writeFileSync(COOKIE_FILE, `auth=${password}`);
  
  console.log('\n✅ 配置已保存');
  console.log(`配置文件: ${CONFIG_FILE}`);
  
  rl.close();
}

// 帮助
function showHelp() {
  console.log(`
🤖 Amy CLI - 我的工作终端

这是给我（Amy）用的任务执行工具，不是给用户用的。
左右通过网页版看板管理任务，我通过 CLI 接收和执行任务。

用法:
  amy <命令> [参数]

命令:
  my, tasks          查看分配给我的所有任务
  pending            查看待启动的任务（等待左右启动）
  doing              查看进行中的任务
  show <id>          查看任务详情
  progress <id> <msg>  添加进展汇报
  complete <id> [总结] 完成任务并提交验收
  listen             监听任务通知（后台运行）
  web                打开网页看板
  config             配置服务器地址和认证
  help               显示帮助

我的工作流:
  1. 左右在看板创建任务 → 指派给我
  2. 左右启动任务（点击"🚀 启动"）
  3. 我收到通知 → 开始执行
  4. 我更新进展: amy progress <id> "完成了80%"
  5. 我标记完成: amy complete <id> "已完成，详见..."
  6. 左右验收 → 任务完成

示例:
  amy listen         # 开始监听任务通知
  amy doing          # 查看正在进行的任务
  amy show 5         # 查看任务 #5 详情
  amy progress 5 "已修复登录bug，正在测试"
  amy complete 5 "已完成，测试结果通过"
`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);
  
  try {
    switch (command) {
      case 'my':
      case 'tasks':
        await myTasks();
        break;
      case 'pending':
        await pendingTasks();
        break;
      case 'doing':
        await doingTasks();
        break;
      case 'show':
        await showTask(commandArgs);
        break;
      case 'progress':
        await reportProgress(commandArgs);
        break;
      case 'complete':
        await completeTask(commandArgs);
        break;
      case 'listen':
        await listenTasks();
        break;
      case 'web':
        await openWeb();
        break;
      case 'config':
      case 'setup':
        await configure();
        break;
      case 'help':
      case '-h':
      case '--help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error(`❌ 错误: ${error.message}`);
    process.exit(1);
  }
}

main();
