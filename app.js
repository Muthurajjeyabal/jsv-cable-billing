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
    currentAddons = [];
    if (typeof renderAddonChips === 'function') renderAddonChips();
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
    loadStreetMaster();
    loadPackageMaster();
    loadMsoMaster();
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
    const street = c.street || '';
    return `
    <tr class="border-t border-slate-100 hover:bg-blue-50 cursor-pointer" onclick="viewLedger('${c.id}')">
      <td class="px-3 py-2.5 font-mono text-xs">${c.custId || c.id.slice(0,6)}</td>
      <td class="px-3 py-2.5">
        <div class="font-medium text-sm">${c.name || '-'}</div>
        <div class="text-[10px] text-slate-500 truncate max-w-[140px]">${street}</div>
      </td>
      <td class="px-3 py-2.5 text-sm">${c.mobile || '-'}</td>
      <td class="px-3 py-2.5 font-mono text-xs">${c.boxNo || '-'}</td>
      <td class="px-3 py-2.5 text-sm font-semibold ${due > 0 ? 'text-red-600' : 'text-slate-500'}">₹${due}</td>
      <td class="px-3 py-2.5">
        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${status === 'ACT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
          ${status}
        </span>
      </td>
      <td class="px-3 py-2.5 whitespace-nowrap" onclick="event.stopPropagation()">
        <button onclick="editCustomer('${c.id}')" class="text-blue-600 hover:underline text-xs mr-1">Edit</button>
        <button onclick="toggleDC('${c.id}', '${status}')" class="text-xs mr-1 ${status === 'ACT' ? 'text-red-600' : 'text-green-600'} hover:underline">
          ${status === 'ACT' ? 'DC' : 'RC'}
        </button>
        <button onclick="deleteCustomer('${c.id}')" class="text-red-700 hover:underline text-xs font-medium">Del</button>
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
    custId: (document.getElementById('custCustId')?.value || '').trim(),
    landmark: document.getElementById('custLandmark')?.value.trim() || '',
    ebNo: document.getElementById('custEB')?.value.trim() || '',
    boxNo: document.getElementById('custBox').value.trim(),
    scNo: document.getElementById('custSC').value.trim(),
    smartCard: document.getElementById('custSC').value.trim(),
    package: document.getElementById('custPackage').value,
    packageAmt: (Number(document.getElementById('custPkgAmt').value) || 0) + (Number(document.getElementById('custAddonAmt')?.value) || 0),
    packageBase: Number(document.getElementById('custPkgAmt').value) || 0,
    addons: (() => { try { return JSON.parse(document.getElementById('custAddons')?.value || '[]'); } catch(e) { return []; } })(),
    addonAmt: Number(document.getElementById('custAddonAmt')?.value) || 0,
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
    billingStart: document.getElementById('custBillingStart')?.value || '',
    remarks: document.getElementById('custRemarks').value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (editId) {
      await db.collection('customers').doc(editId).update(data);
      showToast('Customer updated!');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const manualId = (document.getElementById('custCustId')?.value || '').trim();
      data.custId = manualId || ('C' + Date.now().toString().slice(-6));
      data.streetId = getStreetId(data.place, data.street);
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
  onPlaceSelect();
  document.getElementById('custStreet').value = c.street || '';
  if (document.getElementById('custCustId')) document.getElementById('custCustId').value = c.custId || '';
  if (document.getElementById('custIdSuffix')) document.getElementById('custIdSuffix').value = '';
  if (document.getElementById('custLandmark')) document.getElementById('custLandmark').value = c.landmark || '';
  if (document.getElementById('custEB')) document.getElementById('custEB').value = c.ebNo || '';
  document.getElementById('custBox').value = c.boxNo || '';
  document.getElementById('custSC').value = c.scNo || c.smartCard || '';
  document.getElementById('custPackage').value = c.package || '';
  document.getElementById('custPkgAmt').value = c.packageBase != null ? c.packageBase : (c.packageAmt || '');
  setAddonsFromCustomer(c);
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

async function deleteCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  if (!isAdminUser(currentUser)) {
    showToast('Admin only', true);
    return;
  }
  const label = (c.name || '') + ' / ' + (c.custId || id);
  if (!confirm('DELETE customer?\n\n' + label + '\n\n1/2 — Are you sure?')) return;
  if (!confirm('FINAL confirm.\n\n' + label + '\n\nLedger history will remain but customer will be removed from list.\n\n2/2 — Delete permanently?')) return;
  try {
    await db.collection('customers').doc(id).delete();
    allCustomers = allCustomers.filter(x => x.id !== id);
    renderCustomerTable(allCustomers);
    updateDashboardStats();
    showToast('Customer deleted: ' + (c.name || ''));
  } catch (err) {
    showToast('Delete failed: ' + err.message, true);
  }
}

async function toggleDC(id, currentStatus) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;

  const newStatus = currentStatus === 'ACT' ? 'DC' : 'ACT';
  const action = newStatus === 'DC' ? 'Disconnect (DC)' : 'Reconnect (RC)';

  if (!confirm(`${c.name} - ${action} செய்யவா?`)) return;

  let returnBox = false;
  const boxNo = (c.boxNo || '').trim();
  if (newStatus === 'DC' && boxNo) {
    returnBox = confirm(`Box ${boxNo} return ஆனதா?\n\nOK = Store stock-க்கு சேர்க்கும்\nCancel = Box customer-ல் வைக்கும்`);
  }

  try {
    const updates = {
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (returnBox) {
      updates.boxNo = '';
      updates.previousBoxNo = boxNo;
    }
    await db.collection('customers').doc(id).update(updates);

    if (returnBox && boxNo) {
      await upsertBoxStock(boxNo, {
        status: 'available',
        customerId: null,
        customerName: null,
        mso: c.mso || '',
        returnedAt: new Date().toISOString().split('T')[0],
        returnedFrom: c.name || ''
      });
    }

    // RC with no box - optional assign from stock later via Edit
    await db.collection('statusLogs').add({
      customerId: id,
      customerName: c.name,
      fromStatus: currentStatus,
      toStatus: newStatus,
      boxReturned: returnBox,
      boxNo: returnBox ? boxNo : (c.boxNo || ''),
      date: new Date().toISOString().split('T')[0],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.email
    });

    showToast(returnBox ? `${action} + Box ${boxNo} → Store` : `${action} successful!`);
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

function copyLedgerField(kind) {
  const btn = document.getElementById(kind === 'vc' ? 'ledgerVcBtn' : 'ledgerBoxBtn');
  const val = (btn && (btn.dataset.val || btn.textContent)) || '';
  if (!val || val === '-') { showToast((kind === 'vc' ? 'VC' : 'Box') + ' இல்லை', true); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(val).then(() => showToast('Copied: ' + val)).catch(() => fallbackCopy(val));
  } else {
    fallbackCopy(val);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast('Copied: ' + text); } catch(e) { showToast(text); }
  document.body.removeChild(ta);
}
function startBillForLedger() {
  if (!currentLedgerCustomerId) return;
  selectCustomerForBill(currentLedgerCustomerId);
  showPage('billing');
}

async function viewLedger(id) {
  currentLedgerCustomerId = id;
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;

  document.getElementById('ledgerCustName').textContent = c.name || '-';
  const streetLine = [c.street, c.place].filter(Boolean).join(' · ');
  const sl = document.getElementById('ledgerStreetLine');
  if (sl) sl.textContent = streetLine || '-';
  document.getElementById('ledgerCustInfo').textContent =
    `ID: ${c.custId || id} · Mobile: ${c.mobile || '-'} · Package: ${c.package || '-'}`;
  const msoEl = document.getElementById('ledgerMso');
  if (msoEl) msoEl.textContent = c.mso || '-';
  const pkgEl = document.getElementById('ledgerPkg');
  if (pkgEl) {
    const base = c.packageBase != null ? Number(c.packageBase) : Number(c.packageAmt || 0);
    const addon = Number(c.addonAmt || 0);
    const pkgName = c.package || '-';
    pkgEl.textContent = pkgName + (base || addon ? ' · ₹' + (Number(c.packageAmt || base + addon)) : '');
  }
  const vcBtn = document.getElementById('ledgerVcBtn');
  const vc = c.scNo || c.smartCard || '';
  if (vcBtn) {
    vcBtn.textContent = vc || '-';
    vcBtn.dataset.val = vc;
  }
  const boxBtn = document.getElementById('ledgerBoxBtn');
  if (boxBtn) {
    boxBtn.textContent = c.boxNo || '-';
    boxBtn.dataset.val = c.boxNo || '';
  }
  const cd = document.getElementById('ledgerConDate');
  if (cd) cd.textContent = c.conDate || c.connectionDate || '-';
  const ca = document.getElementById('ledgerCafAddon');
  if (ca) {
    let addons = '';
    try {
      const arr = typeof c.addons === 'string' ? JSON.parse(c.addons || '[]') : (c.addons || []);
      if (Array.isArray(arr) && arr.length) addons = arr.map(a => a.name + (a.amount ? ' ₹'+a.amount : '')).join(', ');
    } catch(e) {}
    const caf = c.cafNo || c.caf || '';
    ca.textContent = [caf ? 'CAF: '+caf : '', addons ? 'Add-on: '+addons : ''].filter(Boolean).join(' · ') || '-';
  }
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
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">No collection records</td></tr>`;
    } else {
      let total = 0;
      // active only for total; show cancelled struck
      tbody.innerHTML = rows.map(r => {
        const cancelled = r.status === 'cancelled';
        if (!cancelled) total += Number(r.amount || 0);
        return `
        <tr class="border-t border-slate-100 ${cancelled ? 'opacity-50 line-through' : ''}">
          <td class="px-2 py-2 text-xs font-mono">${r.billNo || '-'}</td>
          <td class="px-2 py-2 text-sm">${r.date || '-'}</td>
          <td class="px-2 py-2 text-sm font-semibold">₹${Number(r.amount || 0).toLocaleString('en-IN')}</td>
          <td class="px-2 py-2 text-sm">${r.mode || '-'}</td>
          <td class="px-2 py-2 text-xs text-slate-500">${displayAgentName(r)}</td>
          <td class="px-2 py-2 text-xs">
            ${cancelled ? '<span class="text-red-500">Cancelled</span>' :
              `<button type="button" onclick="cancelCollection('${r.id}','${id}',${Number(r.amount||0)})" class="text-red-600 hover:underline">Cancel</button>`}
          </td>
        </tr>`;
      }).join('') + `
        <tr class="border-t-2 border-slate-300 bg-slate-50 font-semibold">
          <td class="px-2 py-2" colspan="2">Total (active)</td>
          <td class="px-2 py-2">₹${total.toLocaleString('en-IN')}</td>
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

function selectCustomerForBill(id) { selectBillCustomer(id); }
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

async function nextDailyBillNo(billDate) {
  // Format: YYYY-MM-DD-001 (resets every day)
  const ref = db.collection('counters').doc('bills_' + billDate);
  const billNo = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let n = 1;
    if (snap.exists) n = (Number(snap.data().seq) || 0) + 1;
    tx.set(ref, { seq: n, date: billDate }, { merge: true });
    // Display only 001, 002... (resets daily via counters doc)
    return String(n).padStart(3, '0');
  });
  return billNo;
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

  const billDate = document.getElementById('billDate').value || new Date().toISOString().split('T')[0];
  let billNo = '';
  try {
    billNo = await nextDailyBillNo(billDate);
  } catch (err) {
    // fallback if transaction fails
    billNo = String(Date.now()).slice(-3);
  }

  const data = {
    customerId,
    customerName: selectedBillCustomer?.name || '',
    amount,
    date: billDate,
    billDate,
    billNo,
    mode: document.getElementById('billMode').value,
    remarks: document.getElementById('billRemarks').value.trim(),
    status: 'active',
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

    showToast('Bill ' + billNo + ' · ₹' + amount);
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

async function cancelCollection(colId, customerId, amount) {
  if (!confirm('இந்த bill cancel செய்யவா?\nDue amount customer-க்கு திரும்ப சேரும்.')) return;
  try {
    await db.collection('collections').doc(colId).update({
      status: 'cancelled',
      cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
      cancelledBy: currentUser.email
    });
    const cRef = db.collection('customers').doc(customerId);
    const cSnap = await cRef.get();
    if (cSnap.exists) {
      const due = Number(cSnap.data().dueAmt || cSnap.data().due || 0);
      await cRef.update({
        dueAmt: due + Number(amount || 0),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    showToast('Bill cancelled');
    if (currentLedgerCustomerId) await viewLedger(currentLedgerCustomerId);
    await loadCustomers();
    if (typeof loadCancelledBills === 'function') loadCancelledBills();
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

async function loadCancelledBills() {
  const tbody = document.getElementById('cancelledBillsBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-slate-400">Loading...</td></tr>';
  try {
    const snap = await db.collection('collections').where('status', '==', 'cancelled').get();
    const rows = [];
    snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">No cancelled bills</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr class="border-t">
        <td class="px-3 py-2 font-mono text-xs">${r.billNo || '-'}</td>
        <td class="px-3 py-2 text-sm">${r.date || '-'}</td>
        <td class="px-3 py-2 text-sm">${r.customerName || r.customerId || '-'}</td>
        <td class="px-3 py-2 font-semibold">₹${Number(r.amount||0)}</td>
        <td class="px-3 py-2 text-xs">${displayAgentName(r)}</td>
        <td class="px-3 py-2 text-xs text-slate-500">${(r.cancelledBy||'').split('@')[0]||'-'}</td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-red-500 py-4">${e.message}</td></tr>`;
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

// ==================== STREET MASTER + AUTO CUST ID ====================
// Street ID codes from CableSoft Street Report (JSV S.Alangulam)
const STREET_MASTER = [
  { place: 'AREA 1', street: 'அகத்தியர் தெரு', streetId: 'AGA' },
  { place: 'AREA 1', street: 'அன்பு--1', streetId: '1AN' },
  { place: 'AREA 1', street: 'அன்பு--2', streetId: '2AN' },
  { place: 'AREA 1', street: 'அலமேலு நகர்', streetId: 'ALA' },
  { place: 'AREA 1', street: 'அழகுமலையான்-1', streetId: '1AL' },
  { place: 'AREA 1', street: 'அழகுமலையான்-2', streetId: '2AL' },
  { place: 'AREA 1', street: 'ஆனந்தா', streetId: 'ATH' },
  { place: 'AREA 1', street: 'ஆலங்குளம்', streetId: 'ALK' },
  { place: 'AREA 1', street: 'இளங்கோ அடிகள்', streetId: 'ILA' },
  { place: 'AREA 1', street: 'கணபதி---2', streetId: '2GB' },
  { place: 'AREA 1', street: 'கணபதி---3', streetId: '3GB' },
  { place: 'AREA 1', street: 'கணபதி---I', streetId: '1GB' },
  { place: 'AREA 1', street: 'கபிலர் தெரு', streetId: 'KAB' },
  { place: 'AREA 1', street: 'கிருபை கிழக்கு', streetId: 'KES' },
  { place: 'AREA 1', street: 'கேபிள் எதிர்', streetId: 'OPP' },
  { place: 'AREA 1', street: 'சக்தி விநாயகர்', streetId: 'SAK' },
  { place: 'AREA 1', street: 'சுந்தரர் தெரு', streetId: 'SUN' },
  { place: 'AREA 1', street: 'டிசைன் நகர்--1', streetId: '1DE' },
  { place: 'AREA 1', street: 'டிசைன் நகர்--2', streetId: '2DE' },
  { place: 'AREA 1', street: 'டிசைன் நகர்--3', streetId: '3DE' },
  { place: 'AREA 1', street: 'டிசைன் மெயின்', streetId: 'DES' },
  { place: 'AREA 1', street: 'டெலிபோன்காலனி', streetId: 'TEL' },
  { place: 'AREA 1', street: 'தாயுமானவர்', streetId: 'THI' },
  { place: 'AREA 1', street: 'திருமுலர் தெரு', streetId: 'THR' },
  { place: 'AREA 1', street: 'தொல்காப்பியர் தெரு', streetId: 'THL' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--1', streetId: '1BH' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--2', streetId: '2BH' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--3', streetId: '3BH' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--4', streetId: '4BH' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--5', streetId: '5BH' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--6', streetId: '6BH' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--7', streetId: '7BH' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--8', streetId: '8BH' },
  { place: 'AREA 1', street: 'பாரதிபுரம்--9', streetId: '9BH' },
  { place: 'AREA 1', street: 'பூங்கா நகர் -I', streetId: '1PK' },
  { place: 'AREA 1', street: 'மங்கள விநாயகர்', streetId: 'MAV' },
  { place: 'AREA 1', street: 'மங்கள விநாயகர் குறுக்கு', streetId: 'MAK' },
  { place: 'AREA 1', street: 'மந்தையம்மன் கோயில்', streetId: 'MAN' },
  { place: 'AREA 1', street: 'மாணிக்கவாசகர்', streetId: 'MKV' },
  { place: 'AREA 1', street: 'மாவுமில் தெரு', streetId: 'MIL' },
  { place: 'AREA 1', street: 'முனியாண்டி---1', streetId: '1MU' },
  { place: 'AREA 1', street: 'முனியாண்டி---2', streetId: '2MU' },
  { place: 'AREA 1', street: 'வீரமா முனிவர்', streetId: 'VER' },
  { place: 'AREA 2', street: 'SVP', streetId: 'SVP' },
  { place: 'AREA 2', street: 'அம்மன்--1', streetId: '1AM' },
  { place: 'AREA 2', street: 'அம்மன்--2', streetId: '2AM' },
  { place: 'AREA 2', street: 'அம்மன்--3', streetId: '3AM' },
  { place: 'AREA 2', street: 'அம்மன்--4', streetId: '4AM' },
  { place: 'AREA 2', street: 'அம்மன்--5', streetId: '5AM' },
  { place: 'AREA 2', street: 'அம்மன்--6', streetId: '6AM' },
  { place: 'AREA 2', street: 'அற்புதம் நகர்', streetId: 'ARP' },
  { place: 'AREA 2', street: 'அழகேந்திரன் - I', streetId: '1AG' },
  { place: 'AREA 2', street: 'அழகேந்திரன் - II', streetId: '2AG' },
  { place: 'AREA 2', street: 'அழகேந்திரன் - III', streetId: '3AG' },
  { place: 'AREA 2', street: 'இமயம்', streetId: 'IMA' },
  { place: 'AREA 2', street: 'இமயம் மெயின்', streetId: 'IMM' },
  { place: 'AREA 2', street: 'இமயம்---1', streetId: '1IM' },
  { place: 'AREA 2', street: 'எவரெஸ்ட்-1', streetId: '1EV' },
  { place: 'AREA 2', street: 'எவரெஸ்ட்-2', streetId: '2EV' },
  { place: 'AREA 2', street: 'ஔவையார் குறுக்கு தெரு---1', streetId: '1OV' },
  { place: 'AREA 2', street: 'ஔவையார்தெரு', streetId: 'OVI' },
  { place: 'AREA 2', street: 'கமலேஷ்', streetId: 'KLS' },
  { place: 'AREA 2', street: 'கருப்பசாமி- குறுக்கு', streetId: 'KRK' },
  { place: 'AREA 2', street: 'கருப்பசாமி--1', streetId: '1KR' },
  { place: 'AREA 2', street: 'கருப்பசாமி--II', streetId: '2KR' },
  { place: 'AREA 2', street: 'காமராஜர் தெரு', streetId: 'KAM' },
  { place: 'AREA 2', street: 'குறிஞ்சி தெரு', streetId: 'KUR' },
  { place: 'AREA 2', street: 'சக்கரபாணி தெரு', streetId: 'SKP' },
  { place: 'AREA 2', street: 'சின்னபொண்ணு கோவில்', streetId: 'CPK' },
  { place: 'AREA 2', street: 'செந்தூர் நகர்', streetId: 'SEN' },
  { place: 'AREA 2', street: 'செந்தூர்குறுக்கு--2', streetId: '2SK' },
  { place: 'AREA 2', street: 'செந்தூர்குறுக்கு--I', streetId: '1SK' },
  { place: 'AREA 2', street: 'செல்வாகார்டன்--1', streetId: '1SG' },
  { place: 'AREA 2', street: 'செல்வாகார்டன்--2', streetId: '2SG' },
  { place: 'AREA 2', street: 'ஜெயம் நகர்', streetId: 'JAY' },
  { place: 'AREA 2', street: 'நேருதெரு', streetId: 'NEH' },
  { place: 'AREA 2', street: 'பிரசன்னா நகர்', streetId: 'PRA' },
  { place: 'AREA 2', street: 'பொன் நகர் 1', streetId: '1PN' },
  { place: 'AREA 2', street: 'பொன் நகர் 2', streetId: '2PN' },
  { place: 'AREA 2', street: 'மகரிசி நகர் I', streetId: '1MR' },
  { place: 'AREA 2', street: 'மகரிசி நகர் II', streetId: '2MR' },
  { place: 'AREA 2', street: 'மகரிசி மெயின்', streetId: 'MRM' },
  { place: 'AREA 2', street: 'மலர் நகர்--1', streetId: '1ML' },
  { place: 'AREA 2', street: 'மலர் நகர்--2', streetId: '2ML' },
  { place: 'AREA 2', street: 'முத்தாலம்மான்', streetId: 'MUT' },
  { place: 'AREA 2', street: 'ராமலிங்கா--1', streetId: '1RM' },
  { place: 'AREA 2', street: 'ராமலிங்கா--2', streetId: '2RM' },
  { place: 'AREA 2', street: 'ராமலிங்கா--3', streetId: '3RM' },
  { place: 'AREA 2', street: 'ரோஜா--1', streetId: '1RJ' },
  { place: 'AREA 2', street: 'ரோஜா--2', streetId: '2RJ' },
];

function getStreetsForPlace(place) {
  // Prefer Firestore street master (streetMasterCache); fallback STREET_MASTER code list
  const src = (streetMasterCache && streetMasterCache.length)
    ? streetMasterCache
    : STREET_MASTER;
  const list = src.filter(s => s.place === place)
    .map(s => ({ place: s.place, street: s.street, streetId: s.streetId, id: s.id }));
  list.sort((a, b) => a.street.localeCompare(b.street, 'ta'));
  return list;
}

function guessStreetId(c) {
  // try extract letter prefix from existing custId on same street
  const same = allCustomers.filter(x => x.street === c.street && x.custId);
  for (const x of same) {
    const m = String(x.custId).match(/^([A-Z0-9]+?)(\d+[A-D]?)$/i);
    if (m) return m[1].toUpperCase();
  }
  return (c.street || 'X').replace(/\s+/g, '').slice(0, 3).toUpperCase();
}

function getStreetId(place, street) {
  const m = STREET_MASTER.find(s => s.place === place && s.street === street);
  if (m) return m.streetId;
  const same = allCustomers.find(c => c.street === street && c.custId);
  if (same) return guessStreetId(same);
  return (street || 'X').replace(/\s+/g, '').slice(0, 3).toUpperCase();
}

function onPlaceSelect() {
  const place = document.getElementById('custPlace').value;
  const sel = document.getElementById('custStreet');
  if (!sel) return;
  sel.innerHTML = '<option value="">- Select Street -</option>';
  if (!place) return;
  getStreetsForPlace(place).forEach(s => {
    sel.innerHTML += `<option value="${s.street}" data-sid="${s.streetId}">${s.street} (${s.streetId})</option>`;
  });
  const idEl = document.getElementById('custCustId');
  if (idEl && !document.getElementById('editCustomerId').value) idEl.value = '';
}

function onStreetSelect() {
  const editId = document.getElementById('editCustomerId').value;
  // only auto-generate for NEW customers
  if (editId) return;
  const place = document.getElementById('custPlace').value;
  const street = document.getElementById('custStreet').value;
  if (!place || !street) return;
  const streetId = getStreetId(place, street);
  const suffix = (document.getElementById('custIdSuffix') || {}).value || '';
  const nextNum = getNextNumberForStreet(streetId, street);
  const newId = streetId + nextNum + suffix;
  const idEl = document.getElementById('custCustId');
  if (idEl) idEl.value = newId;
}

function getNextNumberForStreet(streetId, street) {
  let maxN = 0;
  const re = new RegExp('^' + streetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)', 'i');
  allCustomers.forEach(c => {
    const id = String(c.custId || '');
    // match same streetId prefix
    const m = id.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    } else if (c.street === street && id) {
      // fallback: trailing digits
      const m2 = id.match(/(\d+)/);
      if (m2) {
        const n = parseInt(m2[1], 10);
        if (n > maxN) maxN = n;
      }
    }
  });
  return maxN + 1;
}


