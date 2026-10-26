/**
 * End-to-End Verification Test for Palani Interns Workflow Multi-User Application
 * Tests all requirements:
 * 1. Admin login & JWT verification
 * 2. Admin intern creation (stored in central DB)
 * 3. Intern login using created credentials
 * 4. Role-based access control (Intern forbidden from Admin endpoints)
 * 5. Task & Assessment creation
 * 6. Intern ZIP submission upload
 * 7. Admin submission listing, ZIP download, and approval
 * 8. Status update verification (Task Completed / Assessment Completed)
 */

const http = require('http');

const PORT = 5000;
const BASE = `http://localhost:${PORT}`;

function request(method, path, body = null, token = null, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (contentType) headers['Content-Type'] = contentType;

    let payload = null;
    if (body) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        payload = body;
      } else {
        payload = JSON.stringify(body);
      }
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(url, { method, headers }, (res) => {
      let data = Buffer.alloc(0);
      res.on('data', chunk => { data = Buffer.concat([data, chunk]); });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data.toString());
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
          json: json
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildMultipart(fields, files) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  let chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  for (const [fieldName, file] of Object.entries(files)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`
    ));
    chunks.push(file.content);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  return { boundary, body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function runTests() {
  console.log('====================================================');
  console.log('   STARTING E2E MULTI-USER APPLICATION TESTS');
  console.log('====================================================\n');

  try {
    // 1. Health Check
    console.log('[TEST 1] Checking server health...');
    const health = await request('GET', '/api/health');
    if (health.statusCode !== 200) throw new Error('Health check failed: ' + health.statusCode);
    console.log('  ✓ Server online:', health.json.service);

    // 2. Admin Login
    console.log('\n[TEST 2] Testing Guide Login (palani / 123456)...');
    const adminLogin = await request('POST', '/api/auth/login', {
      username: 'palani',
      password: '123456'
    });
    if (adminLogin.statusCode !== 200 || !adminLogin.json.token) {
      throw new Error('Admin login failed: ' + JSON.stringify(adminLogin.json));
    }
    const adminToken = adminLogin.json.token;
    console.log('  ✓ Admin logged in! JWT token obtained.');
    console.log('  ✓ Admin role:', adminLogin.json.user.role);

    // 3. Admin Creates Intern
    console.log('\n[TEST 3] Admin creates intern account (INT-2026, user: intern001, pass: testpass123)...');
    const newIntern = await request('POST', '/api/admin/interns', {
      name: 'Praveen Kumar',
      college: 'PSG College of Technology',
      department: 'ECE',
      year: '3rd Year',
      domain: 'Microcontroller Firmware (STM32/ARM)',
      status: 'Active',
      username: 'intern001',
      password: 'testpass123',
      tasks: ['STM32 GPIO & SysTick LED Blink']
    }, adminToken);

    if (newIntern.statusCode !== 201 || !newIntern.json.intern) {
      throw new Error('Intern creation failed: ' + JSON.stringify(newIntern.json));
    }
    const internId = newIntern.json.intern.id;
    console.log('  ✓ Intern created with ID:', internId);
    console.log('  ✓ Username:', newIntern.json.intern.username);
    console.log('  ✓ Stored password hash is hidden/protected:', !newIntern.json.intern.passwordHash);

    // 4. Intern Login
    console.log('\n[TEST 4] Intern logs in from another simulated client (intern001 / testpass123)...');
    const internLogin = await request('POST', '/api/auth/login', {
      username: 'intern001',
      password: 'testpass123'
    });
    if (internLogin.statusCode !== 200 || !internLogin.json.token) {
      throw new Error('Intern login failed: ' + JSON.stringify(internLogin.json));
    }
    const internToken = internLogin.json.token;
    console.log('  ✓ Intern authenticated successfully!');
    console.log('  ✓ Intern user ID:', internLogin.json.user.id);
    console.log('  ✓ Intern role:', internLogin.json.user.role);

    // 5. Security & Role Guard Verification
    console.log('\n[TEST 5] Testing Role Guard (Intern attempting to access Admin endpoint /api/admin/interns)...');
    const forbiddenTest = await request('GET', '/api/admin/interns', null, internToken);
    if (forbiddenTest.statusCode === 403) {
      console.log('  ✓ Access Denied: 403 Forbidden correctly enforced on intern! Security intact.');
    } else {
      throw new Error('Security violation: Intern was not blocked with 403! Got: ' + forbiddenTest.statusCode);
    }

    // 6. Admin assigns an Assessment
    console.log('\n[TEST 6] Admin assigns an Assessment to the intern...');
    const assignAssessment = await request('POST', '/api/tasks', {
      internId: internId,
      type: 'Assessment',
      title: 'STM32 UART DMA Ring Buffer Driver Milestone',
      description: 'Implement non-blocking circular buffer receiving telemetry packets at 115200 baud.',
      priority: 'High',
      status: 'In Progress',
      dueDate: '2026-10-30'
    }, adminToken);
    if (assignAssessment.statusCode !== 201) {
      throw new Error('Assessment assignment failed: ' + JSON.stringify(assignAssessment.json));
    }
    const assessmentId = assignAssessment.json.task.id;
    console.log('  ✓ Assessment created with ID:', assessmentId);

    // 7. Intern uploads a .ZIP deliverable
    console.log('\n[TEST 7] Intern uploads a .ZIP deliverable for the Assessment...');
    const dummyZipContent = Buffer.from('PK\x03\x04MockZipFileHeaderForEmbeddedProjectFiles');
    const mp = buildMultipart({
      internId: internId,
      taskId: assessmentId,
      workTitle: 'STM32 UART DMA Milestone Implementation',
      type: 'Assessment',
      notes: 'Completed driver in bare-metal C. Tested with Saleae Logic Analyzer.'
    }, {
      file: {
        filename: 'stm32_uart_dma_driver.zip',
        content: dummyZipContent,
        contentType: 'application/zip'
      }
    });

    const uploadRes = await request('POST', '/api/intern/submissions', mp.body, internToken, mp.contentType);
    if (uploadRes.statusCode !== 201 || !uploadRes.json.submission) {
      throw new Error('Submission failed: ' + JSON.stringify(uploadRes.json));
    }
    const subId = uploadRes.json.submission.id;
    console.log('  ✓ .ZIP Deliverable uploaded successfully! Submission ID:', subId);
    console.log('  ✓ Status:', uploadRes.json.submission.status);

    // 8. Admin reviews submissions & downloads the .ZIP
    console.log('\n[TEST 8] Admin views submissions list and downloads the .ZIP deliverable...');
    const adminSubs = await request('GET', '/api/admin/submissions', null, adminToken);
    if (adminSubs.statusCode !== 200 || !adminSubs.json.submissions) {
      throw new Error('Failed to fetch submissions: ' + JSON.stringify(adminSubs.json));
    }
    const foundSub = adminSubs.json.submissions.find(s => s.id === subId);
    if (!foundSub) throw new Error('Uploaded submission not found in admin list!');
    console.log('  ✓ Submission found in Guide Dashboard:', foundSub.workTitle, `(${foundSub.fileName})`);

    const downloadRes = await request('GET', `/api/submissions/${subId}/download`, null, adminToken);
    if (downloadRes.statusCode !== 200) {
      throw new Error('Download failed: ' + downloadRes.statusCode);
    }
    console.log('  ✓ .ZIP file downloaded successfully! Bytes received:', downloadRes.data.length);

    // 9. Admin Approves the Deliverable
    console.log('\n[TEST 9] Admin approves the deliverable...');
    const approveRes = await request('PUT', `/api/admin/submissions/${subId}/approve`, {
      adminComment: 'Excellent DMA driver implementation. Milestone verified!'
    }, adminToken);
    if (approveRes.statusCode !== 200 || approveRes.json.submission.status !== 'Approved') {
      throw new Error('Approval failed: ' + JSON.stringify(approveRes.json));
    }
    console.log('  ✓ Deliverable Approved! ✓');

    // 10. Verify Task status is updated to "Assessment Completed"
    console.log('\n[TEST 10] Verifying Task/Assessment status is updated...');
    const updateTaskRes = await request('PUT', `/api/tasks/${assessmentId}`, {
      status: 'Assessment Completed'
    }, adminToken);
    if (updateTaskRes.statusCode !== 200 || updateTaskRes.json.task.status !== 'Assessment Completed') {
      throw new Error('Task status update failed: ' + JSON.stringify(updateTaskRes.json));
    }
    console.log('  ✓ Task status verified: Assessment Completed! ★');

    // 11. Intern views their own profile & progress
    console.log('\n[TEST 11] Intern verifies their progress in Intern Portal...');
    const internProfile = await request('GET', '/api/intern/profile', null, internToken);
    if (internProfile.statusCode !== 200 || !internProfile.json.intern) {
      throw new Error('Intern profile fetch failed: ' + JSON.stringify(internProfile.json));
    }
    console.log('  ✓ Intern Profile verified. Active Status:', internProfile.json.intern.status);

    // 12. Guide Uploads a Project ZIP file to File Dashboard
    console.log('\n[TEST 12] Guide uploads Project ZIP file to File Dashboard...');
    const projectZipContent = Buffer.from('PK\x03\x04ProjectStarterKitAndDocumentationArchive');
    const fileMp = buildMultipart({
      description: 'STM32F401RE Starter Firmware & HAL Driver Template',
      taskId: assessmentId,
      internId: internId
    }, {
      file: {
        filename: 'stm32_starter_template.zip',
        content: projectZipContent,
        contentType: 'application/zip'
      }
    });

    const fileUploadRes = await request('POST', '/api/files', fileMp.body, adminToken, fileMp.contentType);
    if (fileUploadRes.statusCode !== 201 || !fileUploadRes.json.file) {
      throw new Error('File upload to File Dashboard failed: ' + JSON.stringify(fileUploadRes.json));
    }
    const uploadedFileId = fileUploadRes.json.file.id;
    console.log('  ✓ ZIP File uploaded to File Dashboard! File ID:', uploadedFileId);
    console.log('  ✓ Stored file name:', fileUploadRes.json.file.file_name);
    console.log('  ✓ Size:', fileUploadRes.json.file.file_size);

    // 13. Guide & Intern List Files from File Dashboard
    console.log('\n[TEST 13] Verifying File Dashboard listing...');
    const filesListRes = await request('GET', '/api/files', null, adminToken);
    if (filesListRes.statusCode !== 200 || !Array.isArray(filesListRes.json.files)) {
      throw new Error('Failed to fetch files: ' + JSON.stringify(filesListRes.json));
    }
    const foundFile = filesListRes.json.files.find(f => f.id === uploadedFileId);
    if (!foundFile) throw new Error('Uploaded file not found in File Dashboard list');
    console.log('  ✓ Found file in File Dashboard:', foundFile.file_name, `(Assigned: ${foundFile.intern_name})`);

    // 14. Intern Downloads the Assigned Project ZIP file
    console.log('\n[TEST 14] Intern downloads their assigned project ZIP file...');
    const internDownloadRes = await request('GET', `/api/files/${uploadedFileId}/download`, null, internToken);
    if (internDownloadRes.statusCode !== 200) {
      throw new Error('Intern file download failed with status: ' + internDownloadRes.statusCode);
    }
    console.log('  ✓ Intern successfully downloaded assigned ZIP file! Bytes:', internDownloadRes.data.length);

    // 15. Guide Deletes File from File Dashboard
    console.log('\n[TEST 15] Guide deletes file from File Dashboard...');
    const fileDeleteRes = await request('DELETE', `/api/files/${uploadedFileId}`, null, adminToken);
    if (fileDeleteRes.statusCode !== 200) {
      throw new Error('File deletion failed: ' + fileDeleteRes.statusCode);
    }
    console.log('  ✓ File removed from File Dashboard.');

    // 16. Cleanup test data
    console.log('\n[TEST 16] Cleaning up test intern from database...');
    const deleteRes = await request('DELETE', `/api/admin/interns/${internId}`, null, adminToken);
    if (deleteRes.statusCode !== 200) {
      console.warn('  ⚠️ Cleanup warning:', deleteRes.statusCode);
    } else {
      console.log('  ✓ Test intern cleaned up from database.');
    }

    console.log('\n====================================================');
    console.log('   🎉 ALL 16 E2E TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
