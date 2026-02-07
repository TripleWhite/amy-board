/**
 * Amy Board WebSocket 客户端
 * 监听任务状态变更通知
 * 
 * 使用方式:
 *   node amy-board-ws-listener.js
 * 
 * 环境变量:
 *   NOTIFY_API_URL - 通知 API 地址 (默认: http://localhost:3000/api/notify)
 *   SESSION_KEY - 会话密钥 (默认: agent:main:main)
 */

const { io } = require('socket.io-client');

const WS_URL = process.env.WS_URL || 'http://localhost:3000';
const NOTIFY_API_URL = process.env.NOTIFY_API_URL || 'http://localhost:3000/api/notify';
const SESSION_KEY = process.env.SESSION_KEY || 'agent:main:main';

// 优先级映射
function getPriorityText(priority) {
  const map = { 0: 'P0紧急', 1: 'P1重要', 2: 'P2普通' };
  return map[priority] || 'P2普通';
}

// 发送通知到主会话
async function notifyMainSession(message) {
  try {
    // 方式1: 尝试 HTTP API
    try {
      const response = await fetch(NOTIFY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: SESSION_KEY, message })
      });
      
      if (response.ok) {
        console.log('✅ 通知已发送 (HTTP API)');
        return true;
      }
    } catch (e) { /* 继续尝试其他方式 */ }
    
    // 方式2: 通过 stdout 输出 (供主进程捕获)
    console.log('\n' + '='.repeat(50));
    console.log('📨 NOTIFICATION');
    console.log('='.repeat(50));
    console.log(message);
    console.log('='.repeat(50) + '\n');
    console.log('🔔 请将此通知发送给 Amy');
    
    return true;
  } catch (error) {
    console.log('⚠️ 通知发送失败:', error.message);
    return false;
  }
}

// 连接到 WebSocket 服务器
console.log('🔌 正在连接到 Amy Board 服务器...');

const socket = io(WS_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity
});

// 连接成功
socket.on('connect', () => {
  console.log('✅ 已连接到 Amy Board 服务器');
  console.log('👂 开始监听任务状态变更...');
});

// 连接断开
socket.on('disconnect', (reason) => {
  console.log('❌ 连接断开:', reason);
  console.log('🔄 正在尝试重连...');
});

// 连接错误
socket.on('connect_error', (error) => {
  console.log('❌ 连接错误:', error.message);
});

// 监听任务状态变更
socket.on('task:status_changed', (data) => {
  const { task, oldStatus, newStatus } = data;
  
  console.log(`\n📋 任务状态变更:`);
  console.log(`   任务: ${task.title}`);
  console.log(`   状态: ${oldStatus} → ${newStatus}`);
  
  // 只处理状态变为 "doing" 的情况
  if (newStatus === 'doing') {
    const priorityText = getPriorityText(task.priority);
    const description = task.description || '无描述';
    
    const notification = `🚀 新任务启动：${task.title} - ${priorityText} - ${description}`;
    
    console.log(`\n🎯 检测到新任务启动!`);
    console.log(`   通知内容: ${notification}`);
    
    // 发送通知到主会话
    notifyMainSession(notification);
  }
});

// 监听任务创建
socket.on('task:created', (task) => {
  console.log(`\n📝 新任务创建: ${task.title}`);
});

// 监听任务删除
socket.on('task:deleted', (data) => {
  console.log(`\n🗑️ 任务已删除: ID=${data.taskId}`);
});

// 保持进程运行
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭连接...');
  socket.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 正在关闭连接...');
  socket.disconnect();
  process.exit(0);
});
