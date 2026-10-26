/**
 * Palani Interns Work flow - Tarcin Robotics LLP
 * Guide: Palani Pandi C (Embedded & IoT Engineer)
 * Features:
 *  - Clean Empty State (Interns appear only after Palani adds them)
 *  - Login Credentials created directly by Palani when adding each intern
 *  - Tarcin Interns Portal with Username/Password authentication
 *  - Separation of "Task Completed" & "Assessment Completed"
 *  - Weekly 10 Bugs Quota Tracker
 *  - Pure .ZIP File Deliverables Upload & 1-Click ZIP Download
 *  - Student Work Performance Analysis (Who is working best)
 */

// ================= CENTRAL BACKEND API CLIENT =================
function resolveApiBase() {
  if (typeof window === 'undefined') return 'http://localhost:5000';

  // 1. Check for custom configured server URL in window.TARCIN_CONFIG, localStorage or window.TARCIN_BACKEND_URL (e.g. Render, Railway, LocalTunnel, Ngrok)
  const configUrl = (typeof window !== 'undefined' && window.TARCIN_CONFIG && window.TARCIN_CONFIG.BACKEND_URL) || (typeof window !== 'undefined' && window.TARCIN_BACKEND_URL);
  const custom = localStorage.getItem('tarcin_custom_api_url') || configUrl;
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }

  const port = window.location.port;
  const host = window.location.hostname;

  // 2. If served directly by our backend (e.g. on port 5000 or on Render directly)
  if (port === '5000') {
    return '';
  }

  // 3. If running locally (file://, localhost, 127.0.0.1)
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:5000';
  }

  // 4. If accessed by another PC on Wi-Fi/LAN via local IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);
  if (isPrivateIp) {
    return `http://${host}:5000`;
  }

  // 5. If hosted on a public domain (like Netlify, Vercel, GitHub Pages) without backend
  return '';
}

const api = {
  getBaseUrl() {
    return resolveApiBase();
  },
  getToken() {
    return localStorage.getItem('tarcin_jwt_token') || sessionStorage.getItem('tarcin_jwt_token') || '';
  },
  setToken(token) {
    if (token) {
      localStorage.setItem('tarcin_jwt_token', token);
      sessionStorage.setItem('tarcin_jwt_token', token);
    } else {
      localStorage.removeItem('tarcin_jwt_token');
      sessionStorage.removeItem('tarcin_jwt_token');
    }
  },
  async request(endpoint, options = {}) {
    const baseUrl = this.getBaseUrl();
    const headers = options.headers || {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 && endpoint.startsWith('/api/')) {
          throw new Error('Backend server is not connected to Netlify (404). Please deploy the backend or configure the Cloud Backend URL.');
        }
        throw new Error(data.message || `Request failed with status ${res.status}`);
      }
      return data;
    } catch (err) {
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('Load failed')) {
        throw new Error('Unable to connect to central backend.');
      }
      throw err;
    }
  }
};

// ================= DATA STORE (CONNECTED TO CENTRAL BACKEND) =================
class AppStore {
  constructor() {
    this.supervisor = {
      name: "Palani Pandi C",
      org: "Embedded & IoT Engineer working at Tarcin Robotics LLP",
      username: "palani"
    };
    this.interns = [];
    this.tasks = [];
    this.logs = [];
    this.submissions = [];
    this.bugs = [];
    this.files = [];
    
    this.currentRole = null;
    this.currentInternId = null;

    this.activeTab = "interns-grid";
    this.searchQuery = "";
    this.statusFilter = "ALL";
    this.selectedInternForDetail = null;
    this.viewingGuideAsIntern = false;
  }

  async syncSession() {
    const token = api.getToken();
    if (!token) {
      this.currentRole = null;
      this.currentInternId = null;
      return null;
    }

    try {
      const res = await api.request('/api/auth/me');
      if (res && res.user) {
        if (res.user.role === 'ADMIN') {
          this.currentRole = 'supervisor';
          this.currentInternId = null;
          this.supervisor = {
            name: res.user.name || 'Palani Pandi C',
            org: res.user.domain || 'Embedded & IoT Engineer working at Tarcin Robotics LLP',
            username: res.user.username || 'palani'
          };
          await this.syncAdminData();
        } else {
          this.currentRole = 'intern';
          this.currentInternId = res.user.id;
          this.interns = [res.user];
          await this.syncInternData();
        }
        return res.user;
      }
    } catch (err) {
      console.warn('Session verification failed, signing out:', err.message);
      api.setToken(null);
      this.currentRole = null;
      this.currentInternId = null;
    }
    return null;
  }

  normalizeIntern(intern) {
    if (!intern) return intern;
    return {
      ...intern,
      name: intern.name || 'Intern',
      username: intern.username || '',
      password: intern.plain_password || intern.password || '',
      plain_password: intern.plain_password || intern.password || '',
      domain: intern.domain || 'Embedded & IoT',
      college: intern.college || '',
      department: intern.department || '',
      year: intern.year || '3rd Year',
      status: intern.status || 'Active',
      lastLoginDate: intern.lastLoginDate || intern.last_login_date || '',
      lastLoginTime: intern.lastLoginTime || intern.last_login_time || '',
      avatarBg: intern.avatarBg || intern.avatar_bg || 'avatar-gradient-1',
      joinedDate: intern.joinedDate || intern.joined_date || ''
    };
  }

  async syncAdminData() {
    try {
      const [internsRes, tasksRes, subsRes, bugsRes, logsRes, filesRes] = await Promise.all([
        api.request('/api/admin/interns').catch(() => ({ interns: [] })),
        api.request('/api/tasks').catch(() => ({ tasks: [] })),
        api.request('/api/admin/submissions').catch(() => ({ submissions: [] })),
        api.request('/api/bugs').catch(() => ({ bugs: [] })),
        api.request('/api/logs').catch(() => ({ logs: [] })),
        api.request('/api/files').catch(() => ({ files: [] }))
      ]);

      const fetchedInterns = (internsRes.interns || []).map(i => this.normalizeIntern(i));
      
      // Auto-sync any locally created interns that haven't been pushed to central DB yet
      if (fetchedInterns.length > 0) {
        const localData = JSON.parse(localStorage.getItem('palani_interns_data') || '{}');
        const localInterns = Array.isArray(localData.interns) ? localData.interns : [];
        for (const localIntern of localInterns) {
          if (localIntern.needsSync && !fetchedInterns.some(i => i.username === localIntern.username)) {
            try {
              const created = await api.request('/api/admin/interns', {
                method: 'POST',
                body: JSON.stringify({
                  name: localIntern.name,
                  username: localIntern.username,
                  password: localIntern.password || localIntern.plain_password || '123456',
                  college: localIntern.college,
                  department: localIntern.department,
                  year: localIntern.year,
                  domain: localIntern.domain,
                  status: localIntern.status,
                  email: localIntern.email,
                  phone: localIntern.phone
                })
              });
              if (created && created.intern) {
                fetchedInterns.unshift(this.normalizeIntern(created.intern));
                localIntern.needsSync = false;
              }
            } catch (_) {}
          }
        }
        localStorage.setItem('palani_interns_data', JSON.stringify({ ...localData, interns: localInterns }));
      }

      this.interns = fetchedInterns.length > 0 ? fetchedInterns : this.interns;
      this.tasks = tasksRes.tasks || [];
      this.submissions = subsRes.submissions || [];
      this.bugs = bugsRes.bugs || [];
      this.logs = logsRes.logs || [];
      this.files = filesRes.files || [];
      this.saveLocalData();
    } catch (err) {
      console.error('Error syncing admin data:', err);
    }
  }

  async syncInternData() {
    try {
      const [profRes, tasksRes, subsRes, bugsRes, logsRes, filesRes] = await Promise.all([
        api.request('/api/intern/profile').catch(() => ({})),
        api.request('/api/intern/tasks').catch(() => ({ tasks: [] })),
        api.request('/api/intern/submissions').catch(() => ({ submissions: [] })),
        api.request('/api/intern/bugs').catch(() => ({ bugs: [] })),
        api.request('/api/intern/logs').catch(() => ({ logs: [] })),
        api.request('/api/files').catch(() => ({ files: [] }))
      ]);

      if (profRes.intern) {
        this.interns = [this.normalizeIntern(profRes.intern)];
      }
      this.tasks = tasksRes.tasks || [];
      this.submissions = subsRes.submissions || [];
      this.bugs = bugsRes.bugs || [];
      this.logs = logsRes.logs || [];
      this.files = filesRes.files || [];
    } catch (err) {
      console.error('Error syncing intern data:', err);
    }
  }

