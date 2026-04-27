const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

function createAuthMiddleware(db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_username'").get();
    const hashRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_password_hash'").get();

    if (!row || !hashRow) return res.status(401).json({ error: 'Invalid credentials' });

    if (username === row.value && bcrypt.compareSync(password, hashRow.value)) {
      req.session.user = { role: 'admin', name: 'Admin' };
      return res.json({ success: true, user: req.session.user });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  });

  router.post('/pin', (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });

    const staff = db.prepare('SELECT * FROM staff WHERE pin = ? AND active = 1').get(pin);
    if (!staff) return res.status(401).json({ error: 'Invalid PIN' });

    req.session.user = { role: staff.role, name: staff.name, staffId: staff.id };
    res.json({ success: true, user: req.session.user });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user: req.session.user });
  });

  return router;
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.session.user.role) && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function loginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TableFlow POS</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0b;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.login-box{background:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px;width:360px;max-width:90vw}
.login-box h1{font-size:24px;text-align:center;margin-bottom:8px}
.login-box p{text-align:center;color:#71717a;margin-bottom:32px}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:13px;color:#a1a1aa;margin-bottom:6px}
.form-group input{width:100%;padding:12px 16px;background:#0a0a0b;border:1px solid #27272a;border-radius:8px;color:#e4e4e7;font-size:15px;outline:none}
.form-group input:focus{border-color:#3b82f6}
button{width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:8px}
button:active{background:#2563eb}
.error{color:#ef4444;text-align:center;font-size:13px;margin-top:12px;display:none}
.divider{text-align:center;color:#52525b;margin:24px 0;font-size:13px}
.pin-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.pin-btn{padding:16px;font-size:20px;background:#27272a;color:#e4e4e7;border:none;border-radius:8px;cursor:pointer}
.pin-btn:active{background:#3f3f46}
.pin-btn.wide{grid-column:span 1}
.pin-display{text-align:center;font-size:24px;letter-spacing:8px;color:#3b82f6;margin:12px 0;min-height:36px}
</style>
</head>
<body>
<div class="login-box">
  <h1>🍽️ TableFlow</h1>
  <p>Restaurant POS System</p>
  
  <div id="adminLogin">
    <div class="form-group">
      <label>Username</label>
      <input type="text" id="username" autocomplete="username">
    </div>
    <div class="form-group">
      <label>Password</label>
      <input type="password" id="password" autocomplete="current-password">
    </div>
    <button onclick="doLogin()">Sign In</button>
    <div class="error" id="loginError"></div>
    <div class="divider">— or enter staff PIN —</div>
  </div>
  
  <div class="pin-display" id="pinDisplay"></div>
  <div class="pin-grid">
    <button class="pin-btn" onclick="pinDigit('1')">1</button>
    <button class="pin-btn" onclick="pinDigit('2')">2</button>
    <button class="pin-btn" onclick="pinDigit('3')">3</button>
    <button class="pin-btn" onclick="pinDigit('4')">4</button>
    <button class="pin-btn" onclick="pinDigit('5')">5</button>
    <button class="pin-btn" onclick="pinDigit('6')">6</button>
    <button class="pin-btn" onclick="pinDigit('7')">7</button>
    <button class="pin-btn" onclick="pinDigit('8')">8</button>
    <button class="pin-btn" onclick="pinDigit('9')">9</button>
    <button class="pin-btn" onclick="pinClear()">C</button>
    <button class="pin-btn" onclick="pinDigit('0')">0</button>
    <button class="pin-btn" onclick="pinBack()">⌫</button>
  </div>
  <div class="error" id="pinError"></div>
</div>
<script>
let pin='';
function pinDigit(d){pin+=d;document.getElementById('pinDisplay').textContent='●'.repeat(pin.length);if(pin.length===4)doPin()}
function pinClear(){pin='';document.getElementById('pinDisplay').textContent='';document.getElementById('pinError').style.display='none'}
function pinBack(){pin=pin.slice(0,-1);document.getElementById('pinDisplay').textContent='●'.repeat(pin.length)}
async function doLogin(){
  const u=document.getElementById('username').value,p=document.getElementById('password').value;
  try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  if(r.ok){window.location.href='/'}else{const e=await r.json();const el=document.getElementById('loginError');el.textContent=e.error;el.style.display='block'}}
  catch(e){const el=document.getElementById('loginError');el.textContent='Connection error';el.style.display='block'}
}
async function doPin(){
  try{const r=await fetch('/api/auth/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});
  if(r.ok){window.location.href='/'}else{const e=await r.json();const el=document.getElementById('pinError');el.textContent=e.error;el.style.display='block';pin='';document.getElementById('pinDisplay').textContent=''}}
  catch(e){pin='';document.getElementById('pinDisplay').textContent=''}
}
document.getElementById('password').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
</script>
</body>
</html>`;
}

module.exports = { createAuthMiddleware, requireAuth, requireRole, loginPage };
