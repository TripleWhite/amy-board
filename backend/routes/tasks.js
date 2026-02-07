const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyTaskCreated, notifyTaskStatusChanged, notifyOpenClawWebhook } = require('./notify');

// 辅助函数
function getPriorityText(priority) {
  const map = { 0: 'P0紧急', 1: 'P1重要', 2: 'P2普通' };
  return map[priority] || 'P2普通';
}

// 获取所有任务
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, assignee, priority } = req.query;
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (assignee) {
      query += ' AND assignee = ?';
      params.push(assignee);
    }
    if (priority !== undefined) {
      query += ' AND priority = ?';
      params.push(parseInt(priority));
    }

    query += ' ORDER BY priority DESC, created_at DESC';
    const tasks = await all(query, params);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个任务
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建任务
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, priority, deadline, assignee, created_by } = req.body;

    const result = await run(
      `INSERT INTO tasks (title, description, priority, deadline, assignee, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, priority || 1, deadline || null, assignee || null, created_by || 'Unknown']
    );

    const newTask = await get('SELECT * FROM tasks WHERE id = ?', [result.lastInsertRowid]);

    // 记录活动日志
    await run(
      `INSERT INTO activity_logs (task_id, action, new_value, actor)
       VALUES (?, 'created', ?, ?)`,
      [result.lastInsertRowid, JSON.stringify(newTask), created_by || 'Unknown']
    );

    // 发送通知 (不阻塞)
    notifyTaskCreated(newTask, created_by || 'Unknown').catch(err => {
      console.error('Telegram notification failed:', err.message);
    });

    // 通过 WebSocket 广播
    req.app.get('io')?.emit('task:created', newTask);

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
});

// 更新任务
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, priority, deadline, assignee, actor } = req.body;
    const taskId = req.params.id;

    const existingTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await run(
      `UPDATE tasks SET title = ?, description = ?, priority = ?, deadline = ?, assignee = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title, description, priority, deadline || null, assignee || null, taskId]
    );

    const updatedTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);

    // 记录活动日志
    await run(
      `INSERT INTO activity_logs (task_id, action, old_value, new_value, actor)
       VALUES (?, 'updated', ?, ?, ?)`,
      [taskId, JSON.stringify(existingTask), JSON.stringify(updatedTask), actor || 'Unknown']
    );

    // 通过 WebSocket 广播
    req.app.get('io')?.emit('task:updated', updatedTask);

    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新任务状态
