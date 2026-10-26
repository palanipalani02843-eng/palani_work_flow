# Tarcin Robotics LLP — Palani Interns Workflow ⚡
### Central Multi-User Embedded Systems & IoT Engineering Hub
**Guide:** Palani Pandi C (Embedded & IoT Engineer at Tarcin Robotics LLP)

---

## 🚀 Overview

The **Palani Interns Workflow** application has been upgraded from a client-only frontend into a production-grade **Central Multi-User Application** with a Node.js REST API backend and centralized database.

### 🔑 The Core Problem Solved:
Previously, accounts, tasks, and `.zip` uploads were stored locally inside the browser's `localStorage` and `IndexedDB`. When Guide Palani created credentials on his supervisor computer, interns attempting to log in from other computers could not authenticate because the data only existed on Palani's machine.

Now, all accounts, passwords (securely hashed with `bcrypt`), tasks, assessments, submissions, and `.zip` files reside in a **Central Backend and Database**.

```text
Guide / Admin Computer                Intern Computer A             Intern Computer B
(e.g., http://localhost:5000)      (http://192.168.1.100:5000)   (http://192.168.1.100:5000)
             │                                   │                             │
             └───────────────┬───────────────────┴─────────────────────────────┘
                             ▼
                 Central Node.js Backend (:5000)
                             │
     ┌───────────────────────┴────────────────────────┐
     ▼                                                ▼
Central Database (Supabase PostgreSQL / JSON)   Central Uploads Storage (server/uploads/)
- Users & Role-Based Auth                        - project.zip submissions
- Tasks & Assessments                            - Bug documents (.pdf/.docx/.zip)
- Daily Standup Logs
```

---

## 🛠️ Project Structure

```text
palani-interns-workflow/
├── index.html            # Frontend UI (Preserved styling, Dark/Light theme, Lucide icons)
├── style.css             # Custom animations, transitions & component styling
├── app.js                # Frontend client connecting to Central Backend via JWT REST API
├── run_site.bat          # 1-Click launcher (checks Node.js, starts backend, opens browser)
├── README.md             # Complete technical & setup documentation
│
└── server/
    ├── server.js         # Express REST API server + Static file serving + Native fallback
    ├── package.json      # Dependencies (express, bcryptjs, jsonwebtoken, multer, @supabase/supabase-js, pg)
    ├── .env              # Server configuration & database credentials (gitignored)
    ├── .env.example      # Template for environment variables
    ├── .gitignore        # Ignores node_modules, .env, uploads, and runtime data
    ├── database/
    │   ├── db.js         # Database adapter (Supabase PostgreSQL with persistent store fallback)
    │   └── schema.sql    # Complete SQL DDL script for Supabase / PostgreSQL
    ├── middleware/
    │   ├── auth.js       # JWT authentication & role-based guards (requireAdmin, requireIntern)
    │   └── upload.js     # Multer file upload handler with native streaming fallback
    ├── controllers/
    │   ├── authController.js        # Login, current user /me, and password hashing
    │   ├── adminController.js       # Intern roster, KPIs, Guide settings
    │   ├── internController.js      # Intern profile and personal workspace
    │   ├── taskController.js        # Tasks & Assessments lifecycle
    │   ├── submissionController.js  # .ZIP uploads, downloads, and approve/reject
    │   └── bugController.js         # Weekly 10-bug quota tracking & documents
    ├── routes/
    │   ├── auth.js
    │   ├── admin.js
    │   ├── intern.js
    │   ├── tasks.js
    │   ├── submissions.js
    │   └── bugs.js
    └── utils/
        └── security.js   # Bcrypt password hashing & RFC-7519 JWT generator with native fallbacks
```

---

## ⚡ Quick Start (1-Click Run)

