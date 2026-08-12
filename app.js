// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
  apiKey: "AIzaSyBZj3FtS4d_I33NCQhUFssPTVAyrFQSCpY",
  authDomain: "jsvcable-billing.firebaseapp.com",
  projectId: "jsvcable-billing",
  storageBucket: "jsvcable-billing.firebasestorage.app",
  messagingSenderId: "422797654503",
  appId: "1:422797654503:web:9d23389de6d4c335ef2542",
  measurementId: "G-N4R3HB8X98"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==================== STATE ====================
let currentUser = null;
let allCustomers = [];
let selectedBillCustomer = null;
let currentLedgerCustomerId = null;

// Only these can use Admin app (others = collector app only)
const ADMIN_EMAILS = [
  'muthurajjeyabal@gmail.com',
  'muthurajjey@jsvcable.com',
  'admin@jsvcable.com',
  'stefi@jsvcable.com',
  'jeyabal@jsvcable.com',
];
// Collectors blocked from admin
const COLLECTOR_EMAILS = [
  'uma@jsvcable.com',
  'muthumari@jsvcable.com',
  'office@jsvcable.com',
  'online@jsvcable.com',
];

function isAdminUser(user) {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase();
  if (COLLECTOR_EMAILS.some(c => email === c || email.startsWith(c.split('@')[0] + '@'))) {
    return false;
  }
  if (ADMIN_EMAILS.some(a => email === a.toLowerCase())) return true;
  // If not in collector list, treat as admin (your main account)
  if (email.includes('muthuraj')) return true;
  return false;
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  const today = new Date().toISOString().split('T')[0];
  const conDateEl = document.getElementById('custConDate');
  const billDateEl = document.getElementById('billDate');
  if (conDateEl) conDateEl.value = today;
  if (billDateEl) billDateEl.value = today;

  auth.onAuthStateChanged(async user => {
    if (user) {
      if (!isAdminUser(user)) {
        await auth.signOut();
        currentUser = null;
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('appScreen').classList.add('hidden');
        const errBox = document.getElementById('loginError');
        if (errBox) {
          errBox.innerHTML = 'Collector login. Admin app அல்ல.<br><a class="underline text-blue-600" href="collector.html">Collector App திறக்க →</a>';
          errBox.classList.remove('hidden');
        }
        showToast('Collectors must use Collector App', true);
        return;
      }
      currentUser = user;
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('appScreen').classList.remove('hidden');
      document.getElementById('userEmailDisplay').textContent = user.email;
      loadDashboard();
      loadCustomers();
    } else {
      currentUser = null;
      document.getElementById('loginScreen').classList.remove('hidden');
      document.getElementById('appScreen').classList.add('hidden');
    }
  });

  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('customerForm').addEventListener('submit', handleSaveCustomer);
  document.getElementById('billForm').addEventListener('submit', handleSaveBill);
  const createUserForm = document.getElementById('createUserForm');
  if (createUserForm) createUserForm.addEventListener('submit', handleCreateUser);
});

// ==================== AUTH ====================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errBox = document.getElementById('loginError');

  btn.disabled = true;
  btn.textContent = 'Logging in...';
  errBox.classList.add('hidden');

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    errBox.textContent = err.message.includes('user-not-found') || err.message.includes('wrong-password') || err.message.includes('invalid-credential')
      ? 'Invalid email or password'
      : err.message;
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
}

function logout() {
  if (confirm('Logout செய்ய வேண்டுமா?')) {
    auth.signOut();
  }
}

async function handleCreateUser(e) {
  e.preventDefault();
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value;
  try {
    const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary' + Date.now());
    await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
    await secondaryApp.auth().signOut();
    secondaryApp.delete();
    showToast('User created successfully!');
    document.getElementById('createUserForm').reset();
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

// ==================== NAVIGATION ====================
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.remove('hidden');

  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });

  const titles = {
    dashboard: 'Dashboard',
    customers: 'Customers',
    newCustomer: 'New Customer',
    billing: 'Billing / Collection',
    ledger: 'Customer Ledger',
    pending: 'Pending / Due Report',
    boxes: 'Box Management',
    reports: 'Reports',
    masters: 'Masters',
    settings: 'Settings'
  };
  document.getElementById('pageTitle').textContent = titles[pageId] || pageId;

  if (pageId === 'newCustomer') {
    document.getElementById('customerForm').reset();
    document.getElementById('editCustomerId').value = '';
    document.getElementById('customerFormTitle').textContent = 'New Customer';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('custConDate').value = today;
  }

  if (pageId === 'pending') {
    renderPendingReport();
  }

  if (window.innerWidth < 1024) {
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('sidebarOverlay').classList.add('hidden');
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('-translate-x-full');
  overlay.classList.toggle('hidden');
}

