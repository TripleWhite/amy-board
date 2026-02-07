/**
 * Amy Board 任务监听器 - 常驻后台运行
 * 自动重连，确保稳定接收任务通知
 */

const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const NOTIFICATIONS_FILE = path.join(__dirname, '.amy-board-notifications.json');
const PID_FILE = path.join(__dirname, '.amy-listener.pid');

const socket = io('http://localhost:3001', { 
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 3000,
  reconnectionAttempts: Infinity
});

// 保存 PID
fs.writeFileSync(PID_FILE, process.pid.toString());

// 加载已有通知
function loadNotifications() {
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

// 保存通知
function saveNotifications(notifications) {
  fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

function getPriorityText(priority) {
  return ['🔴 P0紧急', '🟡 P1重要', '🟢 P2普通'][priority] || '🟢 P2';
}

let reconnectCount = 0;

socket.on('connect', () => {
  reconnectCount = 0;
  console.log(`[${new Date().toLocaleString()}] ✅ 已连接`);
});

socket.on('disconnect', () => {
  console.log(`[${new Date().toLocaleString()}] ❌ 连接断开`);
});

socket.on('task:status_changed', (data) => {
  if (data.newStatus === 'doing') {
    const notification = {
      id: Date.now(),
      title: data.task.title,
      priority: getPriorityText(data.task.priority),
      description: data.task.description || '无描述',
      created_at: new Date().toISOString()
    };
    
    // 保存到文件
    const notifications = loadNotifications();
    notifications.unshift(notification);
    if (notifications.length > 50) notifications.pop();
    saveNotifications(notifications);
    
    const p = getPriorityText(data.task.priority);
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('🚀 新任务启动');
    console.log('📝 ' + data.task.title);
    console.log('📋 ' + p);
    console.log('📄 ' + (data.task.description || '无描述'));
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('💾 通知已保存');
  }
});

socket.on('connect_error', (err) => {
  reconnectCount++;
  if (reconnectCount % 5 === 0) {
    console.log(`[${new Date().toLocaleString()}] 重连中... (${reconnectCount} 次)`);
  }
});

// 定期自我检查，确保进程存活
setInterval(() => {
  // 如果 socket 断开了，尝试重连
  if (!socket.connected) {
    socket.connect();
  }
}, 5000);

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('正在关闭...');
  fs.unlinkSync(PID_FILE);
  socket.disconnect();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('正在关闭...');
  fs.unlinkSync(PID_FILE);
  socket.disconnect();
  process.exit(0);
});

console.log(`[${new Date().toLocaleString()}] 👂 监听中...（PID: ${process.pid}）`);
