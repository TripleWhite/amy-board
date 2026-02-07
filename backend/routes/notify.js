const axios = require('axios');

// Telegram Bot 配置 (复用 OpenClaw Bot)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID';

// OpenClaw Gateway 配置
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

// 发送 Telegram 消息
async function sendTelegramMessage(text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    });
    console.log('Telegram notification sent');
  } catch (error) {
    console.error('Failed to send Telegram notification:', error.message);
  }
}

// 通知任务创建
async function notifyTaskCreated(task, actor) {
  const priorityEmoji = ['', '🔴', '🟡', '🟢'][task.priority] || '🟢';
  const text = `
${priorityEmoji} <b>新任务创建</b>

📝 <b>${task.title}</b>
📄 ${task.description || '无描述'}
👤 创建人: ${actor}
📅 截止: ${task.deadline || '未设置'}
  `.trim();
  await sendTelegramMessage(text);
}

// 通知任务状态变更
async function notifyTaskStatusChanged(task, oldStatus, newStatus, actor, customMessage = null) {
  let text;
  
  if (customMessage) {
    text = customMessage;
  } else {
    const statusMap = {
      todo: '📋 待指派',
      doing: '🔄 进行中',
      review: '👀 待确认',
      done: '✅ 已完成'
    };
    text = `
🔔 <b>任务状态变更</b>

📝 <b>${task.title}</b>
📍 ${statusMap[oldStatus]} → ${statusMap[newStatus]}
👤 操作人: ${actor}
    `.trim();
  }
  
  await sendTelegramMessage(text);
}

// 通知任务指派
async function notifyTaskAssigned(task, assignee, actor) {
  const text = `
👤 <b>任务指派</b>

📝 <b>${task.title}</b>
🎯 被指派人: ${assignee || '未指派'}
👤 操作人: ${actor}
  `.trim();
  await sendTelegramMessage(text);
}

// 通知新评论
async function notifyNewComment(task, comment, author) {
  const text = `
💬 <b>新评论</b>

📝 <b>${task.title}</b>
💭 ${comment.content}
👤 评论人: ${author}
  `.trim();
  await sendTelegramMessage(text);
}

// Webhook 通知 OpenClaw（通过 Telegram 直接发送消息）
async function notifyOpenClawWebhook(event, task, actor) {
  try {
    // 直接发送任务信息，我会解析并执行
    const text = `
🚀 任务已启动

ID: ${task.id}
标题: ${task.title}
描述: ${task.description || '无'}
优先级: ${['🔴 P0', '🟡 P1', '🟢 P2'][task.priority] || '🟢 P2'}
启动人: ${actor}

请开始执行！
    `.trim();
    
    await sendTelegramMessage(text);
    console.log('[Webhook] Task notification sent to Amy via Telegram');
  } catch (error) {
    console.error('[Webhook] Failed:', error.message);
  }
}

module.exports = {
  sendTelegramMessage,
  notifyTaskCreated,
  notifyTaskStatusChanged,
  notifyTaskAssigned,
  notifyNewComment,
  notifyOpenClawWebhook
};