// ==================== CUSTOMERS ====================
async function loadCustomers() {
  try {
    const snap = await db.collection('customers').get();
    allCustomers = [];
    snap.forEach(doc => {
      allCustomers.push({ id: doc.id, ...doc.data() });
    });
    allCustomers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ta'));
    renderCustomerTable(allCustomers);
    updateDashboardStats();
  } catch (err) {
    console.error(err);
    document.getElementById('customerTableBody').innerHTML =
      `<tr><td colspan="7" class="text-center py-8 text-red-500">Error: ${err.message}</td></tr>`;
  }
}

function renderCustomerTable(list) {
  const tbody = document.getElementById('customerTableBody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">No customers found</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const due = Number(c.dueAmt || c.due || 0);
    const status = c.status || 'ACT';
    return `
    <tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-3 py-2.5 font-mono text-xs">${c.custId || c.id.slice(0,6)}</td>
      <td class="px-3 py-2.5 font-medium text-sm">${c.name || '-'}</td>
      <td class="px-3 py-2.5 text-sm">${c.mobile || '-'}</td>
      <td class="px-3 py-2.5 font-mono text-xs">${c.boxNo || '-'}</td>
      <td class="px-3 py-2.5 text-sm font-semibold ${due > 0 ? 'text-red-600' : 'text-slate-500'}">₹${due}</td>
      <td class="px-3 py-2.5">
        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${status === 'ACT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
          ${status}
        </span>
      </td>
      <td class="px-3 py-2.5 whitespace-nowrap">
        <button onclick="editCustomer('${c.id}')" class="text-blue-600 hover:underline text-xs mr-1">Edit</button>
        <button onclick="toggleDC('${c.id}', '${status}')" class="text-xs mr-1 ${status === 'ACT' ? 'text-red-600' : 'text-green-600'} hover:underline">
          ${status === 'ACT' ? 'DC' : 'RC'}
        </button>
        <button onclick="viewLedger('${c.id}')" class="text-purple-600 hover:underline text-xs mr-1">Ledger</button>
        <button onclick="openWhatsApp('${c.mobile || ''}', '${(c.name || '').replace(/'/g, '')}', ${Number(c.dueAmt||c.due||0)})" class="text-green-600 hover:underline text-xs">WA</button>
      </td>
    </tr>`;
  }).join('');
}

function searchCustomers() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const status = document.getElementById('statusFilter').value;

  let filtered = allCustomers;
  if (status) filtered = filtered.filter(c => (c.status || 'ACT') === status);
  if (q) {
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.mobile || '').includes(q) ||
      (c.boxNo || '').toLowerCase().includes(q) ||
      (c.custId || '').toLowerCase().includes(q) ||
      (c.scNo || '').toLowerCase().includes(q) ||
      (c.smartCard || '').toLowerCase().includes(q)
    );
  }
  renderCustomerTable(filtered);
}

