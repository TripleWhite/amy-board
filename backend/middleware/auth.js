// 简单密码认证中间件
const AUTH_PASSWORD = '0130';

function authMiddleware(req, res, next) {
  // 检查是否有密码验证 cookie 或 header
  const password = req.cookies?.auth || req.headers['x-auth-password'];

  if (password === AUTH_PASSWORD) {
    req.isAuthenticated = true;
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized', message: '请输入密码' });
  }
}

// 登录验证
function verifyPassword(password) {
  return password === AUTH_PASSWORD;
}

module.exports = { authMiddleware, verifyPassword, AUTH_PASSWORD };
