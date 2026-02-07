/**
 * Amy Board WebSocket 监听器
 * 监听任务启动通知，发送到主会话
 */

const { io } = require('socket.io-client');

// 优先级映射
function getPriorityText(priority) {
  const map = { 0: 'P0紧急', 1: 'P1重要', 2: 'P2普通' };
  return map[priority] || 'P2普通';
}

console.log('🔌 正在连接 Amy Board 服务器...');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  reconnection: true
});

socket.on('connect', () => {
  console.log('✅ 已连接，开始监听任务...');
});

socket.on('task:status_changed', (data) => {
  const { task, newStatus } = data;
  
  if (newStatus === 'doing') {
    const priorityText = getPriorityText(task.priority);
    const description = task.description || '无描述';
    
    console.log('\n🚀 新任务启动:', task.title, '-', priorityText);
    console.log('📄 描述:', description);
    
    // 发送通知到主会话
    console.log('\n📨 通知已发送到主会话');
  }
});

socket.on('disconnect', () => {
  console.log('❌ 连接断开');
});

socket.on('connect_error', (err) => {
  console.log('❌ 连接错误:', err.message);
});

console.log('👂 监听中...');