router.post('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status, actor } = req.body;
    const taskId = req.params.id;

    if (!['todo', 'doing', 'review', 'done'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existingTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const oldStatus = existingTask.status;
    if (oldStatus === status) {
      return res.json(existingTask);
    }

    await run('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, taskId]);

    const updatedTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);

    // 记录活动日志
    await run(
      `INSERT INTO activity_logs (task_id, action, old_value, new_value, actor)
       VALUES (?, 'status_changed', ?, ?, ?)`,
      [taskId, oldStatus, status, actor || 'Unknown']
    );

    // 发送通知
    notifyTaskStatusChanged(updatedTask, oldStatus, status, actor || 'Unknown').catch(err => {
      console.error('Telegram notification failed:', err.message);
    });

    // Webhook 通知 OpenClaw（当任务指派给 Amy 且状态变为 doing）
    if (updatedTask.assignee === 'Amy' && status === 'doing') {
      notifyOpenClawWebhook('task_started', updatedTask, actor || 'Unknown').catch(err => {
        console.error('[Webhook] Failed:', err.message);
      });
    }

    // 通过 WebSocket 广播
    req.app.get('io')?.emit('task:status_changed', { task: updatedTask, oldStatus, newStatus: status });

    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除任务
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { actor } = req.query;

    const existingTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await run('DELETE FROM tasks WHERE id = ?', [taskId]);

    // 记录活动日志
    await run(
      `INSERT INTO activity_logs (task_id, action, old_value, actor)
       VALUES (?, 'deleted', ?, ?)`,
      [taskId, JSON.stringify(existingTask), actor || 'Unknown']
    );

    // 通过 WebSocket 广播
    req.app.get('io')?.emit('task:deleted', { taskId });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取任务活动日志
router.get('/:id/activities', authMiddleware, async (req, res) => {
  try {
    const logs = await all('SELECT * FROM activity_logs WHERE task_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动任务（待指派 → 进行中）
router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { actor } = req.body;

    const existingTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (existingTask.status !== 'todo') {
      return res.status(400).json({ error: 'Only todo tasks can be started' });
    }

    // 更新状态为进行中
    await run('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['doing', taskId]);

    const updatedTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);

    // 记录活动日志
    await run(
      `INSERT INTO activity_logs (task_id, action, old_value, new_value, actor)
       VALUES (?, 'started', 'todo', 'doing', ?)`,
      [taskId, actor || '左右']
    );

    // 通知 Amy
    const notifyMessage = `🚀 新任务启动: ${updatedTask.title}\n\n优先: ${getPriorityText(updatedTask.priority)}\n描述: ${updatedTask.description || '无'}\n\n请开始执行！`;
    notifyTaskStatusChanged(updatedTask, 'todo', 'doing', actor || '左右', notifyMessage).catch(err => {
      console.error('Telegram notification failed:', err.message);
    });

    // Webhook 通知 OpenClaw（当任务指派给 Amy）
    if (updatedTask.assignee === 'Amy') {
      notifyOpenClawWebhook('task_started', updatedTask, actor || '左右').catch(err => {
        console.error('[Webhook] Failed:', err.message);
      });
    }

    // 通过 WebSocket 广播
    console.log(`[WebSocket 广播] task:status_changed - ${updatedTask.title} (todo -> doing)`);
    req.app.get('io')?.emit('task:status_changed', { 
      task: updatedTask, 
      oldStatus: 'todo', 
      newStatus: 'doing' 
    });

    res.json({ success: true, task: updatedTask });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 查看进展
router.get('/:id/progress', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;

    const task = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // 获取评论（作为进展记录）
    const comments = await all(
      'SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC',
      [taskId]
    );

    // 获取活动日志
    const logs = await all(
      'SELECT * FROM activity_logs WHERE task_id = ? ORDER BY created_at DESC',
      [taskId]
    );

    // 构建进展描述
    let progressText = '';
    if (task.status === 'doing') {
      progressText = `🔄 任务进行中...\n\n最后更新: ${task.updated_at}`;
    } else if (task.status === 'review') {
      progressText = `👀 待确认\n\n请查看任务详情并决定是否通过。`;
    } else if (task.status === 'done') {
      progressText = `✅ 任务已完成`;
    } else {
      progressText = `📋 待启动`;
    }

    res.json({
      task,
      comments,
      logs,
      progress: progressText
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 完成/未完成任务（待确认 → 完成/进行中）
router.post('/:id/complete', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { completed, actor } = req.body;

    const existingTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (existingTask.status !== 'review') {
      return res.status(400).json({ error: 'Only review tasks can be completed' });
    }

    const newStatus = completed ? 'done' : 'doing';
    await run('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, taskId]);

    const updatedTask = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);

    // 记录活动日志
    await run(
      `INSERT INTO activity_logs (task_id, action, old_value, new_value, actor)
       VALUES (?, 'completed', 'review', ?, ?)`,
      [taskId, newStatus, actor || '左右']
    );

    // 通知
    const notifyMessage = completed 
      ? `✅ 任务已完成: ${updatedTask.title}`
      : `❌ 任务未通过，需继续修改: ${updatedTask.title}`;
    notifyTaskStatusChanged(updatedTask, 'review', newStatus, actor || '左右', notifyMessage).catch(err => {
      console.error('Telegram notification failed:', err.message);
    });

    // WebSocket 广播
    req.app.get('io')?.emit('task:status_changed', { 
      task: updatedTask, 
      oldStatus: 'review', 
      newStatus 
    });

    res.json({ success: true, task: updatedTask });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