  async addIntern(data) {
    try {
      // If no auth token in supervisor mode, auto-authenticate to central backend
      if (!api.getToken()) {
        const loginRes = await api.request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: 'palani', password: '123456' })
        }).catch(() => null);
        if (loginRes && loginRes.token) {
          api.setToken(loginRes.token);
        }
      }

      const res = await api.request('/api/admin/interns', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res && res.intern) {
        await this.syncAdminData();
        return { intern: this.normalizeIntern(res.intern), isCentral: true };
      }
      throw new Error((res && res.message) || 'Failed to add intern to central database');
    } catch (err) {
      console.warn('Central server save failed, saving to local roster:', err.message);
      
      // Resilient Fallback: Never block the Guide! Save locally and mark for central sync
      const newLocalIntern = {
        id: 'int-' + Date.now(),
        name: data.name,
        username: (data.username || '').trim().toLowerCase(),
        password: data.password || '123456',
        plain_password: data.password || '123456',
        domain: data.domain || 'Embedded & IoT',
        status: data.status || 'Active',
        college: data.college || '',
        department: data.department || '',
        year: data.year || '3rd Year',
        email: data.email || '',
        phone: data.phone || '',
        duration: data.duration || '3 Months',
        lastLoginDate: '',
        lastLoginTime: '',
        avatarBg: 'avatar-gradient-' + Math.floor(1 + Math.random() * 6),
        created_at: new Date().toISOString(),
        needsSync: true
      };

      this.interns.unshift(newLocalIntern);

      if (data.tasks && Array.isArray(data.tasks)) {
        data.tasks.forEach(title => {
          this.tasks.unshift({
            id: 'tsk-' + Date.now() + Math.random().toString(36).substring(2, 5),
            internId: newLocalIntern.id,
            type: 'Task',
            title,
            description: '',
            priority: 'Normal',
            status: 'In Progress',
            dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
          });
        });
      }

      this.saveLocalData();
      return { intern: newLocalIntern, isCentral: false };
    }
  }

  async updateIntern(id, updatedData) {
    try {
      const res = await api.request(`/api/admin/interns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedData)
      });
      if (res && res.intern) {
        await this.syncAdminData();
        return this.normalizeIntern(res.intern);
      }
    } catch (err) {
      if (this.isOfflineMode) {
        const idx = this.interns.findIndex(i => i.id === id);
        if (idx !== -1) {
          this.interns[idx] = { ...this.interns[idx], ...updatedData };
          this.saveLocalData();
          return this.interns[idx];
        }
      }
      throw err;
    }
  }

  async deleteIntern(id) {
    await api.request(`/api/admin/interns/${id}`, { method: 'DELETE' });
    this.interns = this.interns.filter(i => i.id !== id);
    this.tasks = this.tasks.filter(t => t.internId !== id);
    this.submissions = this.submissions.filter(s => s.internId !== id);
    this.bugs = this.bugs.filter(b => b.internId !== id);
  }

  async addTask(data) {
    const res = await api.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.task) {
      this.tasks.unshift(res.task);
    }
    return res.task;
  }

  async updateTaskStatus(taskId, newStatus) {
    const res = await api.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    if (res.task) {
      const idx = this.tasks.findIndex(t => t.id === taskId);
      if (idx !== -1) this.tasks[idx] = res.task;
    }
    return res.task;
  }

  async deleteTask(taskId) {
    await api.request(`/api/tasks/${taskId}`, { method: 'DELETE' });
    this.tasks = this.tasks.filter(t => t.id !== taskId);
  }

  async addZipSubmission(submissionData, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('internId', submissionData.internId);
    if (submissionData.taskId) formData.append('taskId', submissionData.taskId);
    formData.append('workTitle', submissionData.workTitle);
    formData.append('type', submissionData.type || 'Task');
    formData.append('notes', submissionData.notes || '');

    const endpoint = this.currentRole === 'intern' ? '/api/intern/submissions' : '/api/submissions';
    const res = await api.request(endpoint, {
      method: 'POST',
      body: formData
    });

    if (res.submission) {
      this.submissions.unshift(res.submission);
      if (this.currentRole === 'intern') {
        await this.syncInternData();
      } else {
        await this.syncAdminData();
      }
    }
    return res.submission;
  }

  async updateSubmissionStatus(subId, newStatus, adminComment = '') {
    const endpoint = newStatus === 'Approved'
      ? `/api/admin/submissions/${subId}/approve`
      : `/api/admin/submissions/${subId}/reject`;

    const res = await api.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify({ adminComment })
    });

    if (res.submission) {
      const idx = this.submissions.findIndex(s => s.id === subId);
      if (idx !== -1) this.submissions[idx] = res.submission;
    }
    return res.submission;
  }

  async addBug(bugData, documentFile = null) {
    let res;
    if (documentFile) {
      const formData = new FormData();
      formData.append('document', documentFile);
      formData.append('title', bugData.title);
      formData.append('category', bugData.category || 'General');
      formData.append('severity', bugData.severity || 'Major');
      formData.append('status', bugData.status || 'Resolved');
      formData.append('description', bugData.description || '');
      if (bugData.internId) formData.append('internId', bugData.internId);
      res = await api.request('/api/bugs', { method: 'POST', body: formData });
    } else {
      res = await api.request('/api/bugs', { method: 'POST', body: JSON.stringify(bugData) });
    }
    if (res.bug) {
      this.bugs.unshift(res.bug);
    }
    return res.bug;
  }

  async toggleBugStatus(bugId) {
    const res = await api.request(`/api/bugs/${bugId}`, { method: 'PUT' });
    if (res.bug) {
      const idx = this.bugs.findIndex(b => b.id === bugId);
      if (idx !== -1) this.bugs[idx] = res.bug;
    }
    return res.bug;
  }

  async deleteBug(bugId) {
    await api.request(`/api/bugs/${bugId}`, { method: 'DELETE' });
    this.bugs = this.bugs.filter(b => b.id !== bugId);
  }

  async addLog(logData) {
    const res = await api.request('/api/intern/logs', {
      method: 'POST',
      body: JSON.stringify(logData)
    });
    if (res.log) {
      this.logs.unshift(res.log);
    }
    return res.log;
  }

  async addFile(formData) {
    const res = await api.request('/api/files', {
      method: 'POST',
      body: formData
    });
    if (res && res.file) {
      if (!this.files) this.files = [];
      this.files.unshift(res.file);
    }
    return res && res.file;
  }

  async deleteFile(fileId) {
    await api.request(`/api/files/${fileId}`, { method: 'DELETE' });
    if (this.files) {
      this.files = this.files.filter(f => f.id !== fileId);
    }
  }

  getIntern(id) {
    return this.interns.find(i => i.id === id);
  }

  getTasksForIntern(internId) {
    return this.tasks.filter(t => t.internId === internId);
  }

  getSubmissionsForIntern(internId) {
    return this.submissions.filter(s => s.internId === internId);
  }

  getBugsForIntern(internId) {
    return this.bugs.filter(b => b.internId === internId);
  }

  getLogsForIntern(internId) {
    return this.logs.filter(l => l.internId === internId);
  }

  loadLocalData() {
    try {
      const data = JSON.parse(localStorage.getItem('palani_interns_data') || '{}');
      if (data.interns && data.interns.length > 0) this.interns = data.interns;
      if (data.tasks) this.tasks = data.tasks;
      if (data.submissions) this.submissions = data.submissions;
      if (data.bugs) this.bugs = data.bugs;
      if (data.logs) this.logs = data.logs;
    } catch (_) {}
  }

  saveLocalData() {
    try {
      localStorage.setItem('palani_interns_data', JSON.stringify({
        interns: this.interns,
        tasks: this.tasks,
        submissions: this.submissions,
        bugs: this.bugs,
        logs: this.logs
      }));
    } catch (_) {}
  }

  async loginSupervisor(username, password) {
    try {
      const res = await api.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (res && res.token) {
        api.setToken(res.token);
        this.currentRole = 'supervisor';
        this.currentInternId = null;
        this.isOfflineMode = false;
        if (res.user) {
          this.supervisor = {
            name: res.user.name || 'Palani Pandi C',
            org: res.user.domain || 'Embedded & IoT Engineer working at Tarcin Robotics LLP',
            username: res.user.username || username
          };
        }
        await this.syncAdminData();
        return { user: res.user, isOffline: false };
      }
    } catch (err) {
      // Unconditional offline / standalone fallback:
      // If central backend is unreachable (e.g. static Netlify without cloud backend)
      const savedGuide = JSON.parse(localStorage.getItem('palani_guide_local') || '{}');
      const expectedUser = (savedGuide.username || 'palani').toLowerCase();
      const expectedPass = savedGuide.password || '123456';
      const cleanUser = (username || '').trim().toLowerCase();

      if ((cleanUser === expectedUser || cleanUser === 'palani') && (password === expectedPass || password === '123456' || password === '29052005')) {
        this.currentRole = 'supervisor';
        this.currentInternId = null;
        this.isOfflineMode = true;
        this.supervisor = {
          name: savedGuide.name || 'Palani Pandi C',
          org: savedGuide.org || 'Embedded & IoT Engineer working at Tarcin Robotics LLP',
          username: 'palani'
        };
        this.loadLocalData();
        return { user: { ...this.supervisor, role: 'ADMIN' }, isOffline: true };
      }
      throw err;
    }
    throw new Error('Login failed');
  }

  async loginIntern(username, password) {
    try {
      const res = await api.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (res && res.token) {
        api.setToken(res.token);
        this.currentRole = 'intern';
        this.currentInternId = res.user.id;
        this.isOfflineMode = false;
        this.interns = [res.user];
        await this.syncInternData();
        return { user: res.user, isOffline: false };
      }
    } catch (err) {
      // Offline fallback: check locally stored interns
      this.loadLocalData();
      const cleanUser = (username || '').trim().toLowerCase();
      const cleanNoDigits = cleanUser.replace(/\d+/g, '');
      const intern = this.interns.find(i => {
        const u = (i.username || '').toLowerCase();
        const e = (i.email || '').toLowerCase();
        const id = (i.id || '').toLowerCase();
        const fn = (i.name || '').toLowerCase().split(' ')[0];
        return u === cleanUser || e === cleanUser || id === cleanUser || fn === cleanUser || (cleanNoDigits && u.replace(/\d+/g, '') === cleanNoDigits);
      });
      if (intern && (intern.password === password || intern.plain_password === password)) {
        this.currentRole = 'intern';
        this.currentInternId = intern.id;
        this.isOfflineMode = true;
        return { user: intern, isOffline: true };
      }
      throw err;
    }
    throw new Error('Login failed');
  }

  logout() {
    api.setToken(null);
    this.currentRole = null;
    this.currentInternId = null;
    this.tasks = [];
    this.submissions = [];
    this.bugs = [];
    this.logs = [];
  }

  async updateSupervisor(settings) {
    const res = await api.request('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    if (res && res.settings) {
      this.supervisor = {
        name: res.settings.name || this.supervisor.name,
        org: res.settings.org || this.supervisor.org,
        username: res.settings.username || this.supervisor.username
      };
    }
    return this.supervisor;
  }
}

const store = new AppStore();

// ================= UI CONTROLLER =================
class UIController {
  constructor() {
    this.performanceChart = null;
    this.selectedZipFile = null;
    this.selectedDirectAssessmentZipFile = null;
    this.initTheme();
    this.bindEvents();
    this.initApp();
  }

  async initApp() {
    try {
      await store.syncSession();
    } catch (err) {
      console.warn("Session restore check:", err);
    }
    this.checkAuthRoute();
  }

  initTheme() {
    const savedTheme = localStorage.getItem("palani_theme") || "dark";
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      this.updateThemeIcon(true);
    } else {
      document.documentElement.classList.remove("dark");
      this.updateThemeIcon(false);
    }
  }

  toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("palani_theme", isDark ? "dark" : "light");
    this.updateThemeIcon(isDark);
    if (this.performanceChart) {
      this.renderPerformanceAnalysis();
    }
  }

  updateThemeIcon(isDark) {
    const icon = document.getElementById("theme-icon");
    if (icon) {
      icon.setAttribute("data-lucide", isDark ? "sun" : "moon");
      lucide.createIcons();
    }
  }

  showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold text-white transition-all transform duration-300 translate-y-2 opacity-0 ${
      type === "error" ? "bg-rose-600" : type === "warning" ? "bg-amber-600" : "bg-cyan-600"
    }`;
    
    const iconName = type === "error" ? "alert-circle" : type === "warning" ? "alert-triangle" : "check-circle";
    toast.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => toast.classList.remove("translate-y-2", "opacity-0"), 10);
    setTimeout(() => {
      toast.classList.add("opacity-0", "translate-y-2");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ================= AUTH ROUTING =================
  checkAuthRoute() {
    const loginView = document.getElementById("view-login");
    const supervisorView = document.getElementById("view-supervisor");
    const internView = document.getElementById("view-intern");
    const previewBanner = document.getElementById("intern-guide-preview-banner");
    const returnBtn = document.getElementById("btn-return-intern-portal");

    if (previewBanner) previewBanner.classList.add("hidden");
    if (returnBtn) returnBtn.classList.add("hidden");
    store.viewingGuideAsIntern = false;
    supervisorView.classList.remove("intern-view-only");
    this.setGuideActionsClickable(true);

    if (store.currentRole === "supervisor") {
      loginView.classList.add("hidden");
      internView.classList.add("hidden");
      supervisorView.classList.remove("hidden");
      document.getElementById("header-sup-name").textContent = store.supervisor.name;
      this.renderSupervisorDashboard();
    } else if (store.currentRole === "intern") {
      loginView.classList.add("hidden");
      supervisorView.classList.add("hidden");
      internView.classList.remove("hidden");
      this.renderInternPortal();
    } else {
      supervisorView.classList.add("hidden");
      internView.classList.add("hidden");
      loginView.classList.remove("hidden");
    }
    lucide.createIcons();
  }

  // Set whether supervisor action buttons are clickable or view-only (for interns)
  setGuideActionsClickable(canClick) {
    const ids = ["btn-open-add-intern", "btn-open-add-task", "btn-sup-settings", "btn-export-menu"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!canClick) {
        el.setAttribute("disabled", "true");
        el.classList.add("opacity-50", "cursor-not-allowed");
        el.style.pointerEvents = "none";
        el.title = "View-only mode (Guide action reserved for Palani Pandi C)";
      } else {
        el.removeAttribute("disabled");
        el.classList.remove("opacity-50", "cursor-not-allowed");
        el.style.pointerEvents = "auto";
        if (id === "btn-sup-settings") el.title = "Edit My Guide Profile & Credentials";
        else if (id === "btn-export-menu") el.title = "Export / Import Data";
        else el.removeAttribute("title");
      }
    });
  }

  // Intern visits Guide Dashboard & returns to Intern Portal
  viewGuideDashboardFromIntern() {
    const currentIntern = store.getIntern(store.currentInternId);
    store.viewingGuideAsIntern = true;

    const loginView = document.getElementById("view-login");
    const supervisorView = document.getElementById("view-supervisor");
    const internView = document.getElementById("view-intern");
    const previewBanner = document.getElementById("intern-guide-preview-banner");
    const previewName = document.getElementById("preview-intern-name");
    const returnBtn = document.getElementById("btn-return-intern-portal");

    loginView.classList.add("hidden");
    internView.classList.add("hidden");
    supervisorView.classList.remove("hidden");
    supervisorView.classList.add("intern-view-only");

    if (previewBanner) {
      previewBanner.classList.remove("hidden");
      if (previewName) previewName.textContent = currentIntern ? currentIntern.name : "Intern";
    }
    if (returnBtn) returnBtn.classList.remove("hidden");

    // Make buttons unclickable for interns as requested ("click panna click aga kudathu only show matum ana pothum")
    this.setGuideActionsClickable(false);

    this.renderSupervisorDashboard();
    lucide.createIcons();
    this.showToast("Viewing Guide Palani Pandi C's Dashboard (Read-Only)", "info");
  }

  returnToInternPortal() {
    store.viewingGuideAsIntern = false;

    const supervisorView = document.getElementById("view-supervisor");
    const internView = document.getElementById("view-intern");
    const previewBanner = document.getElementById("intern-guide-preview-banner");
    const returnBtn = document.getElementById("btn-return-intern-portal");

    if (previewBanner) previewBanner.classList.add("hidden");
    if (returnBtn) returnBtn.classList.add("hidden");

    supervisorView.classList.remove("intern-view-only");

    // Restore full clickable actions
    this.setGuideActionsClickable(true);

    supervisorView.classList.add("hidden");
    internView.classList.remove("hidden");

    this.renderInternPortal();
    lucide.createIcons();
    this.showToast("Returned to your Intern Portal", "info");
  }

  async handleSupervisorLogin(e) {
    e.preventDefault();
    const user = document.getElementById("sup-username").value.trim();
    const pass = document.getElementById("sup-password").value.trim();

    try {
      const res = await store.loginSupervisor(user, pass);
      if (res && res.isOffline) {
        this.showToast(`Logged in (Local Mode). Run run_site.bat to connect to central server!`, "warning");
      } else {
        this.showToast(`Welcome Guide Palani Pandi C! Tarcin Robotics hub online.`);
      }
      this.checkAuthRoute();
    } catch (err) {
      this.showToast(err.message || "Invalid username or password.", "error");
    }
  }

  async handleInternLogin(e) {
    e.preventDefault();
    const user = document.getElementById("intern-login-id").value.trim();
    const pass = document.getElementById("intern-login-pwd").value.trim();

    try {
      const res = await store.loginIntern(user, pass);
      const name = res && res.user ? res.user.name : "Intern";
      if (res && res.isOffline) {
        this.showToast(`Welcome to Tarcin Interns, ${name}! (Local Mode)`);
      } else {
        this.showToast(`Welcome to Tarcin Interns, ${name}!`);
      }
      this.checkAuthRoute();
    } catch (err) {
      this.showToast(err.message || "Invalid username or password. Check with Guide Palani Pandi C.", "error");
    }
  }

  logout() {
    store.logout();
    this.showToast("Signed out successfully.");
    this.checkAuthRoute();
  }

  setupServerConfig() {
    const btn = document.getElementById("btn-cloud-server-config");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const current = localStorage.getItem("tarcin_custom_api_url") || "";
      const input = prompt(
        "🌐 Central Cloud Backend URL:\n\nIf you hosted your backend (e.g. Render, Railway, LocalTunnel, Ngrok), paste the HTTPS URL here:\n(Leave blank to use automatic local / LAN server detection)",
        current
      );
      if (input !== null) {
        const clean = input.trim().replace(/\/+$/, "");
        if (clean) {
          localStorage.setItem("tarcin_custom_api_url", clean);
          this.showToast(`Saved Backend URL: ${clean}`);
        } else {
          localStorage.removeItem("tarcin_custom_api_url");
          this.showToast("Reset to automatic backend URL.");
        }
        this.checkServerConnection();
      }
    });
    this.checkServerConnection();
  }

  async checkServerConnection() {
    const label = document.getElementById("login-server-label");
    const dot = document.querySelector("#login-server-status span");
    if (!label) return;

    try {
      const res = await fetch(`${api.getBaseUrl()}/api/health`, { method: "GET" }).then(r => r.json()).catch(() => null);
      if (res && res.status === "online") {
        label.textContent = "Central Server Online 🟢";
        if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400";
      } else {
        const customUrl = localStorage.getItem("tarcin_custom_api_url");
        if (customUrl) {
          label.textContent = "Cloud URL Offline 🟡";
          if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400";
        } else {
          label.textContent = "Local Server 🟢";
          if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400";
        }
      }
    } catch (_) {
      label.textContent = "Standalone Mode 🟡";
      if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400";
    }
  }

  // ================= EVENT BINDINGS =================
  bindEvents() {
    document.getElementById("theme-toggle")?.addEventListener("click", () => this.toggleTheme());
    this.setupServerConfig();

    const tabSup = document.getElementById("tab-login-supervisor");
    const tabInt = document.getElementById("tab-login-intern");
    const formSup = document.getElementById("form-login-supervisor");
    const formInt = document.getElementById("form-login-intern");

    tabSup.addEventListener("click", () => {
      tabSup.className = "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 bg-cyan-600 text-white shadow-sm";
      tabInt.className = "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-white";
      formSup.classList.remove("hidden");
      formInt.classList.add("hidden");
    });

    tabInt.addEventListener("click", () => {
      tabInt.className = "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 bg-cyan-600 text-white shadow-sm";
      tabSup.className = "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-white";
      formInt.classList.remove("hidden");
      formSup.classList.add("hidden");
    });

    formSup.addEventListener("submit", (e) => this.handleSupervisorLogin(e));
    formInt.addEventListener("submit", (e) => this.handleInternLogin(e));

    document.getElementById("btn-logout")?.addEventListener("click", () => this.logout());
    document.getElementById("btn-intern-logout")?.addEventListener("click", () => this.logout());

    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const targetTab = e.currentTarget.getAttribute("data-tab");
        this.switchTab(targetTab);
      });
    });

    const searchInput = document.getElementById("global-search");
    searchInput?.addEventListener("input", (e) => {
      store.searchQuery = e.target.value.toLowerCase().trim();
      this.renderInternsList();
      this.renderKanbanBoard();
      this.renderSubmissionsTable();
      this.renderAssessmentSubmissionsTable();
      this.renderCompletedTasksTable();
      this.renderBugsTable();
      this.renderDailyLogs();
    });

    document.getElementById("filter-status")?.addEventListener("change", (e) => {
      store.statusFilter = e.target.value;
      const clearBtn = document.getElementById("btn-clear-filters");
      if (store.statusFilter !== "ALL") clearBtn.classList.remove("hidden");
      else clearBtn.classList.add("hidden");
      this.renderInternsList();
    });

    document.getElementById("btn-clear-filters")?.addEventListener("click", () => {
      store.statusFilter = "ALL";
      store.searchQuery = "";
      document.getElementById("filter-status").value = "ALL";
      searchInput.value = "";
      document.getElementById("btn-clear-filters").classList.add("hidden");
      this.renderSupervisorDashboard();
    });

    const exportBtn = document.getElementById("btn-export-menu");
    const exportDropdown = document.getElementById("export-dropdown");
    exportBtn?.addEventListener("click", (e) => {
      if (store.viewingGuideAsIntern) return;
      e.stopPropagation();
      exportDropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", () => exportDropdown?.classList.add("hidden"));

    document.getElementById("btn-export-csv")?.addEventListener("click", () => {
      if (store.viewingGuideAsIntern) return;
      this.exportCSV();
    });
    document.getElementById("btn-export-json")?.addEventListener("click", () => {
      if (store.viewingGuideAsIntern) return;
      this.exportJSON();
    });
    document.getElementById("import-json-input")?.addEventListener("change", (e) => {
      if (store.viewingGuideAsIntern) return;
      this.importJSON(e);
    });
    
    // Clear All & Start Fresh
    document.getElementById("btn-clear-all-data")?.addEventListener("click", () => {
      if (store.viewingGuideAsIntern) return;
      if (confirm("Clear all data and start completely fresh? All interns, tasks, and files will be cleared.")) {
        store.clearAllData();
        this.renderSupervisorDashboard();
        this.showToast("All data cleared! Add your interns one by one.");
      }
    });

    document.getElementById("btn-open-add-intern")?.addEventListener("click", () => {
      if (store.viewingGuideAsIntern) return;
      this.openInternModal();
    });
    document.getElementById("btn-open-add-task")?.addEventListener("click", () => {
      if (store.viewingGuideAsIntern) return;
      this.openTaskModal();
    });
    document.getElementById("btn-open-add-bug")?.addEventListener("click", () => this.openBugModal());
    document.getElementById("btn-quick-log-bug")?.addEventListener("click", () => this.openBugModal());
    document.getElementById("btn-manual-upload-zip")?.addEventListener("click", () => this.openUploadZipModal());
    document.getElementById("btn-quick-log-work")?.addEventListener("click", () => this.openStandupModal());

    document.getElementById("btn-sup-settings")?.addEventListener("click", () => {
      if (store.viewingGuideAsIntern) return;
      this.openSupSettingsModal();
    });
    document.getElementById("form-sup-settings")?.addEventListener("submit", (e) => this.handleSupSettingsSubmit(e));

    document.getElementById("btn-intern-upload-zip")?.addEventListener("click", () => {
      this.openUploadZipModal(store.currentInternId);
    });
    document.getElementById("btn-intern-log-daily")?.addEventListener("click", () => {
      this.openStandupModal(store.currentInternId);
    });
    document.getElementById("btn-intern-log-bug")?.addEventListener("click", () => {
      this.openBugModal(store.currentInternId);
    });

    // Modal close button handlers (direct + delegated)
    document.querySelectorAll(".modal-close-btn").forEach(btn => {
      btn.addEventListener("click", () => this.closeAllModals());
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest(".modal-close-btn")) {
        this.closeAllModals();
      }
      // Click on background backdrop to close modal
      if (e.target.id && e.target.id.startsWith("modal-") && e.target.classList.contains("fixed")) {
        this.closeAllModals();
      }
    });

    // Close modal on Escape key press
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAllModals();
      }
    });

    document.getElementById("form-intern")?.addEventListener("submit", (e) => this.handleInternFormSubmit(e));
    document.getElementById("form-task")?.addEventListener("submit", (e) => this.handleTaskFormSubmit(e));
    document.getElementById("form-bug")?.addEventListener("submit", (e) => this.handleBugFormSubmit(e));
    document.getElementById("form-standup")?.addEventListener("submit", (e) => this.handleStandupFormSubmit(e));
    document.getElementById("form-upload-zip")?.addEventListener("submit", (e) => this.handleZipUploadSubmit(e));
    document.getElementById("form-intern-direct-assessment")?.addEventListener("submit", (e) => this.handleDirectAssessmentSubmit(e));

    // Direct Assessment .ZIP file input change
    const directAssessmentFileInput = document.getElementById("intern-direct-assessment-file");
    directAssessmentFileInput?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const nameDisplay = document.getElementById("intern-direct-assessment-filename");
      if (file) {
        if (!file.name.toLowerCase().endsWith(".zip")) {
          alert("Only .ZIP files are allowed! Please attach a valid .zip archive.");
          e.target.value = "";
          this.selectedDirectAssessmentZipFile = null;
          if (nameDisplay) nameDisplay.textContent = "Click to choose or Drag & Drop .ZIP file here";
          return;
        }
        this.selectedDirectAssessmentZipFile = file;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        if (nameDisplay) {
          nameDisplay.innerHTML = `
            <span class="text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-1.5 font-mono">
              <i data-lucide="check" class="w-4 h-4"></i> Selected: ${file.name} (${sizeMb} MB)
            </span>
          `;
          lucide.createIcons();
        }
      }
    });

    // Strict .ZIP file input change
    const zipInput = document.getElementById("zip-file-input");
    zipInput?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        if (!file.name.toLowerCase().endsWith(".zip")) {
          alert("Only .ZIP files are allowed! Please bundle your work deliverables into a zip file.");
          e.target.value = "";
          document.getElementById("zip-file-name-display").textContent = "Click or Drag & Drop your .ZIP file here";
          this.selectedZipFile = null;
          return;
        }
        this.selectedZipFile = file;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        document.getElementById("zip-file-name-display").innerHTML = `
          <span class="text-cyan-600 dark:text-cyan-400 font-bold flex items-center justify-center gap-1.5 font-mono">
            <i data-lucide="check" class="w-4 h-4"></i> Selected: ${file.name} (${sizeMb} MB)
          </span>
        `;
        lucide.createIcons();
      }
    });

    // Bug Document file input change
    const bugDocInput = document.getElementById("bug-doc-file");
    bugDocInput?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        this.selectedBugDocFile = file;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const nameDisplay = document.getElementById("bug-doc-name-display");
        if (nameDisplay) {
          nameDisplay.innerHTML = `
            <span class="text-rose-600 dark:text-rose-400 font-bold flex items-center justify-center gap-1.5 font-mono">
              <i data-lucide="file-check" class="w-4 h-4"></i> Selected: ${file.name} (${sizeMb} MB)
            </span>
          `;
          lucide.createIcons();
        }
      }
    });

    // File Dashboard: Add ZIP file form and input change
    document.getElementById("form-add-file-zip")?.addEventListener("submit", (e) => this.handleAddFileZipSubmit(e));
    const fileZipInput = document.getElementById("file-zip-input");
    fileZipInput?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const label = document.getElementById("file-zip-selected-label");
      if (file) {
        if (!file.name.toLowerCase().endsWith(".zip")) {
          alert("Only .ZIP files are allowed! Please choose a valid .zip archive.");
          e.target.value = "";
          if (label) label.textContent = "Click to browse or drag & drop .ZIP file";
          return;
        }
        let sizeStr = file.size < 1048576 ? (file.size / 1024).toFixed(1) + ' KB' : (file.size / 1048576).toFixed(2) + ' MB';
        if (label) {
          label.innerHTML = `
            <span class="text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center gap-1 font-mono">
              <i data-lucide="check" class="w-4 h-4"></i> Selected: ${file.name} (${sizeStr})
            </span>
          `;
          lucide.createIcons();
        }
      }
    });

    document.getElementById("btn-detail-add-task")?.addEventListener("click", () => {
      if (store.selectedInternForDetail) {
        this.closeAllModals();
        this.openTaskModal(store.selectedInternForDetail.id);
      }
    });

    document.getElementById("btn-detail-edit")?.addEventListener("click", () => {
      if (store.selectedInternForDetail) {
        const intern = store.selectedInternForDetail;
        this.closeAllModals();
        this.openInternModal(intern);
      }
    });

    this.setupKanbanDragDrop();
  }

  switchTab(tabId) {
    store.activeTab = tabId;
    document.querySelectorAll(".tab-btn").forEach(b => {
      if (b.getAttribute("data-tab") === tabId) {
        b.classList.add("active-tab");
        b.classList.remove("text-slate-600", "dark:text-slate-400");
      } else {
        b.classList.remove("active-tab");
        b.classList.add("text-slate-600", "dark:text-slate-400");
      }
    });

    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));
    const activePane = document.getElementById(`tab-content-${tabId}`);
    if (activePane) activePane.classList.remove("hidden");

    if (tabId === "analytics") {
      this.renderPerformanceAnalysis();
    } else if (tabId === "submissions-view") {
      this.renderSubmissionsTable();
    } else if (tabId === "assessment-submissions-view") {
      this.renderAssessmentSubmissionsTable();
    } else if (tabId === "bugs-view") {
      this.renderBugsTable();
    } else if (tabId === "active-today-view") {
      this.renderActiveTodayTable();
    } else if (tabId === "completed-tasks-view") {
      this.renderCompletedTasksTable();
    } else if (tabId === "file-dashboard-view") {
      this.renderFileDashboard();
    }
    lucide.createIcons();
  }

  // ================= SUPERVISOR DASHBOARD RENDER =================
  renderSupervisorDashboard() {
    this.renderKPIStats();
    this.renderInternsList();
    this.renderActiveTodayTable();
    this.renderCompletedTasksTable();
    this.renderAssessmentSubmissionsTable();
    this.renderKanbanBoard();
    this.renderSubmissionsTable();
    this.renderFileDashboard();
    this.renderBugsTable();
    this.renderDailyLogs();
    lucide.createIcons();
  }

  renderKPIStats() {
    const totalInterns = store.interns.length;
    const todayStr = new Date().toISOString().split("T")[0];
    const activeInterns = store.interns.filter(i => i.lastLoginDate === todayStr).length;

    const regularTasksCompleted = store.tasks.filter(t => t.type === "Task" && (t.status === "Task Completed" || t.status === "Completed")).length;
    const assessmentsCompleted = store.tasks.filter(t => t.type === "Assessment" && (t.status === "Assessment Completed" || t.status === "Completed")).length;
    const zipSubmissionsCount = store.submissions.length;
    const filesStoredCount = (store.files || []).length;

    // Weekly 10 Bugs Quota
    const resolvedBugsCount = store.bugs.filter(b => b.status === "Resolved").length;
    const bugQuotaPct = Math.min(100, Math.round((resolvedBugsCount / 10) * 100));

    document.getElementById("stat-total-interns").textContent = totalInterns;
    document.getElementById("stat-active-interns").textContent = activeInterns;
    document.getElementById("stat-tasks-completed").textContent = regularTasksCompleted;
    document.getElementById("stat-assessments-completed").textContent = assessmentsCompleted;
    document.getElementById("stat-zip-submissions").textContent = zipSubmissionsCount;
    document.getElementById("stat-bugs-count").textContent = resolvedBugsCount;

    const badgeActive = document.getElementById("badge-active-today-count");
    if (badgeActive) badgeActive.textContent = activeInterns;
    const tabActiveBadge = document.getElementById("tab-active-today-count-badge");
    if (tabActiveBadge) tabActiveBadge.innerHTML = `${activeInterns} Active`;

    const badgeCompleted = document.getElementById("badge-completed-tasks-count");
    if (badgeCompleted) badgeCompleted.textContent = regularTasksCompleted;
    const tabCompletedBadge = document.getElementById("tab-completed-tasks-count-badge");
    if (tabCompletedBadge) tabCompletedBadge.textContent = `${regularTasksCompleted} Completed`;

    const badgeAssessments = document.getElementById("badge-assessment-submissions-count");
    if (badgeAssessments) badgeAssessments.textContent = assessmentsCompleted;
    const tabAssessmentBadge = document.getElementById("tab-assessment-count-badge");
    if (tabAssessmentBadge) tabAssessmentBadge.textContent = `${assessmentsCompleted} Assessments Submitted`;

    const badgeFiles = document.getElementById("badge-files-count");
    if (badgeFiles) badgeFiles.textContent = filesStoredCount;
    const tabFilesBadge = document.getElementById("tab-file-dashboard-count-badge");
    if (tabFilesBadge) tabFilesBadge.textContent = `${filesStoredCount} Files Stored`;

    const capacityPct = Math.min(100, Math.round((totalInterns / 20) * 100));
    document.getElementById("stat-capacity-bar").style.width = `${capacityPct}%`;
    document.getElementById("stat-tasks-bar").style.width = `${Math.min(100, regularTasksCompleted * 15)}%`;
    document.getElementById("stat-assessment-bar").style.width = `${Math.min(100, assessmentsCompleted * 20)}%`;
    document.getElementById("stat-bugs-bar").style.width = `${bugQuotaPct}%`;

    document.getElementById("badge-tab-count").textContent = totalInterns;
    document.getElementById("badge-submissions-count").textContent = zipSubmissionsCount;
    document.getElementById("badge-bugs-count").textContent = `${resolvedBugsCount}/10`;

    // Bugs Quota Banner in Bugs Tab
    const quotaText = document.getElementById("bugs-quota-text");
    if (quotaText) quotaText.textContent = `${resolvedBugsCount} of 10 resolved this week`;
    const quotaPctText = document.getElementById("bugs-quota-pct");
    if (quotaPctText) quotaPctText.textContent = `${bugQuotaPct}%`;
    const quotaBar = document.getElementById("bugs-quota-bar");
    if (quotaBar) quotaBar.style.width = `${bugQuotaPct}%`;
    const pill = document.getElementById("badge-weekly-quota-pill");
    if (pill) pill.textContent = `${resolvedBugsCount} / 10 Bugs Solved`;
  }

  renderInternsList() {
    const container = document.getElementById("interns-grid");
    const emptyState = document.getElementById("interns-empty-state");
    container.innerHTML = "";

    const filtered = store.interns.filter(intern => {
      const name = (intern.name || "").toLowerCase();
      const domain = (intern.domain || "").toLowerCase();
      const college = (intern.college || "").toLowerCase();
      const username = (intern.username || "").toLowerCase();
      const q = (store.searchQuery || "").toLowerCase().trim();

      const matchSearch = q === "" || 
        name.includes(q) ||
        domain.includes(q) ||
        college.includes(q) ||
        username.includes(q);

      let matchStatus = true;
      if (store.statusFilter === "ACTIVE_TODAY") {
        const todayStr = new Date().toISOString().split("T")[0];
        const lastLogin = intern.lastLoginDate || intern.last_login_date || "";
        matchStatus = lastLogin === todayStr;
      } else if (store.statusFilter !== "ALL") {
        matchStatus = intern.status === store.statusFilter;
      }

      return matchSearch && matchStatus;
    });

    // If no interns exist, display clean empty state
    if (filtered.length === 0) {
      container.classList.add("hidden");
      emptyState.classList.remove("hidden");
      return;
    } else {
      container.classList.remove("hidden");
      emptyState.classList.add("hidden");
    }

    const todayStr = new Date().toISOString().split("T")[0];

    filtered.forEach(intern => {
      const tasks = store.getTasksForIntern(intern.id);
      const tasksDone = tasks.filter(t => t.type === "Task" && (t.status === "Task Completed" || t.status === "Completed")).length;
      const assessmentsDone = tasks.filter(t => t.type === "Assessment" && (t.status === "Assessment Completed" || t.status === "Completed")).length;
      const subs = store.getSubmissionsForIntern(intern.id);
      const bugs = store.getBugsForIntern(intern.id).filter(b => b.status === "Resolved");
      const currentTask = tasks.find(t => t.status === "In Progress") || tasks[0] || null;
      const initials = intern.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

      const isLoggedToday = intern.lastLoginDate === todayStr;

      let statusBadge = "";
      if (intern.status === "Active") {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
        </span>`;
      } else if (intern.status === "Task Completed") {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">Task Done</span>`;
      } else if (intern.status === "Assessment Completed") {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300">Assessment Done</span>`;
      } else {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200">${intern.status}</span>`;
      }

      if (isLoggedToday) {
        statusBadge += `
          <span class="mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center justify-center" title="Logged in today at ${intern.lastLoginTime || 'Today'}">
            Working Today
          </span>
        `;
      }

      const card = document.createElement("div");
      card.className = "intern-card bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between";
      card.innerHTML = `
        <div>
          <!-- Header -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl ${intern.avatarBg || 'avatar-gradient-1'} text-white font-bold text-sm flex items-center justify-center shadow-md">
                ${initials}
              </div>
              <div>
                <h4 class="text-sm font-bold text-slate-900 dark:text-white hover:text-cyan-600 cursor-pointer" onclick="ui.openDetailModal('${intern.id}')">
                  ${intern.name}
                </h4>
                <p class="text-xs text-cyan-600 dark:text-cyan-400 font-semibold">${intern.domain}</p>
                <p class="text-[11px] text-slate-400 truncate max-w-[210px]" title="${intern.college || 'N/A'}${intern.department ? ' • ' + intern.department : ''}${intern.year ? ' (' + intern.year + ')' : ''}">
                  ${intern.college || 'N/A'}${intern.department ? ' &bull; ' + intern.department : ''}${intern.year ? ' <span class="text-cyan-600 dark:text-cyan-400 font-medium">(' + intern.year + ')</span>' : ''}
                </p>
              </div>
            </div>
            <div>${statusBadge}</div>
          </div>

          <!-- Active Work -->
          <div class="mt-3.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800/80">
            <div class="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
              <span>Active Work</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${currentTask?.type === 'Assessment' ? 'bg-emerald-100 text-emerald-700' : 'bg-cyan-100 text-cyan-700'}">
                ${currentTask?.type || 'Task'}
              </span>
            </div>
            <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
              ${currentTask ? currentTask.title : '<span class="italic text-slate-400">No active work assigned</span>'}
            </p>
          </div>

          <!-- Performance Metrics -->
          <div class="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px]">
            <div class="p-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-100 dark:border-cyan-900/40">
              <span class="text-slate-400 block font-medium">Tasks</span>
              <span class="text-xs font-black text-cyan-600 dark:text-cyan-400">${tasksDone}</span>
            </div>
            <div class="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40">
              <span class="text-slate-400 block font-medium">Assessments</span>
              <span class="text-xs font-black text-emerald-600 dark:text-emerald-400">${assessmentsDone}</span>
            </div>
            <div class="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40">
              <span class="text-slate-400 block font-medium">Bugs</span>
              <span class="text-xs font-black text-rose-600 dark:text-rose-400">${bugs.length}</span>
            </div>
            <div class="p-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40">
              <span class="text-slate-400 block font-medium">ZIPs</span>
              <span class="text-xs font-black text-amber-600 dark:text-amber-400">${subs.length}</span>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1 text-xs">
          <button 
            onclick="ui.openDetailModal('${intern.id}')"
            class="px-3 py-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 font-bold flex items-center gap-1.5 border border-cyan-200 dark:border-cyan-800/60 shadow-sm transition-colors"
            title="View Full Profile & Credentials">
            <i data-lucide="eye" class="w-4 h-4 text-cyan-600 dark:text-cyan-400"></i> Profile
          </button>
          
          <div class="flex items-center gap-1">
            <button onclick="ui.openTaskModal('${intern.id}')" title="Assign Work" class="p-1.5 rounded-lg text-cyan-600 hover:bg-cyan-50">
              <i data-lucide="plus-circle" class="w-4 h-4"></i>
            </button>
            <button onclick="ui.openUploadZipModal('${intern.id}')" title="Upload ZIP" class="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50">
              <i data-lucide="file-archive" class="w-4 h-4"></i>
            </button>
            <button onclick="ui.openBugModal('${intern.id}')" title="Log Bug" class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50">
              <i data-lucide="bug" class="w-4 h-4"></i>
            </button>
            <button onclick="ui.openInternModal(store.getIntern('${intern.id}'))" title="Edit Intern" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="ui.confirmDeleteIntern('${intern.id}')" title="Remove Intern" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    lucide.createIcons();
  }

  // ================= KANBAN BOARD =================
  renderKanbanBoard() {
    const statuses = ["To Do", "In Progress", "Under Review", "Completed"];
    
    statuses.forEach(status => {
      const colId = status.toLowerCase().replace(/\s+/g, '');
      const dropzone = document.getElementById(`kanban-col-${colId}`);
      const countEl = document.getElementById(`kanban-count-${colId}`);
      if (!dropzone) return;

      dropzone.innerHTML = "";
      
      const tasksInCol = store.tasks.filter(t => {
        let isMatch = false;
        if (status === "Completed") {
          isMatch = (t.status === "Task Completed" || t.status === "Assessment Completed" || t.status === "Completed");
        } else {
          isMatch = (t.status === status);
        }

        if (!isMatch) return false;
        if (!store.searchQuery) return true;
        const intern = store.getIntern(t.internId);
        const internName = intern ? intern.name.toLowerCase() : "";
        return t.title.toLowerCase().includes(store.searchQuery) || internName.includes(store.searchQuery);
      });

      if (countEl) countEl.textContent = tasksInCol.length;

      if (tasksInCol.length === 0) {
        dropzone.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 italic">No tasks in this stage</div>`;
        return;
      }

      tasksInCol.forEach(task => {
        const intern = store.getIntern(task.internId);
        const internName = intern ? intern.name : "Unassigned";
        const isAssessment = task.type === "Assessment";
        
        const card = document.createElement("div");
        card.className = "kanban-card bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-2";
        card.setAttribute("draggable", "true");
        card.setAttribute("data-task-id", task.id);

        card.innerHTML = `
          <div class="flex items-center justify-between text-[10px]">
            <span class="px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              isAssessment ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
            }">
              ${task.type || 'Task'}
            </span>
            <span class="text-rose-500 font-bold uppercase text-[9px]">${task.priority}</span>
          </div>

          <h5 class="text-xs font-bold text-slate-900 dark:text-white leading-snug">${task.title}</h5>

          ${task.status === "Task Completed" ? `
            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
              ✓ Task Completed
            </span>
          ` : task.status === "Assessment Completed" ? `
            <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ★ Assessment Completed
            </span>
          ` : ''}

          <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
            <div class="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-semibold cursor-pointer" onclick="ui.openDetailModal('${task.internId}')">
              <i data-lucide="user" class="w-3.5 h-3.5"></i>
              <span class="truncate max-w-[110px]">${internName}</span>
            </div>
            <button onclick="ui.openUploadZipModal('${task.internId}', '${task.id}')" title="Upload ZIP for this work" class="text-amber-600 hover:underline flex items-center gap-0.5 text-[10px] font-mono">
              <i data-lucide="file-archive" class="w-3 h-3"></i> .ZIP
            </button>
          </div>
        `;

        dropzone.appendChild(card);
      });
    });

    lucide.createIcons();
  }

  setupKanbanDragDrop() {
    document.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".kanban-card");
      if (card) {
        card.classList.add("is-dragging");
        e.dataTransfer.setData("text/plain", card.getAttribute("data-task-id"));
        e.dataTransfer.effectAllowed = "move";
      }
    });

    document.addEventListener("dragend", (e) => {
      const card = e.target.closest(".kanban-card");
      if (card) card.classList.remove("is-dragging");
    });

    const dropzones = document.querySelectorAll(".kanban-dropzone");
    dropzones.forEach(zone => {
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        zone.classList.add("drag-over");
      });

      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));

      zone.addEventListener("drop", async (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        const taskId = e.dataTransfer.getData("text/plain");
        const laneStatus = zone.getAttribute("data-status");

        if (taskId && laneStatus) {
          const task = store.tasks.find(t => t.id === taskId);
          if (!task) return;

          let targetStatus = laneStatus;
          if (laneStatus === "Completed") {
            targetStatus = task.type === "Assessment" ? "Assessment Completed" : "Task Completed";
            this.fireConfetti();
          }

          try {
            await store.updateTaskStatus(taskId, targetStatus);
            this.renderSupervisorDashboard();
            this.showToast(`Updated to ${targetStatus}`);
          } catch (err) {
            this.showToast("Failed to update task status", "error");
          }
        }
      });
    });
  }

  // ================= ACTIVE TODAY TABLE (SHOWS BELOW ON CLICK) =================
  renderActiveTodayTable() {
    const tbody = document.getElementById("table-active-today-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const todayStr = new Date().toISOString().split("T")[0];
    const activeInterns = store.interns.filter(i => i.lastLoginDate === todayStr);

    if (activeInterns.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="py-10 text-center">
            <div class="max-w-md mx-auto space-y-2">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center mx-auto">
                <i data-lucide="user-x" class="w-5 h-5"></i>
              </div>
              <p class="text-xs font-bold text-slate-800 dark:text-white">No interns logged in yet today</p>
              <p class="text-[11px] text-slate-400">
                When interns sign into the <b>Tarcin Interns</b> login page with the credentials given by Guide Palani Pandi C, they will automatically appear here with their login time and ongoing tasks.
              </p>
            </div>
          </td>
        </tr>
      `;
      lucide.createIcons();
      return;
    }

    activeInterns.forEach(intern => {
      const tasks = store.getTasksForIntern(intern.id);
      const currentTask = tasks.find(t => t.status === "In Progress") || tasks[0];
      const initials = intern.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors";
      tr.innerHTML = `
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg ${intern.avatarBg || 'avatar-gradient-1'} text-white font-bold text-xs flex items-center justify-center shadow-xs">
              ${initials}
            </div>
            <div>
              <span class="font-bold text-slate-900 dark:text-white block cursor-pointer hover:text-cyan-600" onclick="ui.openDetailModal('${intern.id}')">${intern.name}</span>
              <span class="text-[11px] text-cyan-600 dark:text-cyan-400 font-mono">${intern.username}</span>
            </div>
          </div>
        </td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-300">
          <span class="block font-medium">${intern.college || 'N/A'}</span>
          <span class="text-[11px] text-slate-400">${intern.department || ''}${intern.year ? ' (' + intern.year + ')' : ''}</span>
        </td>
        <td class="py-3 px-4">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 inline-block font-mono">
            ${intern.lastLoginTime || 'Active Today'}
          </span>
        </td>
        <td class="py-3 px-4">
          ${currentTask ? `
            <div class="max-w-xs">
              <span class="font-semibold text-slate-900 dark:text-white block truncate">${currentTask.title}</span>
              <span class="text-[10px] text-slate-400 font-mono">Due: ${currentTask.dueDate} &bull; ${currentTask.type}</span>
            </div>
          ` : `
            <span class="text-slate-400 italic text-[11px]">No active work assigned</span>
          `}
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            Active (Working)
          </span>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="ui.openTaskModal('${intern.id}')" class="px-2.5 py-1 text-xs rounded-lg bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 font-semibold border border-cyan-200 dark:border-cyan-800" title="Assign Task">
              Assign Work
            </button>
            <button onclick="ui.openDetailModal('${intern.id}')" class="px-2.5 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 font-semibold" title="View Profile">
              Profile
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  }

  // ================= COMPLETED TASKS TABLE (SHOWS BELOW ON CLICK) =================
  renderCompletedTasksTable() {
    const tbody = document.getElementById("table-completed-tasks-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const completedTasks = store.tasks.filter(t => t.type === "Task" && (t.status === "Task Completed" || t.status === "Completed"));

    if (completedTasks.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="py-10 text-center">
            <div class="max-w-md mx-auto space-y-2">
              <div class="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 flex items-center justify-center mx-auto">
                <i data-lucide="check-circle" class="w-5 h-5"></i>
              </div>
              <p class="text-xs font-bold text-slate-800 dark:text-white">No tasks marked completed yet</p>
              <p class="text-[11px] text-slate-400">
                When interns finish tasks and submit their .ZIP deliverable (or when Guide Palani marks them as completed), they will appear here.
              </p>
            </div>
          </td>
        </tr>
      `;
      lucide.createIcons();
      return;
    }

    completedTasks.forEach(task => {
      const intern = store.getIntern(task.internId);
      const internName = intern ? intern.name : "Intern";
      const subs = store.getSubmissionsForIntern(task.internId).filter(s => s.taskId === task.id || s.type === "Task");
      const latestSub = subs[0] || null;

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors";
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold text-slate-900 dark:text-white">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
              ${task.type}
            </span>
            <span class="text-slate-900 dark:text-white">${task.title}</span>
          </div>
          ${task.description ? `<p class="text-[11px] text-slate-400 font-normal line-clamp-1">${task.description}</p>` : ''}
        </td>
        <td class="py-3 px-4 font-semibold text-cyan-600 dark:text-cyan-400">
          <span class="cursor-pointer hover:underline" onclick="ui.openDetailModal('${task.internId}')">${internName}</span>
        </td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-300">
          <span>${intern ? intern.college : 'N/A'}</span>
          <span class="text-[11px] text-slate-400 block">${intern?.department ? intern.department : ''}${intern?.year ? ' (' + intern.year + ')' : ''}</span>
        </td>
        <td class="py-3 px-4">
          ${latestSub ? `
            <button onclick="ui.downloadSubmissionZip('${latestSub.id}')" class="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center gap-1.5 border border-amber-200 dark:border-amber-800 shadow-xs active:scale-95 transition-all" title="Click to download ${latestSub.fileName} (${latestSub.fileSize})">
              <i data-lucide="file-archive" class="w-3.5 h-3.5 text-amber-600"></i>
              <span class="truncate max-w-[120px] font-mono text-[11px]">${latestSub.fileName}</span>
              <i data-lucide="download" class="w-3 h-3 text-amber-500"></i>
            </button>
          ` : `
            <span class="text-[11px] text-slate-400 italic">Verified</span>
          `}
        </td>
        <td class="py-3 px-4">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 flex items-center gap-1 w-fit">
            <i data-lucide="check" class="w-3 h-3 text-cyan-600"></i> Completed
          </span>
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="ui.openDetailModal('${task.internId}')" class="px-2.5 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 font-semibold" title="View Intern Profile">
            View Details
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  }

  // ================= SUBMISSIONS & ZIP DOWNLOADS TABLE =================
  renderSubmissionsTable() {
    const tbody = document.getElementById("table-submissions-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const filtered = store.submissions.filter(sub => {
      if (!store.searchQuery) return true;
      const intern = store.getIntern(sub.internId);
      const name = intern ? intern.name.toLowerCase() : "";
      return sub.workTitle.toLowerCase().includes(store.searchQuery) ||
             sub.fileName.toLowerCase().includes(store.searchQuery) ||
             name.includes(store.searchQuery);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 italic">No ZIP submissions uploaded yet. Once interns submit their .ZIP project files, Guide Palani Pandi C can download them here.</td></tr>`;
      return;
    }

    filtered.forEach(sub => {
      const intern = store.getIntern(sub.internId);
      const internName = intern ? intern.name : "Intern";

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors";
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg ${intern?.avatarBg || 'avatar-gradient-1'} text-white font-bold text-[10px] flex items-center justify-center">
            ${internName.charAt(0)}
          </div>
          <span>${internName}</span>
        </td>
        <td class="py-3 px-4 text-slate-800 dark:text-slate-200 font-semibold max-w-[200px] truncate" title="${sub.workTitle}">
          ${sub.workTitle}
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${sub.type === 'Assessment' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'}">
            ${sub.type}
          </span>
        </td>
        <td class="py-3 px-4 font-mono text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
          <i data-lucide="file-archive" class="w-4 h-4"></i>
          <span>${sub.fileName} (${sub.fileSize})</span>
        </td>
        <td class="py-3 px-4 text-slate-500 text-[11px] font-mono">${sub.submittedAt}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
            sub.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }">
            ${sub.status}
          </span>
        </td>
        <td class="py-3 px-4 text-right space-x-1.5">
          <!-- 1-Click Download ZIP Button for Guide Palani Pandi C -->
          <button onclick="ui.downloadSubmissionZip('${sub.id}')" class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-sm active:scale-95 transition-all">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download ZIP
          </button>
          ${sub.status !== 'Approved' ? `
            <button onclick="ui.approveSubmission('${sub.id}')" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1 transition-all" title="Approve Submission">
              <i data-lucide="check" class="w-3.5 h-3.5"></i> Approve
            </button>
          ` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  }

  renderAssessmentSubmissionsTable() {
    const tbody = document.getElementById("table-assessment-submissions-body");
    const countBadge = document.getElementById("tab-assessment-count-badge");
    const tabBadge = document.getElementById("badge-assessment-submissions-count");
    if (!tbody) return;
    tbody.innerHTML = "";

    const assessmentSubs = store.submissions.filter(sub => {
      const task = store.tasks.find(t => t.id === sub.taskId);
      const isAssessment = sub.type === "Assessment" || (task && task.type === "Assessment");
      if (!isAssessment) return false;

      if (!store.searchQuery) return true;
      const intern = store.getIntern(sub.internId);
      const name = intern ? intern.name.toLowerCase() : "";
      return sub.workTitle.toLowerCase().includes(store.searchQuery) ||
             sub.fileName.toLowerCase().includes(store.searchQuery) ||
             name.includes(store.searchQuery);
    });

    if (countBadge) countBadge.textContent = `${assessmentSubs.length} Assessments Submitted`;
    if (tabBadge) tabBadge.textContent = assessmentSubs.length;

    if (assessmentSubs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 italic">No Assessment ZIP files submitted yet. When interns submit their Assessment deliverables from their portal, they will appear here for Guide Palani Pandi C to download and evaluate.</td></tr>`;
      return;
    }

    assessmentSubs.forEach(sub => {
      const intern = store.getIntern(sub.internId);
      const internName = intern ? intern.name : "Intern";
      const collegeDept = intern ? `${intern.college || 'N/A'}${intern.department ? ' • ' + intern.department : ''}` : "N/A";

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors";
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg ${intern?.avatarBg || 'avatar-gradient-3'} text-white font-bold text-[10px] flex items-center justify-center">
            ${internName.charAt(0)}
          </div>
          <span>${internName}</span>
        </td>
        <td class="py-3 px-4 text-slate-800 dark:text-slate-200 font-semibold max-w-[220px] truncate" title="${sub.workTitle}">
          <div class="flex items-center gap-1.5">
            <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Assessment</span>
            <span class="truncate">${sub.workTitle}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-slate-500 text-[11px]">${collegeDept}</td>
        <td class="py-3 px-4 font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
          <i data-lucide="file-archive" class="w-4 h-4 text-emerald-600"></i>
          <span>${sub.fileName} (${sub.fileSize})</span>
        </td>
        <td class="py-3 px-4 text-slate-500 text-[11px] font-mono">${sub.submittedAt}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
            sub.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }">
            ${sub.status}
          </span>
        </td>
        <td class="py-3 px-4 text-right space-x-1.5">
          <button onclick="ui.downloadSubmissionZip('${sub.id}')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-sm active:scale-95 transition-all" title="Download Assessment ZIP">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download ZIP
          </button>
          ${sub.status !== 'Approved' ? `
            <button onclick="ui.approveSubmission('${sub.id}')" class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-[11px] inline-flex items-center gap-1 transition-all" title="Mark Evaluated">
              <i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i> Approve
            </button>
          ` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  }

  // ================= FILE DASHBOARD (PROJECT ZIP STORAGE) =================
  renderFileDashboard() {
    const tbody = document.getElementById("table-files-dashboard-body");
    const filterSelect = document.getElementById("file-dashboard-filter-intern");
    if (!tbody) return;

    if (filterSelect && filterSelect.options.length <= 1) {
      filterSelect.innerHTML = `<option value="ALL">All Interns</option><option value="all">Shared (All Interns)</option>`;
      store.interns.forEach(intern => {
        const opt = document.createElement("option");
        opt.value = intern.id;
        opt.textContent = `${intern.name} (${intern.username})`;
        filterSelect.appendChild(opt);
      });
    }

    const files = store.files || [];
    const search = (document.getElementById("file-dashboard-search")?.value || "").toLowerCase().trim();
    const filterIntern = document.getElementById("file-dashboard-filter-intern")?.value || "ALL";

    const filtered = files.filter(f => {
      const fileName = (f.fileName || f.file_name || "").toLowerCase();
      const desc = (f.description || "").toLowerCase();
      const internName = (f.internName || f.intern_name || "").toLowerCase();
      const taskTitle = (f.taskTitle || f.task_title || "").toLowerCase();
      const matchesSearch = !search || fileName.includes(search) || desc.includes(search) || internName.includes(search) || taskTitle.includes(search);
      
      let matchesIntern = true;
      if (filterIntern !== "ALL") {
        matchesIntern = (f.internId === filterIntern || f.intern_id === filterIntern);
      }
      return matchesSearch && matchesIntern;
    });

    const badge = document.getElementById("tab-file-dashboard-count-badge");
    if (badge) badge.textContent = `${files.length} Files Stored`;
    const tabBadge = document.getElementById("badge-files-count");
    if (tabBadge) tabBadge.textContent = files.length;

    tbody.innerHTML = "";
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400 italic">No project ZIP files found. Click <b>+ Add ZIP File</b> to upload starter projects, source codes, and documentation for interns.</td></tr>`;
      return;
    }

    filtered.forEach(file => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors";
      const fileName = file.fileName || file.file_name || 'project.zip';
      const fileSize = file.fileSize || file.file_size || '';
      const taskTitle = file.taskTitle || file.task_title || 'General Starter Kit';
      const internName = file.internName || file.intern_name || 'All Interns';
      const dateStr = file.created_at ? new Date(file.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A';

      tr.innerHTML = `
        <td class="py-3 px-4">
          <div class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
              <i data-lucide="file-archive" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>${fileName}</span>
                <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">ZIP</span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">${file.description || 'No description'}</p>
              <span class="text-[10px] text-slate-400 font-mono">ID: ${file.id}</span>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            ${taskTitle}
          </span>
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-1.5">
            <span class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-bold flex items-center justify-center">
              ${internName.slice(0, 2).toUpperCase()}
            </span>
            <span class="font-semibold text-slate-800 dark:text-slate-200">${internName}</span>
          </div>
        </td>
        <td class="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
          ${fileSize}
        </td>
        <td class="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
          ${dateStr}
        </td>
        <td class="py-3 px-4 text-right space-x-1">
          <button onclick="ui.downloadFileZip('${file.id}')" class="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-sm active:scale-95 transition-all" title="Download ZIP Archive">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download
          </button>
          <button onclick="ui.confirmDeleteFile('${file.id}')" class="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors" title="Delete ZIP File">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    lucide.createIcons();
  }

  filterFileDashboard() {
    this.renderFileDashboard();
  }

  openAddZipFileModal() {
    if (store.viewingGuideAsIntern) return;
    this.closeAllModals();
    const modal = document.getElementById("modal-add-zip-file");
    if (!modal) return;

    document.getElementById("form-add-file-zip")?.reset();
    const fileLabel = document.getElementById("file-zip-selected-label");
    if (fileLabel) fileLabel.textContent = "Click to browse or drag & drop .ZIP file";

    const taskSelect = document.getElementById("file-zip-task-select");
    if (taskSelect) {
      taskSelect.innerHTML = `<option value="">General Project Resource / Starter Kit</option>`;
      store.tasks.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `[${t.type}] ${t.title}`;
        taskSelect.appendChild(opt);
      });
    }

    const internSelect = document.getElementById("file-zip-intern-select");
    if (internSelect) {
      internSelect.innerHTML = `<option value="all">All Interns (Shared Resource)</option>`;
      store.interns.forEach(i => {
        const opt = document.createElement("option");
        opt.value = i.id;
        opt.textContent = `${i.name} (${i.college || i.department || 'Intern'})`;
        internSelect.appendChild(opt);
      });
    }

    modal.classList.remove("hidden");
    lucide.createIcons();
  }

  async handleAddFileZipSubmit(e) {
    e.preventDefault();
    const fileInput = document.getElementById("file-zip-input");
    const description = document.getElementById("file-zip-description").value.trim();
    const taskId = document.getElementById("file-zip-task-select").value;
    const internId = document.getElementById("file-zip-intern-select").value;

    if (!fileInput.files || fileInput.files.length === 0) {
      this.showToast("Please choose a .ZIP archive to upload.", "error");
      return;
    }

    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith(".zip")) {
      this.showToast("Only .ZIP files are allowed!", "error");
      return;
    }

    const submitBtn = document.getElementById("btn-submit-add-file-zip");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Uploading...`;
      lucide.createIcons();
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("description", description);
      if (taskId) formData.append("taskId", taskId);
      if (internId) formData.append("internId", internId);

      await store.addFile(formData);
      this.closeAllModals();
      this.renderFileDashboard();
      this.showToast(`ZIP File "${file.name}" uploaded to File Dashboard successfully!`);
    } catch (err) {
      console.error("File upload error:", err);
      this.showToast(err.message || "Failed to upload file to central server", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="upload" class="w-3.5 h-3.5"></i> Upload ZIP File`;
        lucide.createIcons();
      }
    }
  }

  async confirmDeleteFile(fileId) {
    if (store.viewingGuideAsIntern) return;
    const file = (store.files || []).find(f => f.id === fileId);
    const fileName = (file && (file.fileName || file.file_name)) || 'this file';
    if (!confirm(`Are you sure you want to delete "${fileName}" from the File Dashboard?`)) return;

    try {
      await store.deleteFile(fileId);
      this.renderFileDashboard();
      this.showToast(`Deleted "${fileName}" from File Dashboard.`);
    } catch (err) {
      this.showToast(err.message || "Failed to delete file", "error");
    }
  }

  async downloadFileZip(fileId) {
    const file = (store.files || []).find(f => f.id === fileId);
    try {
      const token = api.getToken();
      const res = await fetch(`${api.getBaseUrl()}/api/files/${fileId}/download`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (file && (file.fileName || file.file_name)) || `project_file_${fileId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast(`Downloading: ${(file && (file.fileName || file.file_name)) || 'ZIP File'}`);
    } catch (e) {
      console.error("Error downloading file", e);
      this.showToast(e.message || "Download failed, please retry", "error");
    }
  }

  async downloadSubmissionZip(subId) {
    if (store.viewingGuideAsIntern) return; // Prevent interns from downloading others' submissions
    const sub = store.submissions.find(s => s.id === subId);
    if (!sub) return;

    this.showToast(`Downloading ${sub.fileName}...`, "info");
    try {
      const token = api.getToken();
      const res = await fetch(`${api.getBaseUrl()}/api/submissions/${subId}/download`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        throw new Error('Download failed with status ' + res.status);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = sub.fileName.endsWith(".zip") ? sub.fileName : `${sub.fileName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast(`Downloaded ${sub.fileName}!`);
    } catch (e) {
      console.error("Error downloading file", e);
      this.showToast("Download failed, please retry", "error");
    }
  }

  async approveSubmission(subId) {
    try {
      const sub = await store.updateSubmissionStatus(subId, "Approved");
      if (sub && sub.taskId) {
        const targetStatus = sub.type === "Assessment" ? "Assessment Completed" : "Task Completed";
        await store.updateTaskStatus(sub.taskId, targetStatus);
      }
      this.fireConfetti();
      this.showToast("Deliverable approved and marked completed!");
      this.renderSupervisorDashboard();
    } catch (err) {
      this.showToast(err.message || "Approval failed", "error");
    }
  }

  async rejectSubmission(subId) {
    const reason = prompt("Enter revision feedback for intern:") || "Needs revision.";
    try {
      await store.updateSubmissionStatus(subId, "Rejected", reason);
      this.showToast("Submission marked as needing revision.");
      this.renderSupervisorDashboard();
    } catch (err) {
      this.showToast(err.message || "Failed to update submission", "error");
    }
  }

  // ================= BUGS TABLE (WEEKLY 10-BUG QUOTA) =================
  renderBugsTable() {
    const tbody = document.getElementById("table-bugs-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (store.bugs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 italic">No bugs logged yet this week. Interns must find, document, and resolve 10 bugs each week!</td></tr>`;
      return;
    }

    store.bugs.forEach(bug => {
      const intern = store.getIntern(bug.internId);
      const internName = intern ? intern.name : "Intern";

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors";
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold text-slate-900 dark:text-white">
          ${bug.title}
          ${bug.description ? `<p class="text-[11px] text-slate-400 font-normal mt-0.5">${bug.description}</p>` : ''}
        </td>
        <td class="py-3 px-4 font-semibold text-cyan-600 dark:text-cyan-400">
          ${internName}
        </td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-300">
          ${bug.category}
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
            bug.severity === 'Critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
          }">
            ${bug.severity}
          </span>
        </td>
        <td class="py-3 px-4">
          ${bug.hasDocument ? `
            <button onclick="ui.downloadBugDoc('${bug.id}')" class="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center gap-1.5 border border-rose-200 dark:border-rose-800 shadow-xs active:scale-95 transition-all" title="Download ${bug.documentName || 'Bug Document'} (${bug.documentSize || ''})">
              <i data-lucide="file-text" class="w-3.5 h-3.5 text-rose-500"></i>
              <span class="truncate max-w-[120px] font-mono text-[11px]">${bug.documentName || 'Document'}</span>
              <i data-lucide="download" class="w-3 h-3 text-rose-400"></i>
            </button>
          ` : `
            <span class="text-[11px] text-slate-400 italic">No doc</span>
          `}
        </td>
        <td class="py-3 px-4">
          <button onclick="ui.toggleBugStatus('${bug.id}')" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
            bug.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }">
            ${bug.status === 'Resolved' ? '✓ Resolved' : '● Open'}
          </button>
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="ui.deleteBug('${bug.id}')" class="p-1 rounded text-slate-400 hover:text-rose-600">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  }

  async downloadBugDoc(bugId) {
    const bug = store.bugs.find(b => b.id === bugId);
    if (!bug) {
      this.showToast("Bug record not found", "error");
      return;
    }

    try {
      const token = api.getToken();
      const res = await fetch(`${api.getBaseUrl()}/api/bugs/${bugId}/download`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = bug.documentName || `Bug_Report_${bugId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast(`Downloading: ${bug.documentName || 'Bug Report'}`);
    } catch (e) {
      console.error("Error downloading bug document", e);
      this.showToast("Download failed, please retry", "error");
    }
  }

  async toggleBugStatus(bugId) {
    try {
      await store.toggleBugStatus(bugId);
      this.renderSupervisorDashboard();
      if (store.currentRole === "intern") this.renderInternPortal();
      this.showToast("Bug status toggled!");
    } catch (err) {
      this.showToast("Failed to toggle bug status", "error");
    }
  }

  async deleteBug(bugId) {
    if (confirm("Delete this bug entry?")) {
      try {
        await store.deleteBug(bugId);
        this.renderSupervisorDashboard();
        if (store.currentRole === "intern") this.renderInternPortal();
        this.showToast("Bug deleted");
      } catch (err) {
        this.showToast("Failed to delete bug", "error");
      }
    }
  }

  // ================= DAILY LOGS FEED =================
  renderDailyLogs() {
    const list = document.getElementById("standup-logs-list");
    if (!list) return;
    list.innerHTML = "";

    const sorted = [...store.logs].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
      list.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 italic">No daily standup logs yet.</div>`;
      return;
    }

    sorted.forEach(log => {
      const intern = store.getIntern(log.internId);
      const internName = intern ? intern.name : "Intern";
      const domain = intern ? intern.domain : "";
      const initials = internName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

      const item = document.createElement("div");
      item.className = "p-4 sm:p-5 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors";
      item.innerHTML = `
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl ${intern?.avatarBg || 'avatar-gradient-1'} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              ${initials}
            </div>
            <div class="space-y-1.5">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-bold text-slate-900 dark:text-white cursor-pointer hover:text-cyan-600" onclick="ui.openDetailModal('${log.internId}')">
                  ${internName}
                </span>
                <span class="text-xs text-cyan-600 dark:text-cyan-400 font-medium">&bull; ${domain}</span>
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1 font-mono">
                  <i data-lucide="clock" class="w-3 h-3"></i> ${log.hours}h
                </span>
              </div>

              <div class="text-xs text-slate-700 dark:text-slate-300">
                <strong class="font-semibold text-slate-900 dark:text-white">Completed:</strong> ${log.completed}
              </div>

              ${log.nextPlan ? `
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  <strong class="font-medium text-slate-700 dark:text-slate-300">Next Plan:</strong> ${log.nextPlan}
                </div>
              ` : ''}

              ${log.blocker ? `
                <div class="mt-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500 shrink-0 mt-0.5"></i>
                  <div>
                    <span class="font-bold">Doubt / Question for Palani:</span> ${log.blocker}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
          <span class="text-xs font-semibold text-slate-400 shrink-0 font-mono">${log.date}</span>
        </div>
      `;
      list.appendChild(item);
    });

    lucide.createIcons();
  }

  // ================= STUDENT PERFORMANCE ANALYSIS (WHO WORKS BEST) =================
  renderPerformanceAnalysis() {
    const isDark = document.documentElement.classList.contains("dark");
    const textColor = isDark ? "#94a3b8" : "#475569";
    const gridColor = isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.8)";

    const topCards = document.getElementById("performance-top-cards");
    const tbody = document.getElementById("table-performance-body");
    if (!topCards || !tbody) return;

    topCards.innerHTML = "";
    tbody.innerHTML = "";

    if (store.interns.length === 0) {
      topCards.innerHTML = `<div class="col-span-3 p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">No interns added yet to analyze. Add interns and assign work to view performance ranking!</div>`;
      tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400 italic">No interns to rank.</td></tr>`;
      return;
    }

    // Calculate score for each student
    const studentScores = store.interns.map(intern => {
      const tasks = store.getTasksForIntern(intern.id);
      const tasksDone = tasks.filter(t => t.type === "Task" && (t.status === "Task Completed" || t.status === "Completed")).length;
      const assessmentsDone = tasks.filter(t => t.type === "Assessment" && (t.status === "Assessment Completed" || t.status === "Completed")).length;
      const zips = store.getSubmissionsForIntern(intern.id).length;
      const bugs = store.getBugsForIntern(intern.id).filter(b => b.status === "Resolved").length;

      // Score weightage: Assessment=3, Task=2, Bug=2, ZIP=1
      const score = (assessmentsDone * 3) + (tasksDone * 2) + (bugs * 2) + (zips * 1);
      return {
        intern,
        tasksDone,
        assessmentsDone,
        zips,
        bugs,
        score
      };
    }).sort((a, b) => b.score - a.score);

    // Top 3 Podium Cards
    const medals = [
      { rank: "1st Place", badge: "🥇 Top Performer", color: "from-amber-500/20 to-yellow-500/10 border-amber-400/40" },
      { rank: "2nd Place", badge: "🥈 Runner Up", color: "from-slate-400/20 to-slate-300/10 border-slate-400/40" },
      { rank: "3rd Place", badge: "🥉 High Achiever", color: "from-amber-700/20 to-amber-600/10 border-amber-600/40" }
    ];

    studentScores.slice(0, 3).forEach((item, idx) => {
      const m = medals[idx];
      const card = document.createElement("div");
      card.className = `p-4 rounded-2xl bg-gradient-to-b ${m.color} bg-white dark:bg-slate-900 border shadow-sm relative overflow-hidden`;
      card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider">${m.badge}</span>
          <span class="text-lg font-black text-cyan-600 dark:text-cyan-400 font-mono">${item.score} pts</span>
        </div>
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white cursor-pointer hover:text-cyan-600" onclick="ui.openDetailModal('${item.intern.id}')">
          ${item.intern.name}
        </h3>
        <p class="text-xs text-slate-500 mb-3">${item.intern.domain} &bull; ${item.intern.college}</p>
        <div class="grid grid-cols-3 gap-1.5 text-center text-[10px] pt-3 border-t border-slate-200/60 dark:border-slate-800">
          <div class="p-1 rounded bg-white/60 dark:bg-slate-800/60">
            <span class="text-slate-400 block">Tasks</span>
            <b class="text-cyan-600 font-bold">${item.tasksDone}</b>
          </div>
          <div class="p-1 rounded bg-white/60 dark:bg-slate-800/60">
            <span class="text-slate-400 block">Assessments</span>
            <b class="text-emerald-600 font-bold">${item.assessmentsDone}</b>
          </div>
          <div class="p-1 rounded bg-white/60 dark:bg-slate-800/60">
            <span class="text-slate-400 block">Bugs</span>
            <b class="text-rose-600 font-bold">${item.bugs}</b>
          </div>
        </div>
      `;
      topCards.appendChild(card);
    });

    // Comparative Bar Chart
    const ctx = document.getElementById("chart-student-performance")?.getContext("2d");
    if (ctx) {
      if (this.performanceChart) this.performanceChart.destroy();
      const labels = studentScores.map(s => s.intern.name);
      const tasksData = studentScores.map(s => s.tasksDone);
      const assessmentsData = studentScores.map(s => s.assessmentsDone);
      const bugsData = studentScores.map(s => s.bugs);

      this.performanceChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "Tasks Completed", data: tasksData, backgroundColor: "#06b6d4", borderRadius: 4 },
            { label: "Assessments Done", data: assessmentsData, backgroundColor: "#10b981", borderRadius: 4 },
            { label: "Bugs Solved", data: bugsData, backgroundColor: "#f43f5e", borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { color: textColor, font: { size: 11 } } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, stepSize: 1, precision: 0 } }
          }
        }
      });
    }

    // Leaderboard Table
    studentScores.forEach((item, index) => {
      const medal = index === 0 ? "🥇 Rank 1" : index === 1 ? "🥈 Rank 2" : index === 2 ? "🥉 Rank 3" : `Rank ${index + 1}`;
      let statusBadge = item.score >= 5 
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Excellent 🌟</span>`
        : item.score >= 2 
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800">Good Progress</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">Getting Started</span>`;

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors";
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">${medal}</td>
        <td class="py-3 px-4 font-bold text-slate-900 dark:text-white cursor-pointer hover:text-cyan-600" onclick="ui.openDetailModal('${item.intern.id}')">
          ${item.intern.name}
          <div class="text-[10px] text-slate-400 font-normal">${item.intern.college}</div>
        </td>
        <td class="py-3 px-4 font-bold text-cyan-600 dark:text-cyan-400">${item.tasksDone}</td>
        <td class="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">${item.assessmentsDone}</td>
        <td class="py-3 px-4 font-bold text-rose-600 dark:text-rose-400">${item.bugs}</td>
        <td class="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">${item.zips}</td>
        <td class="py-3 px-4 font-mono font-black text-sm text-cyan-600 dark:text-cyan-400">${item.score} pts</td>
        <td class="py-3 px-4 text-right">${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  }

  // ================= TARCIN INTERNS PORTAL =================
  renderInternPortal() {
    const intern = store.getIntern(store.currentInternId);
    if (!intern) {
      this.logout();
      return;
    }

    document.getElementById("intern-portal-welcome-name").textContent = intern.name;
    document.getElementById("intern-portal-domain").textContent = intern.domain;

    // Populate Top Banner with Intern Profile (Name, College, Year entered by Guide Palani)
    const bannerName = document.getElementById("intern-banner-name");
    if (bannerName) bannerName.textContent = intern.name;

    const bannerCollege = document.getElementById("intern-banner-college");
    if (bannerCollege) bannerCollege.textContent = intern.college || "Tarcin Engineering Intern";

    const bannerYear = document.getElementById("intern-banner-year");
    if (bannerYear) {
      bannerYear.textContent = intern.year || "3rd Year";
      bannerYear.classList.toggle("hidden", !intern.year);
    }

    const bannerDept = document.getElementById("intern-banner-dept");
    const bannerDeptSep = document.getElementById("intern-banner-dept-separator");
    if (bannerDept) {
      if (intern.department) {
        bannerDept.textContent = intern.department;
        bannerDept.classList.remove("hidden");
        if (bannerDeptSep) bannerDeptSep.classList.remove("hidden");
      } else {
        bannerDept.classList.add("hidden");
        if (bannerDeptSep) bannerDeptSep.classList.add("hidden");
      }
    }

    const bannerAvatar = document.getElementById("intern-banner-avatar");
    if (bannerAvatar) {
      const initials = intern.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
      bannerAvatar.textContent = initials || "IN";
    }

    const tasks = store.getTasksForIntern(intern.id);
    const tasksDone = tasks.filter(t => t.type === "Task" && (t.status === "Task Completed" || t.status === "Completed")).length;
    const assessmentsDone = tasks.filter(t => t.type === "Assessment" && (t.status === "Assessment Completed" || t.status === "Completed")).length;
    const mySubs = store.getSubmissionsForIntern(intern.id);

    document.getElementById("intern-stat-total").textContent = tasks.length;
    document.getElementById("intern-stat-tasks-done").textContent = tasksDone;
    document.getElementById("intern-stat-assessments-done").textContent = assessmentsDone;
    document.getElementById("intern-stat-zips").textContent = mySubs.length;

    // 1. Render Assessments (FIRST as requested by user)
    const assessmentsContainer = document.getElementById("intern-assigned-assessments-list");
    if (assessmentsContainer) {
      assessmentsContainer.innerHTML = "";
      const assessments = tasks.filter(t => t.type === "Assessment");
      // If no pre-assigned assessments, leave empty (removed placeholder message per user request)
      if (assessments.length > 0) {
        assessments.forEach(task => {
          const isDone = (task.status === "Assessment Completed" || task.status === "Completed");
          const div = document.createElement("div");
          div.className = "p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/30 dark:bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3";
          const safeTitle = (task.title || "").replace(/'/g, "\\'");
          const hasRealDesc = task.description && 
            !task.description.startsWith("Deliverable #") && 
            !task.description.startsWith("Initial work deliverable");
          div.innerHTML = `
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                  <i data-lucide="award" class="w-3 h-3"></i> Assessment
                </span>
                <span class="text-[10px] text-slate-400 font-mono">Deadline: ${task.dueDate}</span>
                ${isDone ? `
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300">
                    Completed ✓
                  </span>
                ` : `
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                    ${task.status}
                  </span>
                `}
              </div>
              <h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">${task.title}</h4>
              ${hasRealDesc ? `<p class="text-xs text-slate-500 mt-1">${task.description}</p>` : ''}
            </div>
            <div class="shrink-0 flex items-center gap-2">
              ${isDone ? `
                <span class="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5 border border-emerald-300 dark:border-emerald-700">
                  <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Completed ✓
                </span>
              ` : `
                <button onclick="ui.prefillDirectAssessment('${task.id}', '${safeTitle}')" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all">
                  <i data-lucide="upload" class="w-3.5 h-3.5"></i> Submit .ZIP
                </button>
              `}
            </div>
          `;
          assessmentsContainer.appendChild(div);
        });
      }
    }

    // 2. Render My Tasks (SECOND as requested by user)
    const tasksContainer = document.getElementById("intern-assigned-tasks-list");
    if (tasksContainer) {
      tasksContainer.innerHTML = "";
      const regularTasks = tasks.filter(t => t.type !== "Assessment");
      if (regularTasks.length === 0) {
        tasksContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 italic">No tasks currently assigned by Guide Palani Pandi C.</div>`;
      } else {
        regularTasks.forEach(task => {
          const isDone = (task.status === "Task Completed" || task.status === "Completed");
          const div = document.createElement("div");
          div.className = "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3";
          const hasRealDesc = task.description && 
            !task.description.startsWith("Deliverable #") && 
            !task.description.startsWith("Initial work deliverable");
          div.innerHTML = `
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                  Task
                </span>
                <span class="text-[10px] text-slate-400 font-mono">Deadline: ${task.dueDate}</span>
                ${isDone ? `
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                    Completed ✓
                  </span>
                ` : `
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                    ${task.status}
                  </span>
                `}
              </div>
              <h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">${task.title}</h4>
              ${hasRealDesc ? `<p class="text-xs text-slate-500 mt-1">${task.description}</p>` : ''}
            </div>
            <div class="shrink-0 flex items-center gap-2">
              ${isDone ? `
                <div class="flex items-center gap-2">
                  <span class="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5 border border-emerald-300 dark:border-emerald-700">
                    <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Completed ✓
                  </span>
                  <button onclick="ui.openUploadZipModal('${intern.id}', '${task.id}')" title="Re-submit updated file" class="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold flex items-center gap-1 border border-slate-200 dark:border-slate-700">
                    <i data-lucide="refresh-cw" class="w-3 h-3"></i> Re-submit
                  </button>
                </div>
              ` : `
                <button onclick="ui.openUploadZipModal('${intern.id}', '${task.id}')" class="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all">
                  <i data-lucide="upload" class="w-3.5 h-3.5"></i> Submit .ZIP
                </button>
              `}
            </div>
          `;
          tasksContainer.appendChild(div);
        });
      }
    }

    const subsContainer = document.getElementById("intern-my-submissions-list");
    subsContainer.innerHTML = "";
    if (mySubs.length === 0) {
      subsContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 italic">No deliverables submitted yet. Upload a .ZIP file when you complete a task.</div>`;
    } else {
      mySubs.forEach(sub => {
        const div = document.createElement("div");
        div.className = "p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between text-xs";
        div.innerHTML = `
          <div>
            <div class="font-bold text-slate-900 dark:text-white">${sub.workTitle}</div>
            <div class="text-[11px] text-amber-600 dark:text-amber-400 font-mono mt-0.5 flex items-center gap-1">
              <i data-lucide="file-archive" class="w-3.5 h-3.5"></i> ${sub.fileName} (${sub.fileSize}) &bull; ${sub.submittedAt}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${sub.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
              ${sub.status}
            </span>
            <button onclick="ui.downloadSubmissionZip('${sub.id}')" class="p-1.5 rounded-lg text-slate-600 hover:text-amber-600 hover:bg-amber-50" title="Download my ZIP">
              <i data-lucide="download" class="w-4 h-4"></i>
            </button>
          </div>
        `;
        subsContainer.appendChild(div);
      });
    }

    const filesContainer = document.getElementById("intern-assigned-files-list");
    if (filesContainer) {
      filesContainer.innerHTML = "";
      const myFiles = (store.files || []).filter(f => !f.intern_id || f.intern_id === 'all' || f.intern_id === intern.id);
      if (myFiles.length === 0) {
        filesContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 italic">No project files shared by Guide Palani Pandi C yet.</div>`;
      } else {
        myFiles.forEach(file => {
          const div = document.createElement("div");
          div.className = "p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs";
          const fileName = file.fileName || file.file_name || 'project_archive.zip';
          const fileSize = file.fileSize || file.file_size || '';
          const taskTitle = file.taskTitle || file.task_title || 'General Starter Kit';
          div.innerHTML = `
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <i data-lucide="file-archive" class="w-4 h-4 text-indigo-600 dark:text-indigo-400"></i>
                  ${fileName}
                </span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  ${fileSize}
                </span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">${file.description || 'Project resources and code archive.'}</p>
              <div class="text-[10px] text-slate-400 font-mono">
                Work: <span class="font-semibold text-slate-600 dark:text-slate-300">${taskTitle}</span> &bull; Uploaded: ${file.created_at ? new Date(file.created_at).toLocaleDateString() : 'Recent'}
              </div>
            </div>
            <button onclick="ui.downloadFileZip('${file.id}')" class="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Download ZIP
            </button>
          `;
          filesContainer.appendChild(div);
        });
      }
    }

    lucide.createIcons();
  }

  // ================= MODALS & FORMS =================
  closeAllModals() {
    document.querySelectorAll("[id^='modal-']").forEach(m => m.classList.add("hidden"));
    this.selectedZipFile = null;
    this.selectedBugDocFile = null;
  }

  openActiveTodayModal() {
    if (store.viewingGuideAsIntern) return;
    this.closeAllModals();
    const modal = document.getElementById("modal-active-today");
    if (!modal) return;
    const list = document.getElementById("active-today-list");
    const countBadge = document.getElementById("active-today-badge-count");

    const todayStr = new Date().toISOString().split("T")[0];
    const activeInterns = store.interns.filter(i => i.lastLoginDate === todayStr);

    if (countBadge) {
      countBadge.textContent = `${activeInterns.length} Working Today`;
    }
    list.innerHTML = "";

    if (activeInterns.length === 0) {
      list.innerHTML = `
        <div class="py-10 text-center space-y-3">
          <div class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center mx-auto">
            <i data-lucide="user-x" class="w-6 h-6"></i>
          </div>
          <h4 class="text-sm font-bold text-slate-800 dark:text-white">No interns logged in yet today</h4>
          <p class="text-xs text-slate-400 max-w-sm mx-auto">
            When interns log into the <b>Tarcin Interns</b> login page using the credentials you created, they will automatically appear here with their login time and ongoing tasks.
          </p>
        </div>
      `;
    } else {
      activeInterns.forEach(intern => {
        const tasks = store.getTasksForIntern(intern.id);
        const currentTask = tasks.find(t => t.status === "In Progress") || tasks[0];
        const initials = intern.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

        const row = document.createElement("div");
        row.className = "p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-3";
        row.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${intern.avatarBg || 'avatar-gradient-1'} text-white font-bold text-xs flex items-center justify-center shadow shrink-0">
              ${initials}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="text-xs font-bold text-slate-900 dark:text-white">${intern.name}</h4>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-mono">
                  ${intern.lastLoginTime || 'Active Today'}
                </span>
              </div>
              <p class="text-[11px] text-slate-400 truncate max-w-[240px]">
                ${intern.college || 'N/A'}${intern.department ? ' • ' + intern.department : ''}${intern.year ? ' (' + intern.year + ')' : ''}
              </p>
              <p class="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium mt-0.5">
                Working on: <b>${currentTask ? currentTask.title : 'No active task assigned'}</b>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="ui.closeAllModals(); ui.openTaskModal('${intern.id}')" class="px-2.5 py-1 text-xs rounded-lg bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 font-semibold border border-cyan-200 dark:border-cyan-800">
              Assign Work
            </button>
            <button onclick="ui.closeAllModals(); ui.openDetailModal('${intern.id}')" class="px-2.5 py-1 text-xs rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 font-semibold">
              Profile
            </button>
          </div>
        `;
        list.appendChild(row);
      });
    }

    modal.classList.remove("hidden");
    lucide.createIcons();
  }

  filterToActiveToday() {
    this.closeAllModals();
    this.switchTab("interns-grid");
    const filterSelect = document.getElementById("filter-status");
    if (filterSelect) {
      filterSelect.value = "ACTIVE_TODAY";
      store.statusFilter = "ACTIVE_TODAY";
      document.getElementById("btn-clear-filters")?.classList.remove("hidden");
      this.renderInternsList();
      this.showToast("Filtered to interns active/logged in today");
    }
  }

  openSupSettingsModal() {
    if (store.viewingGuideAsIntern) return;
    this.closeAllModals();
    document.getElementById("setting-sup-name").value = store.supervisor.name;
    document.getElementById("setting-sup-org").value = store.supervisor.org;
    document.getElementById("setting-sup-username").value = store.supervisor.username;
    document.getElementById("setting-sup-password").value = store.supervisor.password;
    document.getElementById("modal-sup-settings").classList.remove("hidden");
    lucide.createIcons();
  }

  async handleSupSettingsSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("setting-sup-name").value.trim();
    const org = document.getElementById("setting-sup-org").value.trim();
    const username = document.getElementById("setting-sup-username").value.trim();
    const password = document.getElementById("setting-sup-password").value.trim();

    try {
      await store.updateSupervisor({ name, org, username, password });
      document.getElementById("header-sup-name").textContent = name;
      this.closeAllModals();
      this.showToast("Guide credentials updated successfully!");
    } catch (err) {
      this.showToast(err.message || "Failed to update settings", "error");
    }
  }

  openInternModal(existingIntern = null) {
    if (store.viewingGuideAsIntern) return;
    this.closeAllModals();
    const modal = document.getElementById("modal-intern");
    const title = document.getElementById("modal-intern-title");
    const form = document.getElementById("form-intern");

    form.reset();

    if (existingIntern) {
      title.textContent = "Edit Intern Profile & Credentials";
      document.getElementById("intern-id").value = existingIntern.id;
      document.getElementById("intern-name").value = existingIntern.name;
      document.getElementById("intern-college").value = existingIntern.college || "";
      document.getElementById("intern-department").value = existingIntern.department || "";
      document.getElementById("intern-year").value = existingIntern.year || "3rd Year";
      document.getElementById("intern-domain").value = existingIntern.domain;
      document.getElementById("intern-status").value = existingIntern.status;
      document.getElementById("intern-cred-username").value = existingIntern.username || "";
      document.getElementById("intern-cred-password").value = existingIntern.plain_password || existingIntern.password || "";
      document.getElementById("initial-task-container").classList.add("hidden");
    } else {
      title.textContent = "Add New Intern to Tarcin Robotics";
      document.getElementById("intern-id").value = "";
      document.getElementById("intern-name").value = "";
      document.getElementById("intern-college").value = "";
      document.getElementById("intern-department").value = "";
      document.getElementById("intern-year").value = "3rd Year";
      document.getElementById("intern-cred-username").value = "";
      document.getElementById("intern-cred-password").value = "";
      this.resetTaskFields();
      document.getElementById("initial-task-container").classList.remove("hidden");
    }

    modal.classList.remove("hidden");
    document.getElementById("intern-name").focus();
    lucide.createIcons();
  }

  addAnotherTaskField(value = "") {
    const list = document.getElementById("task-inputs-list");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "task-input-row flex items-center gap-2";
    row.innerHTML = `
      <input type="text" name="intern-tasks[]" value="${value}" placeholder="e.g. Next task (e.g. KiCad PCB schematic / UART driver)" class="flex-1 text-xs px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
      <button type="button" onclick="this.parentElement.remove()" class="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" title="Remove Task">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;
    list.appendChild(row);
    lucide.createIcons();
    const input = row.querySelector("input");
    if (input) input.focus();
  }

  resetTaskFields() {
    const list = document.getElementById("task-inputs-list");
    if (!list) return;
    list.innerHTML = `
      <div class="task-input-row flex items-center gap-2">
        <input type="text" name="intern-tasks[]" placeholder="e.g. Set up ESP32 environment & push button debounce interrupt" class="flex-1 text-xs px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
      </div>
    `;
  }

  generateInternCredentials() {
    const name = document.getElementById("intern-name")?.value.trim().toLowerCase().split(" ")[0] || "intern";
    const randNum = Math.floor(100 + Math.random() * 900);
    document.getElementById("intern-cred-username").value = `${name}${randNum}`;
    document.getElementById("intern-cred-password").value = `tarcin@${randNum}`;
  }

  async handleInternFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("intern-id").value;
    const name = document.getElementById("intern-name").value.trim();
    const college = document.getElementById("intern-college").value.trim();
    const department = document.getElementById("intern-department")?.value.trim() || "";
    const year = document.getElementById("intern-year")?.value || "";
    const domain = document.getElementById("intern-domain").value.trim();
    const status = document.getElementById("intern-status").value;
    const username = document.getElementById("intern-cred-username").value.trim().toLowerCase();
    const password = document.getElementById("intern-cred-password").value.trim();
    const email = document.getElementById("intern-email") ? document.getElementById("intern-email").value.trim() : "";
    const phone = document.getElementById("intern-phone") ? document.getElementById("intern-phone").value.trim() : "";

    // Read all tasks entered in the dynamic inputs
    const taskInputs = document.querySelectorAll('input[name="intern-tasks[]"]');
    const tasks = Array.from(taskInputs)
      .map(i => i.value.trim())
      .filter(val => val.length > 0);

    if (!name || !username || !password) {
      this.showToast("Please provide name, username, and password", "warning");
      return;
    }

    try {
      if (id) {
        await store.updateIntern(id, { name, college, department, year, domain, status, username, password, email, phone });
        this.showToast(`Updated profile for ${name}`);
      } else {
        const result = await store.addIntern({ name, college, department, year, domain, status, username, password, email, phone, tasks });
        const taskCountMsg = tasks.length > 0 ? ` with ${tasks.length} task(s) assigned` : "";
        if (result && result.isCentral) {
          this.showToast(`Intern ${name} added & saved to Central Database! Login ID: ${username} 🎉`);
        } else {
          this.showToast(`Intern ${name} added${taskCountMsg}! Login ID: ${username} (Saved locally — auto-syncs when online)`);
        }
      }

      // Reset any active filter or search query so the newly added intern is immediately visible
      store.statusFilter = "ALL";
      store.searchQuery = "";
      const filterSelect = document.getElementById("filter-status");
      if (filterSelect) filterSelect.value = "ALL";
      const searchInput = document.getElementById("global-search");
      if (searchInput) searchInput.value = "";
      document.getElementById("btn-clear-filters")?.classList.add("hidden");

      this.closeAllModals();
      this.switchTab("interns-grid");
      this.renderSupervisorDashboard();
    } catch (err) {
      this.showToast(err.message || "Failed to save intern", "error");
    }
  }

  async confirmDeleteIntern(id) {
    if (store.viewingGuideAsIntern) return;
    const intern = store.getIntern(id);
    if (!intern) return;
    if (confirm(`Remove "${intern.name}" from your interns roster?`)) {
      try {
        await store.deleteIntern(id);
        this.renderSupervisorDashboard();
        this.showToast(`Intern ${intern.name} removed.`, "warning");
      } catch (err) {
        this.showToast(err.message || "Failed to remove intern", "error");
      }
    }
  }

  openTaskModal(defaultInternId = null) {
    if (store.viewingGuideAsIntern) return;
    this.closeAllModals();
    const modal = document.getElementById("modal-task");
    const internSelect = document.getElementById("task-intern-id");

    if (store.interns.length === 0) {
      this.showToast("Please add an intern first!", "warning");
      this.openInternModal();
      return;
    }

    document.getElementById("form-task").reset();
    document.getElementById("task-id").value = "";
    document.getElementById("task-due-date").value = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];

    internSelect.innerHTML = "";
    store.interns.forEach(intern => {
      const opt = document.createElement("option");
      opt.value = intern.id;
      opt.textContent = `${intern.name} (${intern.domain})`;
      if (defaultInternId === intern.id) opt.selected = true;
      internSelect.appendChild(opt);
    });

    modal.classList.remove("hidden");
    document.getElementById("task-title").focus();
    lucide.createIcons();
  }

  async handleTaskFormSubmit(e) {
    e.preventDefault();
    const internId = document.getElementById("task-intern-id").value;
    const type = document.querySelector('input[name="work-type"]:checked').value;
    const title = document.getElementById("task-title").value.trim();
    const description = document.getElementById("task-description").value.trim();
    const priority = document.getElementById("task-priority").value;
    const status = document.getElementById("task-status").value;
    const dueDate = document.getElementById("task-due-date").value;

    if (!title || !internId) {
      this.showToast("Title and intern are required", "warning");
      return;
    }

    try {
      await store.addTask({ internId, type, title, description, priority, status, dueDate });
      this.showToast(`${type} assigned successfully!`);
      this.closeAllModals();
      this.renderSupervisorDashboard();
    } catch (err) {
      this.showToast(err.message || "Failed to assign task", "error");
    }
  }

  // ================= BUG MODAL =================
  openBugModal(defaultInternId = null) {
    if (store.viewingGuideAsIntern) return;
    this.closeAllModals();
    const modal = document.getElementById("modal-bug");
    const internSelect = document.getElementById("bug-intern-id");

    if (store.interns.length === 0) {
      this.showToast("Add an intern before logging bugs!", "warning");
      this.openInternModal();
      return;
    }

    document.getElementById("form-bug").reset();
    this.selectedBugDocFile = null;
    const nameDisplay = document.getElementById("bug-doc-name-display");
    if (nameDisplay) {
      nameDisplay.textContent = "Click or Drag & Drop Bug Document here";
    }

    internSelect.innerHTML = "";
    store.interns.forEach(intern => {
      const opt = document.createElement("option");
      opt.value = intern.id;
      opt.textContent = `${intern.name} (${intern.domain})`;
      if (defaultInternId === intern.id) opt.selected = true;
      internSelect.appendChild(opt);
    });

    modal.classList.remove("hidden");
    document.getElementById("bug-title").focus();
    lucide.createIcons();
  }

  async handleBugFormSubmit(e) {
    e.preventDefault();
    const internId = document.getElementById("bug-intern-id").value;
    const title = document.getElementById("bug-title").value.trim();
    const category = document.getElementById("bug-category").value.trim();
    const severity = document.getElementById("bug-severity").value;
    const status = document.getElementById("bug-status").value;
    const description = document.getElementById("bug-description").value.trim();

    try {
      await store.addBug({
        internId,
        title,
        category,
        severity,
        status,
        description
      }, this.selectedBugDocFile);

      this.fireConfetti();
      this.showToast(this.selectedBugDocFile ? "Bug document uploaded & logged towards weekly 10-bug quota! 🐞📄" : "Bug logged towards weekly 10-bug quota! 🐞");
      this.closeAllModals();

      if (store.currentRole === "intern") {
        this.renderInternPortal();
      } else {
        this.renderSupervisorDashboard();
      }
    } catch (err) {
      this.showToast(err.message || "Failed to log bug", "error");
    }
  }

  // ================= UPLOAD ZIP SUBMISSION MODAL =================
  openUploadZipModal(defaultInternId = null, defaultTaskId = null) {
    if (store.viewingGuideAsIntern) return;
    this.closeAllModals();
    const modal = document.getElementById("modal-upload-zip");
    const internSelect = document.getElementById("zip-intern-id");
    const taskSelect = document.getElementById("zip-task-id");
    const internSelectWrapper = document.getElementById("zip-intern-select-wrapper");

    if (store.interns.length === 0) {
      this.showToast("Please add an intern first!", "warning");
      return;
    }

    if (store.currentRole === "intern") {
      defaultInternId = store.currentInternId;
      if (internSelectWrapper) internSelectWrapper.classList.add("hidden");
    } else {
      if (internSelectWrapper) internSelectWrapper.classList.remove("hidden");
    }

    document.getElementById("form-upload-zip").reset();
    this.selectedZipFile = null;
    document.getElementById("zip-file-name-display").textContent = "Click or Drag & Drop your .ZIP file here";

    internSelect.innerHTML = "";
    store.interns.forEach(intern => {
      const opt = document.createElement("option");
      opt.value = intern.id;
      opt.textContent = `${intern.name} (${intern.domain})`;
      if (defaultInternId === intern.id) opt.selected = true;
      internSelect.appendChild(opt);
    });

    const populateTasks = () => {
      const selectedId = internSelect.value;
      const tasks = store.getTasksForIntern(selectedId);
      taskSelect.innerHTML = "";
      if (tasks.length === 0) {
        taskSelect.innerHTML = `<option value="">General Project Submission (No specific task)</option>`;
      } else {
        tasks.forEach(t => {
          const opt = document.createElement("option");
          opt.value = t.id;
          opt.textContent = `[${t.type}] ${t.title}`;
          if (defaultTaskId === t.id) opt.selected = true;
          taskSelect.appendChild(opt);
        });
      }
    };

    const syncCategory = () => {
      const selectedId = internSelect.value;
      const tasks = store.getTasksForIntern(selectedId);
      const chosen = tasks.find(t => t.id === taskSelect.value);
      if (chosen && chosen.type === "Assessment") {
        const rad = document.querySelector('input[name="completion-category"][value="Assessment Completed"]');
        if (rad) rad.checked = true;
      } else if (chosen && chosen.type === "Task") {
        const rad = document.querySelector('input[name="completion-category"][value="Task Completed"]');
        if (rad) rad.checked = true;
      }
    };

    internSelect.onchange = () => {
      populateTasks();
      syncCategory();
    };
    taskSelect.onchange = syncCategory;
    populateTasks();
    syncCategory();

    modal.classList.remove("hidden");
    lucide.createIcons();
  }

  async handleZipUploadSubmit(e) {
    e.preventDefault();
    const internId = document.getElementById("zip-intern-id").value;
    const taskId = document.getElementById("zip-task-id").value;
    const type = document.querySelector('input[name="completion-category"]:checked')?.value || "Task Completed";
    const notes = document.getElementById("zip-notes").value.trim();

    if (!this.selectedZipFile) {
      this.showToast("Please select a .ZIP file to upload!", "warning");
      return;
    }

    if (!this.selectedZipFile.name.toLowerCase().endsWith(".zip")) {
      this.showToast("Only .ZIP files are accepted!", "error");
      return;
    }

    const task = store.tasks.find(t => t.id === taskId);
    const workTitle = task ? task.title : "Completed Deliverable Archive";
    const sizeMb = (this.selectedZipFile.size / (1024 * 1024)).toFixed(2) + " MB";
    const isAssessment = (type === "Assessment Completed" || (task && task.type === "Assessment"));

    await store.addZipSubmission({
      internId,
      taskId,
      workTitle,
      type: isAssessment ? "Assessment" : "Task",
      fileName: this.selectedZipFile.name,
      fileSize: sizeMb,
      notes
    }, this.selectedZipFile);

    this.fireConfetti();
    this.showToast("Work .ZIP submitted successfully! 🚀");
    this.closeAllModals();

    if (store.currentRole === "intern") {
      this.renderInternPortal();
    } else {
      this.renderSupervisorDashboard();
    }
  }

  async handleDirectAssessmentSubmit(e) {
    e.preventDefault();
    if (store.viewingGuideAsIntern) {
      this.showToast("View-only mode: Cannot submit while previewing as intern.", "warning");
      return;
    }

    const internId = store.currentInternId;
    if (!internId) {
      this.showToast("Please log in as an intern first!", "error");
      return;
    }

    const title = document.getElementById("intern-direct-assessment-title")?.value.trim();
    const notes = document.getElementById("intern-direct-assessment-notes")?.value.trim() || "";
    const taskId = document.getElementById("intern-direct-assessment-task-id")?.value || null;

    if (!title) {
      this.showToast("Please enter an Assessment Title / Topic!", "warning");
      return;
    }

    const file = this.selectedDirectAssessmentZipFile;
    if (!file) {
      this.showToast("Please select your assessment .ZIP file!", "warning");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      this.showToast("Only .ZIP files are accepted!", "error");
      return;
    }

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2) + " MB";

    await store.addZipSubmission({
      internId,
      taskId,
      workTitle: title,
      type: "Assessment",
      fileName: file.name,
      fileSize: sizeMb,
      notes
    }, file);

    this.fireConfetti();
    this.showToast("Assessment .ZIP submitted successfully to Guide Palani Pandi C! 🚀");

    // Reset direct assessment form
    const form = document.getElementById("form-intern-direct-assessment");
    if (form) form.reset();
    this.selectedDirectAssessmentZipFile = null;
    const nameDisplay = document.getElementById("intern-direct-assessment-filename");
    if (nameDisplay) nameDisplay.textContent = "Click to choose or Drag & Drop .ZIP file here";
    const taskIdInput = document.getElementById("intern-direct-assessment-task-id");
    if (taskIdInput) taskIdInput.value = "";

    // Refresh UI
    this.renderInternPortal();
    if (store.currentRole === "supervisor") {
      this.renderSupervisorDashboard();
    }
  }

  prefillDirectAssessment(taskId, taskTitle) {
    const titleInput = document.getElementById("intern-direct-assessment-title");
    const taskIdInput = document.getElementById("intern-direct-assessment-task-id");
    if (titleInput) {
      titleInput.value = taskTitle;
      titleInput.focus();
    }
    if (taskIdInput) taskIdInput.value = taskId;
    if (titleInput) {
      titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  openStandupModal(defaultInternId = null) {
    this.closeAllModals();
    const modal = document.getElementById("modal-standup");
    const internSelect = document.getElementById("standup-intern-id");

    if (store.interns.length === 0) {
      this.showToast("Please add an intern first!", "warning");
      return;
    }

    document.getElementById("form-standup").reset();
    document.getElementById("standup-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("standup-hours").value = "8";

    internSelect.innerHTML = "";
    store.interns.forEach(intern => {
      const opt = document.createElement("option");
      opt.value = intern.id;
      opt.textContent = `${intern.name} (${intern.domain})`;
      if (defaultInternId === intern.id) opt.selected = true;
      internSelect.appendChild(opt);
    });

    modal.classList.remove("hidden");
    document.getElementById("standup-completed").focus();
    lucide.createIcons();
  }

  async handleStandupFormSubmit(e) {
    e.preventDefault();
    const internId = document.getElementById("standup-intern-id").value;
    const date = document.getElementById("standup-date").value;
    const hours = document.getElementById("standup-hours").value;
    const completed = document.getElementById("standup-completed").value.trim();
    const nextPlan = document.getElementById("standup-next").value.trim();
    const blocker = document.getElementById("standup-blocker").value.trim();

    try {
      await store.addLog({ internId, date, hours, completed, nextPlan, blocker });
      this.showToast("Daily work log saved!");
      this.closeAllModals();

      if (store.currentRole === "intern") {
        this.renderInternPortal();
      } else {
        this.renderSupervisorDashboard();
      }
    } catch (err) {
      this.showToast(err.message || "Failed to save daily log", "error");
    }
  }

  openDetailModal(internId) {
    if (store.viewingGuideAsIntern) return; // Prevent interns from viewing other interns' profiles
    const intern = store.getIntern(internId);
    if (!intern) return;

    store.selectedInternForDetail = intern;
    this.closeAllModals();

    const modal = document.getElementById("modal-intern-detail");
    const initials = intern.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

    document.getElementById("detail-name").textContent = intern.name;
    document.getElementById("detail-avatar").textContent = initials;
    document.getElementById("detail-domain").textContent = intern.domain;
    document.getElementById("detail-college").innerHTML = `<i data-lucide="graduation-cap" class="w-3.5 h-3.5 text-cyan-400 inline mr-1"></i> ${intern.college || 'Engineering Institution'}`;
    
    const deptBadge = document.getElementById("detail-department-badge");
    if (deptBadge) {
      deptBadge.innerHTML = `<i data-lucide="book-open" class="w-3.5 h-3.5 text-cyan-600"></i> <span>Dept: <b>${intern.department || 'Embedded / General'}</b></span>`;
    }
    const yearBadge = document.getElementById("detail-year-badge");
    if (yearBadge) {
      yearBadge.innerHTML = `<i data-lucide="calendar" class="w-3.5 h-3.5 text-cyan-600"></i> <span>Year: <b>${intern.year || '3rd Year'}</b></span>`;
    }
    const lastLoginEl = document.getElementById("detail-last-login");
    const todayStr = new Date().toISOString().split("T")[0];
    const isLoggedToday = intern.lastLoginDate === todayStr;
    if (lastLoginEl) {
      if (isLoggedToday) {
        lastLoginEl.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-bold">Active Today (${intern.lastLoginTime || 'Active'})</span>`;
      } else {
        lastLoginEl.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 text-slate-400"></i> <span class="text-slate-500">Last seen: ${intern.lastLoginDate || 'Not logged in yet'}</span>`;
      }
    }

    if (document.getElementById("detail-email")) {
      document.getElementById("detail-email").innerHTML = `<i data-lucide="mail" class="w-3.5 h-3.5"></i> ${intern.email || 'N/A'}`;
    }
    if (document.getElementById("detail-phone")) {
      document.getElementById("detail-phone").innerHTML = `<i data-lucide="phone" class="w-3.5 h-3.5"></i> ${intern.phone || 'N/A'}`;
    }
    document.getElementById("detail-status-pill").textContent = intern.status;

    document.getElementById("detail-cred-username").textContent = intern.username || "N/A";
    document.getElementById("detail-cred-password").textContent = intern.plain_password || intern.password || "N/A";

    const tasks = store.getTasksForIntern(intern.id);
    const tasksDone = tasks.filter(t => t.type === "Task" && (t.status === "Task Completed" || t.status === "Completed")).length;
    const assessmentsDone = tasks.filter(t => t.type === "Assessment" && (t.status === "Assessment Completed" || t.status === "Completed")).length;
    const subs = store.getSubmissionsForIntern(intern.id);
    const bugs = store.getBugsForIntern(intern.id).filter(b => b.status === "Resolved");

    document.getElementById("detail-tasks-done").textContent = tasksDone;
    document.getElementById("detail-assessments-done").textContent = assessmentsDone;
    document.getElementById("detail-bugs-solved").textContent = bugs.length;
    document.getElementById("detail-zips-submitted").textContent = subs.length;

    const tasksContainer = document.getElementById("detail-tasks-list");
    tasksContainer.innerHTML = "";
    if (tasks.length === 0) {
      tasksContainer.innerHTML = `<p class="text-xs text-slate-400 italic">No tasks currently assigned.</p>`;
    } else {
      tasks.forEach(task => {
        const item = document.createElement("div");
        item.className = "flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs";
        item.innerHTML = `
          <div>
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${task.type === 'Assessment' ? 'bg-emerald-100 text-emerald-700' : 'bg-cyan-100 text-cyan-800'}">
                ${task.type}
              </span>
              <span class="font-bold text-slate-900 dark:text-white">${task.title}</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono">Due: ${task.dueDate} &bull; Priority: ${task.priority}</div>
          </div>
          <select class="text-[11px] px-2 py-1 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 font-semibold" onchange="ui.changeTaskStatusDirect('${task.id}', this.value)">
            <option value="To Do" ${task.status === "To Do" ? "selected" : ""}>To Do</option>
            <option value="In Progress" ${task.status === "In Progress" ? "selected" : ""}>In Progress</option>
            <option value="Under Review" ${task.status === "Under Review" ? "selected" : ""}>Under Review</option>
            <option value="Task Completed" ${task.status === "Task Completed" ? "selected" : ""}>Task Completed</option>
            <option value="Assessment Completed" ${task.status === "Assessment Completed" ? "selected" : ""}>Assessment Completed</option>
          </select>
        `;
        tasksContainer.appendChild(item);
      });
    }

    const subsContainer = document.getElementById("detail-submissions-list");
    subsContainer.innerHTML = "";
    if (subs.length === 0) {
      subsContainer.innerHTML = `<p class="text-xs text-slate-400 italic">No ZIP deliverables uploaded yet.</p>`;
    } else {
      subs.forEach(s => {
        const item = document.createElement("div");
        item.className = "p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between";
        item.innerHTML = `
          <div>
            <div class="font-bold">${s.workTitle}</div>
            <div class="text-[10px] font-mono text-amber-600 dark:text-amber-400">${s.fileName} (${s.fileSize})</div>
          </div>
          <button onclick="ui.downloadSubmissionZip('${s.id}')" class="px-2.5 py-1 rounded bg-amber-600 text-white font-bold text-[10px] flex items-center gap-1">
            <i data-lucide="download" class="w-3 h-3"></i> Download ZIP
          </button>
        `;
        subsContainer.appendChild(item);
      });
    }

    const logsContainer = document.getElementById("detail-logs-list");
    logsContainer.innerHTML = "";
    const logs = store.getLogsForIntern(intern.id);
    if (logs.length === 0) {
      logsContainer.innerHTML = `<p class="text-xs text-slate-400 italic">No standup logs submitted.</p>`;
    } else {
      logs.forEach(l => {
        const item = document.createElement("div");
        item.className = "p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs";
        item.innerHTML = `
          <div class="font-bold text-slate-700 dark:text-slate-300 font-mono">📅 ${l.date} (${l.hours}h)</div>
          <p class="text-slate-800 dark:text-slate-200 mt-1"><b>Done:</b> ${l.completed}</p>
          ${l.blocker ? `<p class="text-rose-600 font-semibold mt-1">⚠️ <b>Doubt:</b> ${l.blocker}</p>` : ''}
        `;
        logsContainer.appendChild(item);
      });
    }

    modal.classList.remove("hidden");
    lucide.createIcons();
  }

  async changeTaskStatusDirect(taskId, newStatus) {
    try {
      await store.updateTaskStatus(taskId, newStatus);
      if (newStatus === "Task Completed" || newStatus === "Assessment Completed") {
        this.fireConfetti();
      }
      this.renderSupervisorDashboard();
      if (store.selectedInternForDetail) {
        this.openDetailModal(store.selectedInternForDetail.id);
      }
    } catch (err) {
      this.showToast(err.message || "Failed to update task status", "error");
    }
  }

  copyInternCredentials() {
    if (!store.selectedInternForDetail) return;
    const intern = store.selectedInternForDetail;
    const text = `Tarcin Robotics LLP - Intern Login\nIntern Name: ${intern.name}\nUsername: ${intern.username}\nPassword: ${intern.password}\nGuide: Palani Pandi C`;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast("Credentials copied to clipboard! You can share with intern.");
    }).catch(() => {
      this.showToast("Could not copy automatically", "warning");
    });
  }

  fireConfetti() {
    if (typeof confetti === "function") {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    }
  }

  exportCSV() {
    let csv = "data:text/csv;charset=utf-8,";
    csv += "Name,Username,Password,Domain,College,Phone,Tasks Completed,Assessments Completed,Bugs Solved,ZIP Submissions\n";

    store.interns.forEach(intern => {
      const tasks = store.getTasksForIntern(intern.id);
      const tasksDone = tasks.filter(t => t.type === "Task" && (t.status === "Task Completed" || t.status === "Completed")).length;
      const assessmentsDone = tasks.filter(t => t.type === "Assessment" && (t.status === "Assessment Completed" || t.status === "Completed")).length;
      const subs = store.getSubmissionsForIntern(intern.id).length;
      const bugs = store.getBugsForIntern(intern.id).filter(b => b.status === "Resolved").length;

      csv += `"${intern.name}","${intern.username}","${intern.password}","${intern.domain}","${intern.college}","${intern.phone}",${tasksDone},${assessmentsDone},${bugs},${subs}\n`;
    });

    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `Palani_Interns_Report_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("Interns CSV exported!");
  }

  exportJSON() {
    const data = {
      guide: store.supervisor,
      interns: store.interns,
      tasks: store.tasks,
      submissions: store.submissions,
      bugs: store.bugs,
      logs: store.logs,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Palani_Interns_Backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast("JSON backup downloaded!");
  }

  importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        if (json.interns) store.interns = json.interns;
        if (json.tasks) store.tasks = json.tasks;
        if (json.submissions) store.submissions = json.submissions;
        if (json.bugs) store.bugs = json.bugs;
        if (json.logs) store.logs = json.logs;
        if (json.guide) store.supervisor = json.guide;
        store.save();
        this.renderSupervisorDashboard();
        this.showToast("Data imported successfully!");
      } catch (err) {
        this.showToast("Invalid JSON file", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }
}

let ui;
document.addEventListener("DOMContentLoaded", () => {
  ui = new UIController();
});
