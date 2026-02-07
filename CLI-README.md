# Amy CLI - 任务管理命令行工具

Amy Board 的命令行客户端，让你无需打开浏览器即可管理任务。

## 安装

```bash
# 在 amy-board 目录下运行
npm link
```

这会将 `amy` 命令链接到全局，你可以在任何地方使用。

## 首次配置

```bash
amy config
```

按提示输入：
- 服务器地址 (默认: http://localhost:3000)
- 密码 (默认: 0130)
- 用户名 (默认: 左右)

## 命令列表

### 查看任务
```bash
amy list              # 列出所有任务
amy list todo         # 列出待办任务
amy list doing        # 列出进行中任务
amy list review       # 列出待确认任务
amy list done         # 列出已完成任务
```

### 任务操作
```bash
amy start 5           # 启动任务 #5 (todo → doing)
amy done 5            # 完成任务 #5
done 5 "已完成主要功能"  # 完成任务并添加评论
```

### 创建和查看
```bash
amy create "修复登录bug"                    # 创建新任务
amy create "优化性能" --priority 0          # 创建紧急任务
amy show 5                                  # 查看任务 #5 详情
amy comment 5 "需要确认这个细节"             # 添加评论
```

### 其他
```bash
amy web               # 打开网页版看板
amy config            # 修改配置
amy help              # 显示帮助
```

## 输出示例

```
$ amy list doing

📋 任务列表

ID  │ 优先级   │ 状态      │ 标题
────┼──────────┼───────────┼─────────────────────────────────
  5 │ 🟡 P1重要 │ 🔄 进行中 │ 完善 CLI 工具
  3 │ 🔴 P0紧急 │ 🔄 进行中 │ 修复登录bug

共 2 个任务

$ amy show 5

══════════════════════════════════════════════════
📝 完善 CLI 工具 amy（完整的命令行客户端）
══════════════════════════════════════════════════
ID:       5
优先级:   🟡 P1重要
状态:     🔄 进行中
创建人:   左右
指派给:   Amy
截止:     未设置
创建:     2月4日 22:58
更新:     2月4日 23:05
──────────────────────────────────────────────────
描述:
创建完整的命令行客户端，支持 list/start/done/comment/create/show/web/config 等命令
══════════════════════════════════════════════════
```

## 配置文件

配置文件存储在：
- `~/.amy/config.json` - 服务器地址和密码
- `~/.amy/.cookie` - 认证 cookie

## 快捷别名

可以添加到 `.bashrc` 或 `.zshrc`：

```bash
alias atodo='amy list todo'      # 查看待办
alias adoing='amy list doing'    # 查看进行中
alias adone='amy done'           # 完成任务
alias aweb='amy web'             # 打开看板
```
