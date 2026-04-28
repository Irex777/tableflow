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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0C0B09;color:#F0EBE1;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
body::before{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at center,rgba(212,168,67,0.06) 0%,transparent 60%);pointer-events:none;z-index:0}
.login-box{background:#1A1814;border-radius:20px;padding:48px 40px;width:400px;max-width:92vw;position:relative;z-index:1;box-shadow:0 24px 80px rgba(0,0,0,0.5),0 0 120px rgba(212,168,67,0.04)}
.logo-area{text-align:center;margin-bottom:36px}
.logo-icon{display:inline-block;margin-bottom:12px}
.logo-icon svg{width:36px;height:36px;stroke:#D4A843;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.login-box h1{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:#F0EBE1;text-align:center;letter-spacing:-0.5px}
.login-box .subtitle{text-align:center;color:#A69F91;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:400;margin-top:6px;letter-spacing:0.3px}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:12px;color:#6B6459;margin-bottom:8px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px}
.form-group input{width:100%;padding:14px 16px;background:#2A2822;border:1px solid #3A362E;border-radius:10px;color:#F0EBE1;font-size:15px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color 0.2s}
.form-group input::placeholder{color:#6B6459}
.form-group input:focus{border-color:#D4A843}
.sign-in-btn{width:100%;padding:15px;background:#D4A843;color:#0C0B09;border:none;border-radius:10px;font-size:15px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;margin-top:8px;transition:background 0.2s;letter-spacing:0.2px}
.sign-in-btn:hover{background:#E0B955}
.sign-in-btn:active{background:#C89B3A}
.error{color:#E85D4A;text-align:center;font-size:13px;margin-top:12px;display:none}
.divider{text-align:center;color:#6B6459;margin:28px 0 20px;font-size:13px;font-family:'DM Sans',sans-serif;letter-spacing:0.3px}
.pin-display{text-align:center;font-size:28px;letter-spacing:10px;color:#D4A843;margin:16px 0;min-height:40px;font-family:'JetBrains Mono',monospace}
.pin-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.pin-btn{padding:16px;font-size:20px;font-family:'DM Sans',sans-serif;background:#2A2822;color:#F0EBE1;border:1px solid #3A362E;border-radius:10px;cursor:pointer;transition:background 0.15s}
.pin-btn:hover{background:#333129}
.pin-btn:active{background:#3D3A31}
</style>
</head>
<body>
<div class="login-box">
  <div class="logo-area">
    <div class="logo-icon">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 2v7c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V2"/>
        <path d="M7 2v20"/>
        <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
      </svg>
    </div>
    <h1>TableFlow</h1>
    <p class="subtitle">Restaurant POS System</p>
  </div>
  
  <div id="adminLogin">
    <div class="form-group">
      <label>Username</label>
      <input type="text" id="username" autocomplete="username">
    </div>
    <div class="form-group">
      <label>Password</label>
      <input type="password" id="password" autocomplete="current-password">
    </div>
    <button class="sign-in-btn" onclick="doLogin()">Sign In</button>
    <div class="error" id="loginError"></div>
    <div class="divider">or enter staff PIN</div>
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
