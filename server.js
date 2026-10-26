/**
 * Central Backend Server - Palani Interns Work flow
 * Tarcin Robotics LLP - Embedded Systems & IoT Engineering Hub
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const cloudPort = process.env.PORT;

// 1. Load .env (supports dotenv package or built-in line parser)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: envPath });
  } catch (e) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value.trim();
      }
    });
  }
}

const db = require('./database/db');
const PORT = cloudPort || process.env.PORT || 5000;
const FRONTEND_DIR = path.join(__dirname, '..');

// Check if express is available
let express;
try {
  express = require('express');
} catch (e) {
  express = null;
}

if (express) {
  // ================= STANDARD EXPRESS SERVER =================
  const cors = require('cors');
  const authRoutes = require('./routes/auth');
  const adminRoutes = require('./routes/admin');
  const internRoutes = require('./routes/intern');
  const taskRoutes = require('./routes/tasks');
  const submissionRoutes = require('./routes/submissions');
  const bugRoutes = require('./routes/bugs');
  const fileRoutes = require('./routes/files');

  const app = express();

  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(express.json({ limit: '60mb' }));
  app.use(express.urlencoded({ extended: true, limit: '60mb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'online', mode: 'express', dbMode: db.getDbMode(), timestamp: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/intern', internRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/bugs', bugRoutes);
  app.use('/api/files', fileRoutes);

  app.get('/api/logs', async (req, res) => {
    try {
      const logs = await db.getAllLogs();
      res.json({ success: true, logs });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.use(express.static(FRONTEND_DIR));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ success: false, message: 'API route not found' });
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });

  async function start() {
    await db.initDB();
    if (require.main === module || !process.env.VERCEL) {
      app.listen(PORT, '0.0.0.0', () => printBanner('Express.js Engine'));
    }
  }
  start().catch(console.error);

  module.exports = app;

} else {
  // ================= BUILT-IN NATIVE NODE.JS HTTP ENGINE =================
  // Zero-dependency fallback: runs out of the box before npm install or offline!
  const authController = require('./controllers/authController');
  const adminController = require('./controllers/adminController');
  const internController = require('./controllers/internController');
  const taskController = require('./controllers/taskController');
  const submissionController = require('./controllers/submissionController');
  const bugController = require('./controllers/bugController');
  const fileController = require('./controllers/fileController');
  const { authMiddleware, requireAdmin, requireIntern } = require('./middleware/auth');
  const { uploadZip, uploadBugDoc, uploadFileZip } = require('./middleware/upload');

  const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.zip': 'application/zip'
  };

  const server = http.createServer(async (req, res) => {
    // 1. CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // Enhance response object with Express-like helpers
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };

    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };

    res.download = (filePath, fileName) => {
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, message: 'File not found on server' });
        return;
      }
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName || path.basename(filePath)}"`,
        'Content-Length': stat.size
      });
      fs.createReadStream(filePath).pipe(res);
    };

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    req.query = parsedUrl.query || {};

    try {
      // 2. Route API calls
      if (pathname.startsWith('/api')) {
        return handleApiRequest(req, res, pathname);
      }

      // 3. Serve Frontend Static files
      let filePath = path.join(FRONTEND_DIR, pathname === '/' ? 'index.html' : pathname);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(FRONTEND_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);

    } catch (err) {
      console.error('Request processing error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message });
      }
    }
  });

  async function handleApiRequest(req, res, pathname) {
    const method = req.method;

    // Body parsing helper for JSON
    const parseBody = () => new Promise((resolve) => {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) return resolve({});
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try { resolve(JSON.parse(body || '{}')); }
        catch (e) { resolve({}); }
      });
    });

    // Middleware runner
    const run = (fn) => new Promise((resolve) => fn(req, res, resolve));

    // Health
    if (pathname === '/api/health' && method === 'GET') {
      return res.json({ status: 'online', mode: 'native-node', dbMode: db.getDbMode(), timestamp: new Date().toISOString() });
    }

    // Auth
    if (pathname === '/api/auth/login' && method === 'POST') {
      req.body = await parseBody();
      return authController.login(req, res);
    }
    if (pathname === '/api/auth/me' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      return authController.getMe(req, res);
    }
    if (pathname === '/api/auth/change-password' && method === 'POST') {
      await run(authMiddleware);
      if (res.headersSent) return;
      req.body = await parseBody();
      return authController.changePassword(req, res);
    }

    // Admin Interns
    if (pathname === '/api/admin/interns' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      return adminController.getAllInterns(req, res);
    }
    if (pathname === '/api/admin/interns' && method === 'POST') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      req.body = await parseBody();
      return adminController.createIntern(req, res);
    }
    const adminInternMatch = pathname.match(/^\/api\/admin\/interns\/([^/]+)$/);
    if (adminInternMatch) {
      req.params = { id: adminInternMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      if (method === 'PUT') {
        req.body = await parseBody();
        return adminController.updateIntern(req, res);
      }
      if (method === 'DELETE') {
        return adminController.deleteIntern(req, res);
      }
    }

    // Admin Stats & Settings
    if (pathname === '/api/admin/stats' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      return adminController.getDashboardStats(req, res);
    }
    if (pathname === '/api/admin/settings' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      return adminController.getSettings(req, res);
    }
    if (pathname === '/api/admin/settings' && method === 'PUT') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      req.body = await parseBody();
      return adminController.updateSettings(req, res);
    }

    // Intern Profile
    if (pathname === '/api/intern/profile' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireIntern);
      if (res.headersSent) return;
      return internController.getProfile(req, res);
    }
    if (pathname === '/api/intern/tasks' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireIntern);
      if (res.headersSent) return;
      return internController.getMyTasks(req, res);
    }
    if (pathname === '/api/intern/submissions' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireIntern);
      if (res.headersSent) return;
      return internController.getMySubmissions(req, res);
    }
    if (pathname === '/api/intern/submissions' && method === 'POST') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireIntern);
      if (res.headersSent) return;
      await run(uploadZip.single('file'));
      return submissionController.createSubmission(req, res);
    }
    if (pathname === '/api/intern/bugs' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireIntern);
      if (res.headersSent) return;
      return internController.getMyBugs(req, res);
    }
    if (pathname === '/api/intern/logs' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireIntern);
      if (res.headersSent) return;
      return internController.getMyLogs(req, res);
    }
    if (pathname === '/api/intern/logs' && method === 'POST') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireIntern);
      if (res.headersSent) return;
      req.body = await parseBody();
      return internController.submitDailyLog(req, res);
    }

    // Tasks
    if (pathname === '/api/tasks' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      return taskController.getTasks(req, res);
    }
    if (pathname === '/api/tasks' && method === 'POST') {
      await run(authMiddleware);
      if (res.headersSent) return;
      req.body = await parseBody();
      return taskController.createTask(req, res);
    }
    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      req.params = { id: taskMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      if (method === 'PUT') {
        req.body = await parseBody();
        return taskController.updateTask(req, res);
      }
      if (method === 'DELETE') {
        return taskController.deleteTask(req, res);
      }
    }

    // Submissions
    if ((pathname === '/api/submissions' || pathname === '/api/admin/submissions') && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      return submissionController.getSubmissions(req, res);
    }
    if (pathname === '/api/submissions' && method === 'POST') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(uploadZip.single('file'));
      return submissionController.createSubmission(req, res);
    }
    const subDownloadMatch = pathname.match(/^\/api\/(?:admin\/)?submissions\/([^/]+)\/download$/);
    if (subDownloadMatch && method === 'GET') {
      req.params = { id: subDownloadMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      return submissionController.downloadSubmission(req, res);
    }
    const subApproveMatch = pathname.match(/^\/api\/admin\/submissions\/([^/]+)\/approve$/);
    if (subApproveMatch && method === 'PUT') {
      req.params = { id: subApproveMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      req.body = await parseBody();
      return submissionController.approveSubmission(req, res);
    }
    const subRejectMatch = pathname.match(/^\/api\/admin\/submissions\/([^/]+)\/reject$/);
    if (subRejectMatch && method === 'PUT') {
      req.params = { id: subRejectMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      req.body = await parseBody();
      return submissionController.rejectSubmission(req, res);
    }

    // Bugs
    if (pathname === '/api/bugs' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      return bugController.getBugs(req, res);
    }
    if (pathname === '/api/bugs' && method === 'POST') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(uploadBugDoc.single('document'));
      return bugController.createBug(req, res);
    }
    const bugToggleMatch = pathname.match(/^\/api\/bugs\/([^/]+)$/);
    if (bugToggleMatch) {
      req.params = { id: bugToggleMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      if (method === 'PUT') return bugController.toggleBugStatus(req, res);
      if (method === 'DELETE') return bugController.deleteBug(req, res);
    }
    const bugDownloadMatch = pathname.match(/^\/api\/bugs\/([^/]+)\/download$/);
    if (bugDownloadMatch && method === 'GET') {
      req.params = { id: bugDownloadMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      return bugController.downloadBugDoc(req, res);
    }

    // Files (File Dashboard: Project ZIP storage & management)
    if (pathname === '/api/files' && method === 'GET') {
      await run(authMiddleware);
      if (res.headersSent) return;
      return fileController.getFiles(req, res);
    }
    if (pathname === '/api/files' && method === 'POST') {
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      await run(uploadFileZip.single('file'));
      return fileController.createFile(req, res);
    }
    const fileDownloadMatch = pathname.match(/^\/api\/files\/([^/]+)\/download$/);
    if (fileDownloadMatch && method === 'GET') {
      req.params = { id: fileDownloadMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      return fileController.downloadFile(req, res);
    }
    const fileDeleteMatch = pathname.match(/^\/api\/files\/([^/]+)$/);
    if (fileDeleteMatch && method === 'DELETE') {
      req.params = { id: fileDeleteMatch[1] };
      await run(authMiddleware);
      if (res.headersSent) return;
      await run(requireAdmin);
      if (res.headersSent) return;
      return fileController.deleteFile(req, res);
    }

    // Logs
    if (pathname === '/api/logs' && method === 'GET') {
      try {
        const logs = await db.getAllLogs();
        return res.json({ success: true, logs });
      } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
    }

    return res.status(404).json({ success: false, message: `API route ${method} ${pathname} not found` });
  }

  async function start() {
    await db.initDB();
    server.listen(PORT, '0.0.0.0', () => printBanner('Native Node Engine'));
  }
  start().catch(console.error);
}

function printBanner(engineName) {
  console.log('\n=============================================================');
  console.log(`🚀 TARCIN INTERNS WORKFLOW - CENTRAL SERVER ONLINE (${engineName})`);
  console.log('=============================================================');
  console.log(`📡 Local URL:       http://localhost:${PORT}`);
  
  const interfaces = os.networkInterfaces();
  const networkIps = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        networkIps.push(iface.address);
        console.log(`🌐 Network LAN URL: http://${iface.address}:${PORT}`);
      }
    }
  }

  console.log('-------------------------------------------------------------');
  console.log('🔐 Guide / Admin Default Login:');
  console.log('   Username: palani');
  console.log('   Password: 123456');
  console.log('-------------------------------------------------------------');
  console.log('💡 Interns on other computers can connect using:');
  if (networkIps.length > 0) {
    console.log(`   http://${networkIps[0]}:${PORT}`);
  } else {
    console.log(`   http://<YOUR_COMPUTER_IP>:${PORT}`);
  }
  console.log('=============================================================\n');
}