### Requirements:
- [Node.js](https://nodejs.org/) (Version 16 or higher) installed on the Guide's computer.

### Running the Application:
Simply double-click **`run_site.bat`** in the project folder!

The batch script will:
1. Verify Node.js is installed.
2. Initialize dependencies.
3. Start the Central Multi-User Server on **port 5000**.
4. Automatically open `http://localhost:5000` in your default web browser.
5. Print the **LAN IP address** (e.g., `http://192.168.1.15:5000`) so other computers/interns on the same Wi-Fi can open the portal immediately without needing any software installed!

---

## 🌐 Multi-Computer & Network Usage

### Step 1: Guide Starts Server
Guide Palani starts `run_site.bat` on his machine. Note the LAN address displayed in the console window, for example:
```text
  - This Computer (Admin/Guide):  http://localhost:5000
  - Interns on Same Wi-Fi/LAN:   http://192.168.1.25:5000
```

### Step 2: Guide Creates Intern Account
1. Open `http://localhost:5000` (or your cloud URL) on the Guide's machine.
2. Log in with Guide credentials:
   - **Username:** `palani`
   - **Password:** `123456`
3. Click **"+ Add Intern"**.
4. Fill in:
   - **Name:** e.g., `Karthik S`
   - **College / Year:** e.g., `PSG Tech`, `3rd Year`
   - **Domain:** e.g., `Microcontroller Firmware (STM32/ARM)`
   - **Username:** `karthik`
   - **Password:** `intern@123`
   - **Initial Tasks:** Assign initial lab experiments.
5. Click **"Save & Add Intern"**. The account and hashed credentials are saved in the central database.

### Step 3: Intern Logs In from Another Computer
1. From any other computer, laptop, or phone connected to the same Wi-Fi/network, open the browser to the Guide's LAN IP:
   `http://192.168.1.25:5000`
2. Click the **"Tarcin Interns"** tab.
3. Enter the credentials created by Palani:
   - **Username / ID:** `karthik`
   - **Password:** `intern@123`
4. Click **"Sign In as Intern"**.
5. The intern is logged into their **Personal Lab Portal** with their own assigned tasks, circuits, and deliverable submission zones.

---

## 🗄️ Supabase / PostgreSQL Configuration

The application includes an adapter that supports **Supabase PostgreSQL** in the cloud or direct local/cloud PostgreSQL.

### To Connect to your Supabase Project:
1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase project dashboard.
3. Copy and run the entire SQL script from [`server/database/schema.sql`](file:///server/database/schema.sql).
4. Go to **Project Settings** → **API**.
5. Copy your **Project URL** and **`anon` public key** (or **`service_role` key**).
6. Open `server/.env` and fill in the values:
   ```env
   PORT=5000
   JWT_SECRET=tarcin_robotics_super_secret_jwt_key_2026
   
   # Supabase Configuration:
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-supabase-anon-or-service-key
   ```
7. Restart `run_site.bat`. The backend will automatically detect Supabase and synchronize with your central cloud database!

> **Note on Zero-Configuration Local Mode:**  
> If `SUPABASE_URL` is omitted or empty, the server automatically uses the built-in persistent database adapter (`server/data/db.json`). This ensures full multi-user, multi-computer functionality out-of-the-box even before cloud credentials are configured.

---

## 🔒 Security & Role-Based Access Control

1. **Password Hashing:** Passwords are never stored in plain text. Passwords are salted and hashed using `bcrypt` (with native `crypto.scrypt` fallback).
2. **JWT Authentication:** Authentication tokens are issued on login and validated on every API request.
3. **Role Guards:**
   - **`ADMIN` (Palani):** Can create, edit, delete interns, view all tasks, evaluate and download all `.zip` submissions, and approve or reject deliverables.
   - **`INTERN`:** Strictly restricted by both UI and backend controllers. Interns can only read their own profile, submit their own deliverables, and view their own tasks. Interns cannot access other interns' records or download other interns' files.
4. **File Deliverable Protection:** Submissions (`.zip`) are validated on the backend. Only the authoring intern and the Admin can access or download each file.

---

## 🎯 Task Completed vs Assessment Completed

The application strictly maintains the distinction between:
- **`TASK COMPLETED`**: Regular daily lab experiments (e.g., LED debounce interrupt, ADC reading, UART ring buffer).
- **`ASSESSMENT COMPLETED`**: Formal milestone project evaluations (e.g., Bare-Metal STM32 driver with DMA, IoT Gateway Capstone).

When Guide Palani reviews and clicks **"Approve"** on an uploaded `.zip` deliverable, the corresponding task or assessment is automatically updated to its verified completed status.

---

## 📡 REST API Reference

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Login with username & password; returns JWT token & user |
| `GET` | `/api/auth/me` | Authenticated | Retrieve authenticated user session info |
| `GET` | `/api/admin/interns` | Admin | Get list of all registered interns |
| `POST` | `/api/admin/interns` | Admin | Create a new intern account with credentials and initial tasks |
| `PUT` | `/api/admin/interns/:id` | Admin | Update intern profile, domain, or credentials |
| `DELETE` | `/api/admin/interns/:id` | Admin | Remove an intern and their associated data |
| `GET` | `/api/admin/submissions` | Admin | Get all submitted `.zip` project deliverables |
| `GET` | `/api/admin/submissions/:id/download` | Admin | Download intern's `.zip` deliverable archive |
| `PUT` | `/api/admin/submissions/:id/approve` | Admin | Approve submission and mark task/assessment complete |
| `PUT` | `/api/admin/submissions/:id/reject` | Admin | Request revisions with feedback notes |
| `GET` | `/api/admin/settings` | Admin | View Guide settings |
| `PUT` | `/api/admin/settings` | Admin | Update Guide name, username, or password |
| `GET` | `/api/intern/profile` | Intern | Get logged-in intern's profile & progress |
| `GET` | `/api/intern/tasks` | Intern | Get logged-in intern's assigned tasks |
| `GET` | `/api/intern/submissions` | Intern | Get logged-in intern's uploaded deliverables |
| `POST` | `/api/intern/submissions` | Intern | Upload a `.zip` deliverable archive |
| `POST` | `/api/intern/logs` | Intern | Submit daily standup log |
| `GET` | `/api/bugs` | Authenticated | View logged bugs towards weekly 10-bug quota |
| `POST` | `/api/bugs` | Authenticated | Log a bug with optional documentation file upload |
| `PUT` | `/api/bugs/:id` | Authenticated | Toggle bug resolved status |
| `GET` | `/api/bugs/:id/download` | Authenticated | Download bug report document |
| `GET` | `/api/files` | Authenticated | List stored ZIP files (All for Guide, assigned for Intern) |
| `POST` | `/api/files` | Admin | Upload ZIP file to File Dashboard with intern/task metadata |
| `GET` | `/api/files/:id/download` | Authenticated | Securely download assigned or authorized project ZIP file |
| `DELETE` | `/api/files/:id` | Admin | Remove file from File Dashboard and storage |

---

## 📁 File Dashboard (Project ZIP Storage & Distribution)

A central file-management hub designed for Guide Palani Pandi C to upload and distribute project files:
1. **Guide Uploads:** Click **"+ Add ZIP File"** in the File Dashboard tab. Select a `.zip` archive, enter a description, link to a task, and assign to a specific intern or share with all interns.
2. **Metadata Stored:** File name, file size, upload timestamp, related task, assigned intern, and uploader identity are stored in the database.
3. **Intern Access:** When an intern logs into their portal, assigned project files and starter kits appear under **"Project Files & Starter Kits (.ZIP) from Guide"** with 1-click secure download.
4. **Access Control:** Interns can only download files explicitly shared with them or with all interns. Direct attempts to download another intern's files are blocked with HTTP `403 Forbidden`.
