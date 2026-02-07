#!/bin/bash

# Amy Board 部署脚本
# 部署到 AWS EC2 (34.228.81.15)

set -e

# 配置
REMOTE_HOST="34.228.81.15"
REMOTE_USER="ubuntu"
REMOTE_DIR="/home/ubuntu/amy-board"
LOCAL_DIR="/Users/Zhuanz/.openclaw/workspace/amy-board"

echo "🚀 开始部署 Amy Board..."

# 1. 安装依赖
echo "📦 安装本地依赖..."
cd "$LOCAL_DIR"
npm install

# 2. 同步到远程服务器
echo "🔄 同步文件到远程服务器..."
rsync -avz --exclude='node_modules' --exclude='*.log' \
  -e ssh \
  "$LOCAL_DIR/" \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"

# 3. 在远程服务器上安装依赖并重启
echo "⚙️ 远程服务器配置..."
ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
  cd $HOME/amy-board

  # 确保目录存在
  mkdir -p database

  # 安装依赖
  npm install --production

  # 创建环境变量文件
  cat > .env << 'ENV'
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_CHAT_ID
PORT=3000
ENV

  # 停止旧进程
  pkill -f "node backend/server.js" 2>/dev/null || true
  sleep 1

  # 启动服务
  nohup npm start > logs/app.log 2>&1 &
  echo $! > logs/app.pid

  echo "✅ 服务已启动"
  sleep 2

  # 检查服务状态
  if curl -s http://localhost:3000/api/check-auth > /dev/null; then
    echo "✅ 服务运行正常"
  else
    echo "❌ 服务启动失败，查看 logs/app.log"
  fi
EOF

echo ""
echo "🎉 部署完成!"
echo "📋 访问地址: http://$REMOTE_HOST:3000"
echo "🔐 密码: 0130"