// ==================== NEW CONNECTION BILLING SLAB ====================
// 1-10: full package now, auto due from next month
// 11-20: half package now, auto due from next month
// 21-31: full package now, auto due from month+2
function addMonths(ym, n) {
  // ym = 'YYYY-MM'
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function calcNewConnectionBilling() {
  // Scheme A: full package now, auto Month Due always from next month
  const conDate = (document.getElementById('custConDate') || {}).value || '';
  const pkgAmt = Number((document.getElementById('custPkgAmt') || {}).value || 0);
  const addonAmt = Number((document.getElementById('custAddonAmt') || {}).value || 0);
  const monthly = pkgAmt + addonAmt;
  const editId = (document.getElementById('editCustomerId') || {}).value || '';
  if (editId) return;
  if (!conDate) return;

  const ym = conDate.slice(0, 7);
  const billingStart = addMonths(ym, 1);
  const dueEl = document.getElementById('custDueAmt');
  if (dueEl && monthly > 0) dueEl.value = monthly;

  let hidden = document.getElementById('custBillingStart');
  if (!hidden) {
    hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = 'custBillingStart';
    document.getElementById('customerForm')?.appendChild(hidden);
  }
  hidden.value = billingStart;

  let tip = document.getElementById('billingSlabTip');
  if (!tip) {
    tip = document.createElement('p');
    tip.id = 'billingSlabTip';
    tip.className = 'text-xs text-blue-700 mt-1 sm:col-span-2';
    const dueWrap = dueEl?.parentElement;
    if (dueWrap) dueWrap.appendChild(tip);
  }
  tip.textContent = 'Scheme A: Full package now · Auto bill from next month (' + billingStart + ')';
}


function onPackageChange() {
  const sel = document.getElementById('custPackage');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const amt = opt && opt.dataset ? opt.dataset.amt : '';
  const pkgAmt = document.getElementById('custPkgAmt');
  if (pkgAmt && amt) pkgAmt.value = amt;
  recalcPackageTotal();
  calcNewConnectionBilling();
}

let currentAddons = [];

function renderAddonChips() {
  const box = document.getElementById('addonChips');
  if (!box) return;
  if (!currentAddons.length) {
    box.innerHTML = '<span class="text-xs text-slate-400">No add-ons</span>';
  } else {
    box.innerHTML = currentAddons.map((a, i) =>
      `<span class="inline-flex items-center gap-1 bg-blue-50 text-blue-800 text-xs px-2 py-1 rounded-full border border-blue-200">
        ${a.name} ₹${a.amount}
        <button type="button" onclick="removeAddon(${i})" class="text-red-500 font-bold ml-1">&times;</button>
      </span>`
    ).join('');
  }
  recalcPackageTotal();
}

function addCustomAddon() {
  const name = (document.getElementById('addonNameInput').value || '').trim();
  const amount = Number(document.getElementById('addonAmtInput').value || 0);
  if (!name) { showToast('Channel name type பண்ணுங்கள்', true); return; }
  if (!amount || amount <= 0) { showToast('Amount enter பண்ணுங்கள்', true); return; }
  currentAddons.push({ name, amount });
  document.getElementById('addonNameInput').value = '';
  document.getElementById('addonAmtInput').value = '';
  renderAddonChips();
}

function removeAddon(i) {
  currentAddons.splice(i, 1);
  renderAddonChips();
}

function getSelectedAddons() {
  const list = currentAddons.slice();
  const total = list.reduce((s, a) => s + Number(a.amount || 0), 0);
  return { list, total };
}

function recalcPackageTotal() {
  const pkgAmt = Number((document.getElementById('custPkgAmt') || {}).value || 0);
  const { list, total: addonAmt } = getSelectedAddons();
  const grand = pkgAmt + addonAmt;
  const ad = document.getElementById('addonTotalDisp');
  const pd = document.getElementById('pkgTotalDisp');
  const ha = document.getElementById('custAddons');
  const ham = document.getElementById('custAddonAmt');
  if (ad) ad.textContent = '₹' + addonAmt;
  if (pd) pd.textContent = '₹' + grand;
  if (ha) ha.value = JSON.stringify(list);
  if (ham) ham.value = String(addonAmt);

  const due = document.getElementById('custDueAmt');
  const editId = document.getElementById('editCustomerId');
  if (due && (!editId || !editId.value)) {
    due.value = grand > 0 ? grand : '';
  }
  calcNewConnectionBilling();
}

function setAddonsFromCustomer(c) {
  let addons = c.addons || [];
  if (typeof addons === 'string') {
    try { addons = JSON.parse(addons); } catch(e) { addons = []; }
  }
  if (!Array.isArray(addons)) addons = [];
  currentAddons = addons.map(a => ({
    name: a.name || String(a),
    amount: Number(a.amount != null ? a.amount : a.amt || 0)
  }));
  renderAddonChips();
}

async function bulkAddAddon() {
  const name = (document.getElementById('bulkAddonName').value || '').trim();
  const amount = Number(document.getElementById('bulkAddonAmt').value || 0);
  const area = document.getElementById('bulkAddonArea').value;
  if (!name || !amount) { showToast('Name + Amount தேவை', true); return; }
  if (!confirm((area === 'ALL' ? 'All Active' : area) + ' customers-க்கு\n' + name + ' ₹' + amount + ' சேர்க்கவா?')) return;

  const status = document.getElementById('bulkAddonStatus');
  if (status) { status.classList.remove('hidden'); status.textContent = 'Processing...'; }

  try {
    let targets = allCustomers.filter(c => (c.status || 'ACT') === 'ACT');
    if (area !== 'ALL') targets = targets.filter(c => (c.place || '') === area);
    let updated = 0;
    const BATCH = 400;
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = db.batch();
      const chunk = targets.slice(i, i + BATCH);
      chunk.forEach(c => {
        let addons = c.addons || [];
        if (typeof addons === 'string') { try { addons = JSON.parse(addons); } catch(e) { addons = []; } }
        if (!Array.isArray(addons)) addons = [];
        // skip if already has same name
        if (addons.some(a => (a.name || '') === name)) return;
        addons.push({ name, amount });
        const addonAmt = addons.reduce((s, a) => s + Number(a.amount || 0), 0);
        const base = c.packageBase != null ? Number(c.packageBase) : Math.max(0, Number(c.packageAmt || 0) - Number(c.addonAmt || 0));
        batch.update(db.collection('customers').doc(c.id), {
          addons,
          addonAmt,
          packageBase: base,
          packageAmt: base + addonAmt,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        updated++;
      });
      await batch.commit();
      if (status) status.textContent = updated + ' updated...';
    }
    await loadCustomers();
    showToast(updated + ' customers-க்கு ' + name + ' சேர்ந்தது');
    if (status) status.textContent = '✅ ' + updated + ' customers updated';
  } catch (e) {
    showToast('Error: ' + e.message, true);
    if (status) status.textContent = e.message;
  }
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden', 'bg-red-600', 'bg-slate-800');
  toast.classList.add(isError ? 'bg-red-600' : 'bg-slate-800');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ==================== GENERATE MONTH DUE ====================
async function generateMonthDue() {
  if (!confirm('Active customers-க்கு Package Amount Due-வோடு சேர்க்கவா?\n\nDC மற்றும் Package ₹0 skip ஆகும்.')) return;

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
      if (pkg <= 0) return; // free / zero package = no due
      // billingStart = YYYY-MM — skip until that month
      const bs = d.billingStart || '';
      if (bs) {
        const nowYM = new Date().toISOString().slice(0, 7);
        if (nowYM < bs) return;
      }
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

// ==================== BOX STOCK ====================
let allBoxes = [];
let boxListFilter = 'available';

async function upsertBoxStock(boxNo, data) {
  const q = await db.collection('boxes').where('boxNo', '==', boxNo).limit(1).get();
  if (q.empty) {
    await db.collection('boxes').add({
      boxNo,
      status: data.status || 'available',
      customerId: data.customerId || null,
      customerName: data.customerName || null,
      mso: data.mso || '',
      returnedAt: data.returnedAt || null,
      returnedFrom: data.returnedFrom || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    await q.docs[0].ref.update({
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

async function loadBoxes() {
  try {
    const snap = await db.collection('boxes').get();
    allBoxes = [];
    snap.forEach(doc => allBoxes.push({ id: doc.id, ...doc.data() }));
    allBoxes.sort((a, b) => (a.boxNo || '').localeCompare(b.boxNo || '', undefined, { numeric: true }));
    updateBoxStats();
    renderBoxList(boxListFilter);
  } catch (e) {
    console.error(e);
    showToast('Boxes load error: ' + e.message, true);
  }
}

function updateBoxStats() {
  const avail = allBoxes.filter(b => b.status === 'available').length;
  const assigned = allBoxes.filter(b => b.status === 'assigned').length;
  const el1 = document.getElementById('boxStockCount');
  const el2 = document.getElementById('boxAssignedCount');
  const el3 = document.getElementById('boxCountDisplay');
  if (el1) el1.textContent = avail;
  if (el2) el2.textContent = assigned;
  if (el3) el3.textContent = allBoxes.length;
}

function renderBoxList(filter) {
  boxListFilter = filter || boxListFilter;
  ['Avail', 'Assign', 'All'].forEach((t, i) => {
    const id = ['boxTabAvail', 'boxTabAssign', 'boxTabAll'][i];
    const el = document.getElementById(id);
    if (!el) return;
    const active = (filter === 'available' && i === 0) || (filter === 'assigned' && i === 1) || (filter === 'all' && i === 2);
    el.className = active ? 'px-3 py-1 rounded-lg bg-green-100 text-green-800 font-medium' : 'px-3 py-1 rounded-lg hover:bg-slate-100';
  });
  let list = allBoxes;
  if (filter === 'available') list = allBoxes.filter(b => b.status === 'available');
  if (filter === 'assigned') list = allBoxes.filter(b => b.status === 'assigned');
  const tbody = document.getElementById('boxTableBody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-slate-400">No boxes</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(b => `
    <tr class="border-t border-slate-100">
      <td class="px-2 py-2 font-mono text-xs">${b.boxNo || '-'}</td>
      <td class="px-2 py-2 font-mono text-xs">${b.scNo || '-'}</td>
      <td class="px-2 py-2 text-xs">${b.mso || '-'}</td>
      <td class="px-2 py-2 text-xs">${b.boxType || '-'}</td>
      <td class="px-2 py-2"><span class="text-xs px-2 py-0.5 rounded ${b.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">${b.status === 'available' ? 'In Stock' : (b.status || '-')}</span></td>
      <td class="px-2 py-2 text-xs">${b.customerName || '—'}</td>
    </tr>
  `).join('');
}

function clearBoxForm() {
  ['newBoxInvNo','newBoxName','newBoxScNo','newBoxNo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const mso = document.getElementById('newBoxMso'); if (mso) mso.value = '';
  const pt = document.getElementById('newBoxPurType'); if (pt) pt.value = 'New';
  const bt = document.getElementById('newBoxType'); if (bt) bt.value = 'HD';
  const idate = document.getElementById('newBoxInvDate');
  if (idate) idate.value = new Date().toISOString().split('T')[0];
}

async function addBoxToStock() {
  const boxNo = (document.getElementById('newBoxNo').value || '').trim();
  const scNo = (document.getElementById('newBoxScNo').value || '').trim();
  const mso = (document.getElementById('newBoxMso').value || '').trim();
  const boxType = (document.getElementById('newBoxType') || {}).value || 'HD';
  const purType = (document.getElementById('newBoxPurType') || {}).value || 'New';
  const invNo = (document.getElementById('newBoxInvNo') || {}).value || '';
  const invDate = (document.getElementById('newBoxInvDate') || {}).value || '';
  const boxName = (document.getElementById('newBoxName') || {}).value || '';
  if (!boxNo) { showToast('Box Number enter பண்ணுங்கள்', true); return; }
  if (!scNo) { showToast('SC No enter பண்ணுங்கள்', true); return; }
  if (!mso) { showToast('MSO select பண்ணுங்கள்', true); return; }
  try {
    await upsertBoxStock(boxNo, {
      status: 'available',
      customerId: null,
      customerName: null,
      mso,
      boxType,
      scNo,
      boxName: boxName.trim(),
      purType,
      invNo: invNo.trim(),
      invDate,
      source: 'purchase'
    });
    clearBoxForm();
    showToast('Box ' + boxNo + ' (' + mso + ') saved → Store');
    await loadBoxes();
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}

async function syncBoxesFromCustomers() {
  if (!confirm('Customer list-ல் இருக்கும் box numbers-ஐ stock-ல் sync செய்யவா?\n(Already assigned ஆக mark ஆகும்)')) return;
  try {
    let n = 0;
    for (const c of allCustomers) {
      const boxNo = (c.boxNo || '').trim();
      if (!boxNo) continue;
      const st = (c.status || 'ACT') === 'ACT' ? 'assigned' : 'available';
      await upsertBoxStock(boxNo, {
        status: st,
        customerId: st === 'assigned' ? c.id : null,
        customerName: st === 'assigned' ? (c.name || '') : null,
        mso: c.mso || ''
      });
      n++;
    }
    showToast('Synced ' + n + ' boxes');
    await loadBoxes();
  } catch (e) {
    showToast('Sync error: ' + e.message, true);
  }
}

// ==================== STREET MASTER (Firestore) ====================
let streetMasterCache = [];
let streetMasterFilter = 'ALL';

async function loadStreetMaster() {
  try {
    const snap = await db.collection('streets').get();
    streetMasterCache = [];
    snap.forEach(doc => streetMasterCache.push({ id: doc.id, ...doc.data() }));
    streetMasterCache.sort((a, b) => {
      const p = (a.place || '').localeCompare(b.place || '');
      if (p) return p;
      return (a.street || '').localeCompare(b.street || '', 'ta');
    });
    renderStreetMasterTable();
  } catch (e) {
    console.error(e);
    showToast('Street load error: ' + e.message, true);
  }
}

function filterStreetMaster(f) {
  streetMasterFilter = f || 'ALL';
  ['stFilterAll', 'stFilter1', 'stFilter2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (streetMasterFilter === 'ALL' && i === 0) ||
               (streetMasterFilter === 'AREA 1' && i === 1) ||
               (streetMasterFilter === 'AREA 2' && i === 2);
    el.className = on ? 'px-3 py-1 rounded-lg bg-slate-200 font-medium' : 'px-3 py-1 rounded-lg hover:bg-slate-100';
  });
  // sync form place dropdown when filtering by area
  const placeSel = document.getElementById('mstPlace');
  if (placeSel && (streetMasterFilter === 'AREA 1' || streetMasterFilter === 'AREA 2')) {
    placeSel.value = streetMasterFilter;
  }
  renderStreetMasterTable();
}

function renderStreetMasterTable() {
  const tbody = document.getElementById('streetMasterBody');
  if (!tbody) return;
  let list = streetMasterCache;
  if (streetMasterFilter !== 'ALL') list = list.filter(s => s.place === streetMasterFilter);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-slate-400">No streets — click Import default list</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(s => `
    <tr class="border-t">
      <td class="px-3 py-2 text-xs">${s.place || ''}</td>
      <td class="px-3 py-2 text-sm">${s.street || ''}</td>
      <td class="px-3 py-2 font-mono text-xs">${s.streetId || ''}</td>
      <td class="px-3 py-2">
        <button type="button" onclick="editStreetMaster('${s.id}')" class="text-blue-600 text-xs mr-2">Edit</button>
        <button type="button" onclick="deleteStreetMaster('${s.id}')" class="text-red-600 text-xs">Del</button>
      </td>
    </tr>
  `).join('');
}

function clearStreetForm() {
  document.getElementById('editStreetDocId').value = '';
  document.getElementById('mstStreet').value = '';
  document.getElementById('mstStreetId').value = '';
}

function editStreetMaster(id) {
  const s = streetMasterCache.find(x => x.id === id);
  if (!s) return;
  document.getElementById('editStreetDocId').value = id;
  document.getElementById('mstPlace').value = s.place || 'AREA 1';
  document.getElementById('mstStreet').value = s.street || '';
  document.getElementById('mstStreetId').value = s.streetId || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveStreetMaster() {
  const place = document.getElementById('mstPlace').value;
  const street = (document.getElementById('mstStreet').value || '').trim();
  const streetId = (document.getElementById('mstStreetId').value || '').trim().toUpperCase();
  const editId = document.getElementById('editStreetDocId').value;
  if (!street || !streetId) { showToast('Street + Street ID தேவை', true); return; }
  try {
    const data = { place, street, streetId, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (editId) {
      await db.collection('streets').doc(editId).update(data);
      showToast('Street updated');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('streets').add(data);
      showToast('Street added');
    }
    clearStreetForm();
    await loadStreetMaster();
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}

async function deleteStreetMaster(id) {
  if (!confirm('Delete this street?')) return;
  try {
    await db.collection('streets').doc(id).delete();
    showToast('Deleted');
    await loadStreetMaster();
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}

async function seedStreetsFromCode() {
  if (!confirm('CableSoft official street list import?\n\nOLD streets in Firestore DELETE ஆகும்.\nExact 90 streets மட்டும் சேரும்.')) return;
  try {
    await loadStreetMaster();
    // delete all existing
    let del = 0;
    for (let i = 0; i < streetMasterCache.length; i += 400) {
      const batch = db.batch();
      streetMasterCache.slice(i, i + 400).forEach(s => {
        if (s.id) { batch.delete(db.collection('streets').doc(s.id)); del++; }
      });
      await batch.commit();
    }
    let n = 0;
    for (let i = 0; i < STREET_MASTER.length; i += 400) {
      const batch = db.batch();
      STREET_MASTER.slice(i, i + 400).forEach(s => {
        const ref = db.collection('streets').doc();
        batch.set(ref, {
          place: s.place,
          street: s.street,
          streetId: s.streetId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        n++;
      });
      await batch.commit();
    }
    showToast('Deleted ' + del + ' · Imported ' + n + ' official streets');
    await loadStreetMaster();
  } catch (e) {
    showToast('Import error: ' + e.message, true);
  }
}

// preload streets after login customers load

function showMasterPanel(name) {
  const hub = document.getElementById('mastersHub');
  document.querySelectorAll('.master-panel').forEach(p => p.classList.add('hidden'));
  if (!name) {
    if (hub) hub.classList.remove('hidden');
    return;
  }
  if (hub) hub.classList.add('hidden');
  const panel = document.getElementById('masterPanel-' + name);
  if (panel) panel.classList.remove('hidden');
  if (name === 'street') loadStreetMaster();
  if (name === 'package') loadPackageMaster();
  if (name === 'mso') loadMsoMaster();
  if (name === 'company') loadCompanyInfo();
}

let packageMasterCache = [];
let msoMasterCache = [];

async function loadPackageMaster() {
  const snap = await db.collection('packages').orderBy('amount').get().catch(() => db.collection('packages').get());
  packageMasterCache = [];
  (snap.forEach ? snap : { forEach: () => {} });
  snap.forEach(doc => packageMasterCache.push({ id: doc.id, ...doc.data() }));
  packageMasterCache.sort((a,b) => Number(a.amount||0) - Number(b.amount||0));
  const tbody = document.getElementById('packageMasterBody');
  if (!tbody) return;
  tbody.innerHTML = packageMasterCache.map(p => `
    <tr class="border-t">
      <td class="px-3 py-2">${p.name||''}</td>
      <td class="px-3 py-2">₹${p.amount||0}</td>
      <td class="px-3 py-2">
        <button type="button" class="text-blue-600 text-xs mr-2" onclick="editPackageMaster('${p.id}')">Edit</button>
        <button type="button" class="text-red-600 text-xs" onclick="deletePackageMaster('${p.id}')">Del</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="3" class="text-center py-4 text-slate-400">Empty — Import 100–600</td></tr>';
  refreshCustomerPackageDropdown();
}

function editPackageMaster(id) {
  const p = packageMasterCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById('editPkgDocId').value = id;
  document.getElementById('mstPkgName').value = p.name || '';
  document.getElementById('mstPkgAmt').value = p.amount || '';
}

async function savePackageMaster() {
  const name = (document.getElementById('mstPkgName').value||'').trim();
  const amount = Number(document.getElementById('mstPkgAmt').value||0);
  const editId = document.getElementById('editPkgDocId').value;
  if (!name || !amount) { showToast('Name + Amount', true); return; }
  if (editId) await db.collection('packages').doc(editId).update({ name, amount });
  else await db.collection('packages').add({ name, amount, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  document.getElementById('editPkgDocId').value = '';
  document.getElementById('mstPkgName').value = '';
  document.getElementById('mstPkgAmt').value = '';
  showToast('Package saved');
  await loadPackageMaster();
}

async function deletePackageMaster(id) {
  if (!confirm('Delete package?')) return;
  await db.collection('packages').doc(id).delete();
  await loadPackageMaster();
}

async function seedPackages() {
  if (!confirm('PLAN 100–600 import?')) return;
  const amts = [100,150,180,200,220,230,250,260,275,280,290,300,305,310,315,325,350,380,400,450,500,550,600];
  await loadPackageMaster();
  const have = new Set(packageMasterCache.map(p => p.name));
  for (const a of amts) {
    const name = 'PLAN ' + a;
    if (have.has(name)) continue;
    await db.collection('packages').add({ name, amount: a });
  }
  showToast('Packages imported');
  await loadPackageMaster();
}

function refreshCustomerPackageDropdown() {
  const sel = document.getElementById('custPackage');
  if (!sel || !packageMasterCache.length) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Select Package</option>' +
    packageMasterCache.map(p => `<option value="${p.name}" data-amt="${p.amount}">${p.name}</option>`).join('');
  if (cur) sel.value = cur;
}

async function loadMsoMaster() {
  const snap = await db.collection('msos').get();
  msoMasterCache = [];
  snap.forEach(doc => msoMasterCache.push({ id: doc.id, ...doc.data() }));
  msoMasterCache.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  const tbody = document.getElementById('msoMasterBody');
  if (!tbody) return;
  tbody.innerHTML = msoMasterCache.map(m => `
    <tr class="border-t">
      <td class="px-3 py-2 font-mono text-sm">${m.name||''}</td>
      <td class="px-3 py-2">
        <button type="button" class="text-blue-600 text-xs mr-2" onclick="editMsoMaster('${m.id}')">Edit</button>
        <button type="button" class="text-red-600 text-xs" onclick="deleteMsoMaster('${m.id}')">Del</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="2" class="text-center py-4 text-slate-400">Empty — Import default</td></tr>';
  refreshCustomerMsoDropdown();
}

function editMsoMaster(id) {
  const m = msoMasterCache.find(x => x.id === id);
  if (!m) return;
  document.getElementById('editMsoDocId').value = id;
  document.getElementById('mstMsoName').value = m.name || '';
}

async function saveMsoMaster() {
  const name = (document.getElementById('mstMsoName').value||'').trim();
  const editId = document.getElementById('editMsoDocId').value;
  if (!name) { showToast('MSO name', true); return; }
  if (editId) await db.collection('msos').doc(editId).update({ name });
  else await db.collection('msos').add({ name });
  document.getElementById('editMsoDocId').value = '';
  document.getElementById('mstMsoName').value = '';
  showToast('MSO saved');
  await loadMsoMaster();
}

async function deleteMsoMaster(id) {
  if (!confirm('Delete MSO?')) return;
  await db.collection('msos').doc(id).delete();
  await loadMsoMaster();
}

async function seedMso() {
  const list = ['SPCHE0077','SPCHE5981','TACTV25215','TACTV25257','SCV'];
  await loadMsoMaster();
  const have = new Set(msoMasterCache.map(m => m.name));
  for (const name of list) {
    if (!have.has(name)) await db.collection('msos').add({ name });
  }
  showToast('MSO imported');
  await loadMsoMaster();
}

function refreshCustomerMsoDropdown() {
  const sel = document.getElementById('custMSO');
  if (!sel || !msoMasterCache.length) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">- Select MSO -</option>' +
    msoMasterCache.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
  if (cur) sel.value = cur;
}

async function loadCompanyInfo() {
  const doc = await db.collection('settings').doc('company').get();
  if (doc.exists) {
    const d = doc.data();
    if (document.getElementById('coName')) document.getElementById('coName').value = d.name || '';
    if (document.getElementById('coPhone')) document.getElementById('coPhone').value = d.phone || '';
    if (document.getElementById('coAddress')) document.getElementById('coAddress').value = d.address || '';
  }
}

async function saveCompanyInfo() {
  await db.collection('settings').doc('company').set({
    name: document.getElementById('coName').value.trim(),
    phone: document.getElementById('coPhone').value.trim(),
    address: document.getElementById('coAddress').value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  showToast('Company saved');
}
