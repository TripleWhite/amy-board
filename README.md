# Amy Board 任务完成脚本

## 使用方法

### 1. 设置 Cookie 认证

登录 Amy Board 后，将 cookie 保存到 `.cookie` 文件：

```bash
echo "session=你的cookie值" > /Users/Zhuanz/.openclaw/workspace/amy-board/.cookie
```

### 2. 运行脚本

完成任务后，执行：

```bash
node /Users/Zhuanz/.openclaw/workspace/amy-board/amy-complete-task.js <任务ID>
```

示例：
```bash
node /Users/Zhuanz/.openclaw/workspace/amy-board/amy-complete-task.js 1
```

## 脚本功能

1. **更新任务状态**：将任务状态改为 `review`（待确认）
2. **添加评论**：在任务下评论 `可以`

## API 端点

- 更新状态: `POST /api/tasks/:id/status`
- 添加评论: `POST /api/comments/:taskId/comments`
