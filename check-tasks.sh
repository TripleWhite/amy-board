#!/bin/bash
# 检查 Amy Board 是否有新启动的任务

cd /Users/Zhuanz/.openclaw/workspace/amy-board

# 登录并获取 cookie
COOKIE=$(mktemp)
curl -s -c "$COOKIE" -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"0130"}' > /dev/null

# 获取所有进行中的任务
TASKS=$(curl -s -b "$COOKIE" "http://localhost:3000/api/tasks?status=doing")

# 检查是否有新任务（只检查最近 2 分钟的）
echo "$TASKS" | python3 -c "
import sys, json, datetime
tasks = json.load(sys.stdin)
now = datetime.datetime.now()
new_tasks = []
for t in tasks:
    try:
        created = datetime.datetime.strptime(t['created_at'].replace('T', ' ')[:19], '%Y-%m-%d %H:%M:%S')
        if (now - created).total_seconds() < 120:  # 2 分钟内
            new_tasks.append(t)
    except:
        pass

if new_tasks:
    print('═'*40)
    print('  🚀 新任务启动')
    for t in new_tasks:
        p = ['🔴 P0紧急','🟡 P1重要','🟢 P2普通'][t['priority']]
        print(f'  📝 {t[\"title\"]}')
        print(f'  📋 {p}')
        print(f'  📄 {t.get(\"description\", \"无描述\")}')
        print()
    print('═'*40)
"

rm -f "$COOKIE"
