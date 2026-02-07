const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initDB } = require('./db');
const tasksRouter = require('./routes/tasks');
const commentsRouter = require('./routes/comments');
const { verifyPassword, AUTH_PASSWORD } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 中间件
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../frontend')));

// 挂载 io 到 app
app.set('io', io);

// 登录接口
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (verifyPassword(password)) {
    res.cookie('auth', password, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24小时
    });
    res.json({ success: true, message: '登录成功' });
  } else {
    res.status(401).json({ success: false, message: '密码错误' });
  }
});

// 验证登录状态
app.get('/api/check-auth', (req, res) => {
  const password = req.cookies?.auth || req.headers['x-auth-password'];
  res.json({ authenticated: password === AUTH_PASSWORD });
});

// 路由
app.use('/api/tasks', tasksRouter);
app.use('/api/comments', commentsRouter);

// 静态文件服务 - 前端
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// WebSocket 连接处理
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 初始化数据库并启动服务器
const PORT = process.env.PORT || 3000;

initDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Amy Board 服务器运行在 http://0.0.0.0:${PORT}`);
    console.log(`📋 密码: ${AUTH_PASSWORD}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