async function handleSaveCustomer(e) {
  e.preventDefault();
  const editId = document.getElementById('editCustomerId').value;

  const data = {
    name: document.getElementById('custName').value.trim(),
    fatherName: document.getElementById('custFather').value.trim(),
    mobile: document.getElementById('custMobile').value.trim(),
    doorNo: document.getElementById('custDoor').value.trim(),
    place: document.getElementById('custPlace').value.trim(),
    street: document.getElementById('custStreet').value.trim(),
    landmark: document.getElementById('custLandmark')?.value.trim() || '',
    ebNo: document.getElementById('custEB')?.value.trim() || '',
    boxNo: document.getElementById('custBox').value.trim(),
    scNo: document.getElementById('custSC').value.trim(),
    smartCard: document.getElementById('custSC').value.trim(),
    package: document.getElementById('custPackage').value,
    packageAmt: Number(document.getElementById('custPkgAmt').value) || 0,
    dueAmt: Number(document.getElementById('custDueAmt')?.value) || 0,
    otherCharges: Number(document.getElementById('custOtherCharges')?.value) || 0,
    discount: Number(document.getElementById('custDiscount')?.value) || 0,
    disReason: document.getElementById('custDisReason')?.value.trim() || '',
    conDate: document.getElementById('custConDate').value,
    status: document.getElementById('custStatus').value,
    sms: document.getElementById('custSMS')?.value || 'Yes',
    signal: document.getElementById('custSignal')?.value || 'Digital',
    mso: document.getElementById('custMSO')?.value.trim() || '',
    boxType: document.getElementById('custBoxType')?.value || 'SD',
    aadhar: document.getElementById('custAadhar')?.value.trim() || '',
    caf: document.getElementById('custCAF')?.value.trim() || '',
    regDate: document.getElementById('custRegDate')?.value || '',
    boxAmt: Number(document.getElementById('custBoxAmt')?.value) || 0,
    billing: document.getElementById('custBilling')?.value || 'Yes',
    remarks: document.getElementById('custRemarks').value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (editId) {
      await db.collection('customers').doc(editId).update(data);
      showToast('Customer updated!');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.custId = 'C' + Date.now().toString().slice(-6);
      await db.collection('customers').add(data);
      showToast('Customer added!');
    }
    await loadCustomers();
    showPage('customers');
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

function editCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;

  document.getElementById('editCustomerId').value = id;
  document.getElementById('customerFormTitle').textContent = 'Edit Customer';
  document.getElementById('custName').value = c.name || '';
  document.getElementById('custFather').value = c.fatherName || '';
  document.getElementById('custMobile').value = c.mobile || '';
  document.getElementById('custDoor').value = c.doorNo || '';
  document.getElementById('custPlace').value = c.place || '';
  document.getElementById('custStreet').value = c.street || '';
  if (document.getElementById('custLandmark')) document.getElementById('custLandmark').value = c.landmark || '';
  if (document.getElementById('custEB')) document.getElementById('custEB').value = c.ebNo || '';
  document.getElementById('custBox').value = c.boxNo || '';
  document.getElementById('custSC').value = c.scNo || c.smartCard || '';
  document.getElementById('custPackage').value = c.package || '';
  document.getElementById('custPkgAmt').value = c.packageAmt || '';
  if (document.getElementById('custDueAmt')) document.getElementById('custDueAmt').value = c.dueAmt || c.due || 0;
  if (document.getElementById('custOtherCharges')) document.getElementById('custOtherCharges').value = c.otherCharges || 0;
  if (document.getElementById('custDiscount')) document.getElementById('custDiscount').value = c.discount || 0;
  if (document.getElementById('custDisReason')) document.getElementById('custDisReason').value = c.disReason || '';
  document.getElementById('custConDate').value = c.conDate || '';
  document.getElementById('custStatus').value = c.status || 'ACT';
  if (document.getElementById('custSMS')) document.getElementById('custSMS').value = c.sms || 'Yes';
  if (document.getElementById('custSignal')) document.getElementById('custSignal').value = c.signal || 'Digital';
  if (document.getElementById('custMSO')) document.getElementById('custMSO').value = c.mso || '';
  if (document.getElementById('custBoxType')) document.getElementById('custBoxType').value = c.boxType || 'SD';
  if (document.getElementById('custAadhar')) document.getElementById('custAadhar').value = c.aadhar || '';
  if (document.getElementById('custCAF')) document.getElementById('custCAF').value = c.caf || '';
  if (document.getElementById('custRegDate')) document.getElementById('custRegDate').value = c.regDate || '';
  if (document.getElementById('custBoxAmt')) document.getElementById('custBoxAmt').value = c.boxAmt || 0;
  if (document.getElementById('custBilling')) document.getElementById('custBilling').value = c.billing || 'Yes';
  document.getElementById('custRemarks').value = c.remarks || '';

  showPage('newCustomer');
}

// ==================== DC / RC ====================
async function toggleDC(id, currentStatus) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;

  const newStatus = currentStatus === 'ACT' ? 'DC' : 'ACT';
  const action = newStatus === 'DC' ? 'Disconnect (DC)' : 'Reconnect (RC)';

  if (!confirm(`${c.name} - ${action} செய்யவா?`)) return;

  try {
    await db.collection('customers').doc(id).update({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('statusLogs').add({
      customerId: id,
      customerName: c.name,
      fromStatus: currentStatus,
      toStatus: newStatus,
      date: new Date().toISOString().split('T')[0],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.email
    });

    showToast(`${action} successful!`);
    await loadCustomers();
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}


function displayAgentName(d) {
  const raw = ((typeof d === 'string' ? d : '') + ' ' + (d && d.createdBy || '') + ' ' + (d && d.employee || '') + ' ' + (d && d.collectedBy || '')).toLowerCase();
  const s = (typeof d === 'string' ? d : (d && (d.collectedBy || d.employee || d.createdBy) || '')).toString();
  const lower = s.toLowerCase();
  if (lower.includes('muthumari') || lower.startsWith('muthumari')) return 'MUTHUMARI';
  if (lower.includes('uma@') || lower === 'uma' || /(^|[^a-z])uma([^a-z]|$)/.test(lower)) return 'UMA';
  if (lower.includes('office') || lower.includes('local')) return 'OFFICE';
  if (lower.includes('online')) return 'ONLINE';
  if (lower.includes('stefi')) return 'STEFI';
  if (lower.includes('jeyabal') || lower.includes('muthuraj')) return 'ADMIN';
  // already a short name
  if (s && !s.includes('@') && s.length < 20) return s.toUpperCase();
  if (s.includes('@')) return s.split('@')[0].toUpperCase();
  return s || '-';
}

// ==================== LEDGER ====================
async function viewLedger(id) {
  currentLedgerCustomerId = id;
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;

  document.getElementById('ledgerCustName').textContent = c.name || '-';
  document.getElementById('ledgerCustInfo').textContent =
    `ID: ${c.custId || id} | Mobile: ${c.mobile || '-'} | Box: ${c.boxNo || '-'} | Package: ${c.package || '-'}`;
  document.getElementById('ledgerDue').textContent = '₹' + Number(c.dueAmt || c.due || 0).toLocaleString('en-IN');
  document.getElementById('ledgerStatus').textContent = c.status || 'ACT';
  document.getElementById('ledgerStatus').className =
    (c.status === 'DC') ? 'px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700'
                        : 'px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700';

  try {
    const snap = await db.collection('collections')
      .where('customerId', '==', id)
      .get();

    const rows = [];
    snap.forEach(doc => {
      const d = doc.data();
      rows.push({ id: doc.id, ...d });
    });

    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const tbody = document.getElementById('ledgerTableBody');
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">No collection records</td></tr>`;
    } else {
      let total = 0;
      tbody.innerHTML = rows.map(r => {
        total += Number(r.amount || 0);
        return `
        <tr class="border-t border-slate-100">
          <td class="px-3 py-2 text-sm">${r.date || '-'}</td>
          <td class="px-3 py-2 text-sm font-semibold">₹${Number(r.amount || 0).toLocaleString('en-IN')}</td>
          <td class="px-3 py-2 text-sm">${r.mode || '-'}</td>
          <td class="px-3 py-2 text-sm">${r.remarks || '-'}</td>
          <td class="px-3 py-2 text-xs text-slate-500">${displayAgentName(r)}</td>
        </tr>`;
      }).join('') + `
        <tr class="border-t-2 border-slate-300 bg-slate-50 font-semibold">
          <td class="px-3 py-2">Total</td>
          <td class="px-3 py-2">₹${total.toLocaleString('en-IN')}</td>
          <td colspan="3"></td>
        </tr>`;
    }
  } catch (err) {
    console.error(err);
    document.getElementById('ledgerTableBody').innerHTML =
      `<tr><td colspan="5" class="text-center py-6 text-red-500">Error loading ledger</td></tr>`;
  }

  showPage('ledger');
}

// ==================== PENDING / DUE REPORT ====================
function renderPendingReport() {
  const list = allCustomers.filter(c => Number(c.dueAmt || c.due || 0) > 0);
  list.sort((a, b) => Number(b.dueAmt || b.due || 0) - Number(a.dueAmt || a.due || 0));

  const tbody = document.getElementById('pendingTableBody');
  const totalDue = list.reduce((s, c) => s + Number(c.dueAmt || c.due || 0), 0);

  document.getElementById('pendingCount').textContent = list.length;
  document.getElementById('pendingTotal').textContent = '₹' + totalDue.toLocaleString('en-IN');

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No pending dues</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-3 py-2 font-mono text-xs">${c.custId || c.id.slice(0,6)}</td>
      <td class="px-3 py-2 font-medium text-sm">${c.name || '-'}</td>
      <td class="px-3 py-2 text-sm">${c.mobile || '-'}</td>
      <td class="px-3 py-2 font-mono text-xs">${c.boxNo || '-'}</td>
      <td class="px-3 py-2 text-sm font-bold text-red-600">₹${Number(c.dueAmt || c.due || 0).toLocaleString('en-IN')}</td>
      <td class="px-3 py-2">
        <button onclick="openWhatsApp('${c.mobile || ''}', '${(c.name || '').replace(/'/g, '')}', ${Number(c.dueAmt||c.due||0)})" class="text-green-600 hover:underline text-xs mr-2">WA</button>
        <button onclick="viewLedger('${c.id}')" class="text-purple-600 hover:underline text-xs">Ledger</button>
      </td>
    </tr>
  `).join('');
}

// ==================== BILLING ====================
function searchForBill() {
  const q = document.getElementById('billSearch').value.toLowerCase().trim();
  const resultsDiv = document.getElementById('billSearchResults');

  if (q.length < 2) {
    resultsDiv.classList.add('hidden');
    return;
  }

  const matches = allCustomers.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.mobile || '').includes(q) ||
    (c.boxNo || '').toLowerCase().includes(q) ||
    (c.custId || '').toLowerCase().includes(q)
  ).slice(0, 10);

  if (matches.length === 0) {
    resultsDiv.innerHTML = '<div class="p-3 text-slate-400 text-sm">No match</div>';
  } else {
    resultsDiv.innerHTML = matches.map(c => `
      <div class="p-3 hover:bg-blue-50 cursor-pointer border-b text-sm" onclick="selectBillCustomer('${c.id}')">
        <div class="font-medium">${c.name}</div>
        <div class="text-xs text-slate-500">${c.mobile || '-'} • Box: ${c.boxNo || '-'} • Due: ₹${c.dueAmt || c.due || 0} • ${c.status || 'ACT'}</div>
      </div>
    `).join('');
  }
  resultsDiv.classList.remove('hidden');
}

function selectBillCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  selectedBillCustomer = c;
  document.getElementById('billCustomerId').value = id;
  document.getElementById('billCustName').textContent = c.name;
  document.getElementById('billCustDetails').textContent =
    `${c.mobile || '-'} | Box: ${c.boxNo || '-'} | ${c.package || ''} | Due: ₹${c.dueAmt || c.due || 0}`;
  document.getElementById('selectedCustomerInfo').classList.remove('hidden');
  document.getElementById('billSearchResults').classList.add('hidden');
  document.getElementById('billSearch').value = c.name;
  const due = Number(c.dueAmt || c.due || 0);
  document.getElementById('billAmount').value = due > 0 ? due : (c.packageAmt || '');
}

async function handleSaveBill(e) {
  e.preventDefault();
  const customerId = document.getElementById('billCustomerId').value;
  if (!customerId) {
    showToast('Please select a customer', true);
    return;
  }

  const amount = Number(document.getElementById('billAmount').value);
  if (!amount || amount <= 0) {
    showToast('Enter valid amount', true);
    return;
  }

  const data = {
    customerId,
    customerName: selectedBillCustomer?.name || '',
    amount,
    date: document.getElementById('billDate').value,
    mode: document.getElementById('billMode').value,
    remarks: document.getElementById('billRemarks').value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser.email,
    collectedBy: displayAgentName(currentUser.email)
  };

  try {
    await db.collection('collections').add(data);

    const c = allCustomers.find(x => x.id === customerId);
    if (c) {
      const currentDue = Number(c.dueAmt || c.due || 0);
      const newDue = Math.max(0, currentDue - amount);
      await db.collection('customers').doc(customerId).update({
        dueAmt: newDue,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    showToast('Collection saved! ₹' + amount);
    document.getElementById('billForm').reset();
    document.getElementById('selectedCustomerInfo').classList.add('hidden');
    document.getElementById('billDate').value = new Date().toISOString().split('T')[0];
    selectedBillCustomer = null;
    await loadCustomers();
    loadDashboard();
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
  updateDashboardStats();

  const today = new Date().toISOString().split('T')[0];
  try {
    const colSnap = await db.collection('collections').where('date', '==', today).get();
    let todayTotal = 0;
    const agents = {
      uma: { amt: 0, cnt: 0 },
      muthumari: { amt: 0, cnt: 0 },
      office: { amt: 0, cnt: 0 },
      online: { amt: 0, cnt: 0 },
      other: { amt: 0, cnt: 0 }
    };

    colSnap.forEach(doc => {
      const d = doc.data();
      const amt = Number(d.amount || 0);
      todayTotal += amt;
      const key = classifyAgent(d);
      agents[key].amt += amt;
      agents[key].cnt += 1;
    });

    document.getElementById('statTodayCol').textContent = '₹ ' + todayTotal.toLocaleString('en-IN');
    const setAgent = (id, cntId, data) => {
      const el = document.getElementById(id);
      const cel = document.getElementById(cntId);
      if (el) el.textContent = '₹' + data.amt.toLocaleString('en-IN');
      if (cel) cel.textContent = data.cnt + ' bills';
    };
    setAgent('agentUma', 'agentUmaCnt', agents.uma);
    setAgent('agentMuthu', 'agentMuthuCnt', agents.muthumari);
    setAgent('agentOffice', 'agentOfficeCnt', agents.office);
    setAgent('agentOnline', 'agentOnlineCnt', agents.online);
    const oth = document.getElementById('agentOther');
    if (oth) oth.textContent = '₹' + agents.other.amt.toLocaleString('en-IN') + ' (' + agents.other.cnt + ')';

    const monthStart = today.slice(0, 8) + '01';
    const monthSnap = await db.collection('collections').where('date', '>=', monthStart).get();
    let monthTotal = 0;
    monthSnap.forEach(d => monthTotal += (d.data().amount || 0));
    document.getElementById('statMonthCol').textContent = '₹ ' + monthTotal.toLocaleString('en-IN');
  } catch (e) {
    console.log('Collection stats error', e);
  }
}

function classifyAgent(d) {
  const raw = ((d.createdBy || '') + ' ' + (d.employee || '') + ' ' + (d.collectedBy || '')).toLowerCase();
  if (raw.includes('uma@') || raw.includes(' uma') || raw.trim() === 'uma' || /(^|\s)uma(\s|$)/.test(raw)) return 'uma';
  if (raw.includes('muthumari') || raw.includes('muthu')) return 'muthumari';
  if (raw.includes('office') || raw.includes('local')) return 'office';
  if (raw.includes('online')) return 'online';
  // email local-part
  const email = (d.createdBy || '').toLowerCase();
  if (email.startsWith('uma@')) return 'uma';
  if (email.startsWith('muthumari@')) return 'muthumari';
  if (email.startsWith('office@')) return 'office';
  if (email.startsWith('online@')) return 'online';
  return 'other';
}

function updateDashboardStats() {
  const total = allCustomers.length;
  const active = allCustomers.filter(c => (c.status || 'ACT') === 'ACT').length;
  const pending = allCustomers.filter(c => c.status === 'DC').length;
  const boxes = allCustomers.filter(c => c.boxNo).length;
  const totalDue = allCustomers.reduce((s, c) => s + Number(c.dueAmt || c.due || 0), 0);

  document.getElementById('statCustomers').textContent = total;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statBoxes').textContent = boxes;
  document.getElementById('statDue').textContent = '₹ ' + totalDue.toLocaleString('en-IN');
  const boxDisplay = document.getElementById('boxCountDisplay');
  if (boxDisplay) boxDisplay.textContent = boxes;
}

// ==================== WHATSAPP ====================
const TAMIL_MONTHS = ['ஜனவரி','பிப்ரவரி','மார்ச்','ஏப்ரல்','மே','ஜூன்','ஜூலை','ஆகஸ்ட்','செப்டம்பர்','அக்டோபர்','நவம்பர்','டிசம்பர்'];

function getMonthNameTa() {
  return TAMIL_MONTHS[new Date().getMonth()];
}

function buildDueMessage(name, due) {
  const month = getMonthNameTa();
  const dueStr = Number(due || 0).toLocaleString('en-IN');
  return `வணக்கம் ${name},\n\nJSV Cable - ${month} மாதத்திற்கு இன்னும் நீங்கள் பணம் கட்டவில்லை.\nநிலுவை: ₹${dueStr}\n\nதயவுசெய்து உடனே செலுத்தி இணைப்பு துண்டிப்பை தவிர்க்கவும்.\n\nநன்றி.\nJSV Cable Network`;
}

function openWhatsApp(mobile, name, due) {
  if (!mobile || mobile === '-' || mobile === '0') {
    showToast('No mobile number', true);
    return;
  }
  let num = String(mobile).replace(/\D/g, '');
  if (num.length === 10) num = '91' + num;
  if (num.length < 10) {
    showToast('Invalid mobile', true);
    return;
  }
  const text = encodeURIComponent(buildDueMessage(name || 'Customer', due));
  window.open(`https://wa.me/${num}?text=${text}`, '_blank');
}

// WhatsApp queue for pending
let waQueue = [];
let waQueueIndex = 0;

function startWaQueue() {
  waQueue = allCustomers
    .filter(c => Number(c.dueAmt || c.due || 0) > 0)
    .filter(c => c.mobile && String(c.mobile).replace(/\D/g, '').length >= 10)
    .sort((a, b) => Number(b.dueAmt || b.due || 0) - Number(a.dueAmt || a.due || 0));
  waQueueIndex = 0;
  if (waQueue.length === 0) {
    showToast('Pending + valid mobile இல்லை', true);
    return;
  }
  const bar = document.getElementById('waQueueBar');
  if (bar) bar.classList.remove('hidden');
  sendNextWa(false);
}

function sendNextWa(advance) {
  if (advance) waQueueIndex++;
  if (waQueueIndex >= waQueue.length) {
    showToast('Queue முடிந்தது!');
    const bar = document.getElementById('waQueueBar');
    if (bar) bar.classList.add('hidden');
    return;
  }
  const c = waQueue[waQueueIndex];
  const due = Number(c.dueAmt || c.due || 0);
  const info = document.getElementById('waQueueInfo');
  if (info) info.textContent = `${waQueueIndex + 1} / ${waQueue.length} — ${c.name} — ₹${due}`;
  openWhatsApp(c.mobile, c.name, due);
}

function skipWa() {
  sendNextWa(true);
}

// ==================== TOAST ====================
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden', 'bg-red-600', 'bg-slate-800');
  toast.classList.add(isError ? 'bg-red-600' : 'bg-slate-800');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ==================== GENERATE MONTH DUE ====================
async function generateMonthDue() {
  if (!confirm('Active customers எல்லாருக்கும் Package Amount-ஐ Due-வோடு சேர்க்கவா?\n\nDC customers-க்கு apply ஆகாது.')) return;

  const btn = document.getElementById('genDueBtn');
  const status = document.getElementById('genDueStatus');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
  if (status) { status.classList.remove('hidden'); status.textContent = 'Loading customers...'; }

  try {
    const snap = await db.collection('customers').get();
    const updates = [];
    snap.forEach(doc => {
      const d = doc.data();
      if ((d.status || 'ACT') !== 'ACT') return;
      const pkg = Number(d.packageAmt || 0);
      if (pkg <= 0) return;
      const currentDue = Number(d.dueAmt || d.due || 0);
      updates.push({ id: doc.id, newDue: currentDue + pkg, pkg, name: d.name });
    });

    if (updates.length === 0) {
      showToast('Update செய்ய Active + Package Amount customers இல்லை', true);
      return;
    }

    if (status) status.textContent = updates.length + ' customers update ஆகிறது...';

    // Batch write (max 400 per batch for REST; client SDK batch limit 500)
    const BATCH_SIZE = 400;
    let done = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = updates.slice(i, i + BATCH_SIZE);
      chunk.forEach(u => {
        batch.update(db.collection('customers').doc(u.id), {
          dueAmt: u.newDue,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      done += chunk.length;
      if (status) status.textContent = done + ' / ' + updates.length + ' done...';
    }

    await loadCustomers();
    showToast('Month Due generated! ' + updates.length + ' customers updated');
    if (status) status.textContent = '✅ ' + updates.length + ' Active customers Due updated';
  } catch (err) {
    console.error(err);
    showToast('Error: ' + err.message, true);
    if (status) status.textContent = 'Error: ' + err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Month Due'; }
  }
}
