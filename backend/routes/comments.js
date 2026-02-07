const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyNewComment } = require('./notify');

// 获取任务的评论
router.get('/:taskId/comments', authMiddleware, async (req, res) => {
  try {
    const comments = await all('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC', [req.params.taskId]);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 添加评论
router.post('/:taskId/comments', authMiddleware, async (req, res) => {
  try {
    const { content, author } = req.body;
    const taskId = req.params.taskId;

    const task = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const result = await run(
      `INSERT INTO comments (task_id, content, author) VALUES (?, ?, ?)`,
      [taskId, content, author || 'Unknown']
    );

    const newComment = await get('SELECT * FROM comments WHERE id = ?', [result.lastInsertRowid]);

    // 记录活动日志
    await run(
      `INSERT INTO activity_logs (task_id, action, new_value, actor)
       VALUES (?, 'comment_added', ?, ?)`,
      [taskId, JSON.stringify(newComment), author || 'Unknown']
    );

    // 发送通知
    notifyNewComment(task, newComment, author || 'Unknown').catch(err => {
      console.error('Telegram notification failed:', err.message);
    });

    // 通过 WebSocket 广播
    req.app.get('io')?.emit('comment:added', { taskId, comment: newComment });

    res.status(201).json(newComment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除评论
router.delete('/:taskId/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const { taskId, commentId } = req.params;

    const comment = await get('SELECT * FROM comments WHERE id = ? AND task_id = ?', [commentId, taskId]);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await run('DELETE FROM comments WHERE id = ?', [commentId]);

    // 通过 WebSocket 广播
    req.app.get('io')?.emit('comment:deleted', { taskId, commentId });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
