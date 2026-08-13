// Splash
(function hideSplash() {
  const run = () => {
    const el = document.getElementById('splashScreen');
    if (!el) return;
    setTimeout(() => el.classList.add('hide'), 1400);
    setTimeout(() => { try { el.remove(); } catch(e) {} }, 2000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

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
  try { await loadCompanyInfo(); } catch(e) {}
    try { await loadWaTemplate(); } catch(e) {}
    try { flushOfflineQueue(); } catch(e) {}
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
    reports: 'Collection Report',
    masters: 'Masters',
    settings: 'Settings'
  , expenses: 'Expenses' };
  document.getElementById('pageTitle').textContent = titles[pageId] || pageId;
  if (pageId === 'settings') { refreshMonthBillLockUI(); loadWaTemplate(); }
  if (pageId === 'expenses') { const d=document.getElementById('expDate'); if(d && !d.value) d.value=new Date().toISOString().slice(0,10); loadExpenses(); }
  if (pageId === 'reports') closeReportPanels();

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


function checkBoxDuplicate() {
  const tip = document.getElementById('boxDupTip');
  const boxEl = document.getElementById('custBox');
  if (!tip || !boxEl) return;
  const boxNo = (boxEl.value || '').trim().toUpperCase();
  const editId = (document.getElementById('editCustomerId') || {}).value || '';
  if (!boxNo || boxNo.length < 4) {
    tip.className = 'text-xs mt-1 hidden';
    tip.textContent = '';
    boxEl.classList.remove('border-red-500', 'border-amber-500', 'border-green-500');
    return;
  }
  // same box on another customer?
  const other = allCustomers.find(c =>
    String(c.boxNo || '').trim().toUpperCase() === boxNo && c.id !== editId
  );
  if (other) {
    tip.className = 'text-xs mt-1 text-red-600 font-medium';
    tip.textContent = '⚠ இந்த Box ஏற்கனவே: ' + (other.name || '-') +
      ' (ID: ' + (other.custId || other.id.slice(0,6)) +
      ', ' + (other.street || '') + ', ' + (other.status || 'ACT') + ')';
    boxEl.classList.add('border-red-500');
    boxEl.classList.remove('border-green-500', 'border-amber-500');
    return;
  }
  // in stock?
  const stock = (typeof allBoxes !== 'undefined' ? allBoxes : []).find(
    b => String(b.boxNo || '').trim().toUpperCase() === boxNo
  );
  if (stock && stock.status === 'available') {
    tip.className = 'text-xs mt-1 text-green-600';
    tip.textContent = '✓ Store-ல் available — assign ஆகும்';
    boxEl.classList.add('border-green-500');
    boxEl.classList.remove('border-red-500', 'border-amber-500');
  } else if (stock && stock.status === 'assigned') {
    tip.className = 'text-xs mt-1 text-amber-600';
    tip.textContent = 'Store-ல் assigned என்று இருக்கு — customer match பாருங்கள்';
    boxEl.classList.add('border-amber-500');
    boxEl.classList.remove('border-red-500', 'border-green-500');
  } else {
    tip.className = 'text-xs mt-1 text-slate-500';
    tip.textContent = 'புதிய Box — save ஆனால் stock-ல் Assigned ஆகும்';
    boxEl.classList.remove('border-red-500', 'border-green-500', 'border-amber-500');
  }
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

  // duplicate box warning
  const boxCheck = (data.boxNo || '').trim().toUpperCase();
  if (boxCheck) {
    const other = allCustomers.find(c =>
      String(c.boxNo || '').trim().toUpperCase() === boxCheck && c.id !== editId
    );
    if (other) {
      const ok = confirm(
        'இந்த Box ஏற்கனவே இவருக்கு உள்ளது:\n' +
        (other.name || '') + ' · ID ' + (other.custId || '') + '\n' +
        (other.street || '') + '\n\n' +
        'இருந்தாலும் இந்த customer-க்கு assign செய்யவா?'
      );
      if (!ok) return;
    }
  }

  try {
    let savedId = editId;
    if (editId) {
      await db.collection('customers').doc(editId).update(data);
      showToast('Customer updated!');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const manualId = (document.getElementById('custCustId')?.value || '').trim();
      data.custId = manualId || ('C' + Date.now().toString().slice(-6));
      data.streetId = getStreetId(data.place, data.street);
      const ref = await db.collection('customers').add(data);
      savedId = ref.id;
      showToast('Customer added!');
    }
    // Scheme A: Box No → auto stock as Assigned (if Active)
    const boxNo = (data.boxNo || '').trim();
    if (boxNo && (data.status || 'ACT') === 'ACT') {
      try {
        await upsertBoxStock(boxNo, {
          status: 'assigned',
          customerId: savedId,
          customerName: data.name || '',
          mso: data.mso || '',
          scNo: data.scNo || data.smartCard || '',
          boxType: data.boxType || 'HD',
          source: 'new-line'
        });
      } catch (be) {
        console.error('box stock', be);
      }
    }
    await loadCustomers();
    if (typeof loadBoxes === 'function') {
      try { await loadBoxes(); } catch (e) {}
    }
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
function getPendingFiltered() {
  const area = (document.getElementById('pendFilterArea') || {}).value || '';
  const street = (document.getElementById('pendFilterStreet') || {}).value || '';
  const mso = (document.getElementById('pendFilterMso') || {}).value || '';
  let list = allCustomers.filter(c => Number(c.dueAmt || c.due || 0) > 0);
  if (area) list = list.filter(c => (c.place || '') === area);
  if (street) list = list.filter(c => (c.street || '') === street);
  if (mso) list = list.filter(c => (c.mso || '') === mso);
  list.sort((a, b) => {
    const s = (a.street || '').localeCompare(b.street || '', 'ta');
    if (s) return s;
    return Number(b.dueAmt || b.due || 0) - Number(a.dueAmt || a.due || 0);
  });
  return list;
}

function onPendingFilterChange() {
  const area = (document.getElementById('pendFilterArea') || {}).value || '';
  const streetSel = document.getElementById('pendFilterStreet');
  if (streetSel) {
    const streets = new Set();
    allCustomers.filter(c => Number(c.dueAmt || c.due || 0) > 0)
      .filter(c => !area || (c.place || '') === area)
      .forEach(c => { if (c.street) streets.add(c.street); });
    const cur = streetSel.value;
    streetSel.innerHTML = '<option value="">All Streets</option>' +
      Array.from(streets).sort((a,b) => a.localeCompare(b, 'ta'))
        .map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
    if (cur && streets.has(cur)) streetSel.value = cur;
  }
  const msoSel = document.getElementById('pendFilterMso');
  if (msoSel && msoSel.options.length <= 1) {
    const msos = new Set();
    allCustomers.forEach(c => { if (c.mso) msos.add(c.mso); });
    msoSel.innerHTML = '<option value="">All MSO</option>' +
      Array.from(msos).sort().map(m => `<option value="${m}">${m}</option>`).join('');
  }
  renderPendingReport();
}

function renderPendingReport() {
  // populate MSO options once
  const msoSel = document.getElementById('pendFilterMso');
  if (msoSel && msoSel.options.length <= 1) {
    const msos = new Set();
    allCustomers.forEach(c => { if (c.mso) msos.add(c.mso); });
    const cur = msoSel.value;
    msoSel.innerHTML = '<option value="">All MSO</option>' +
      Array.from(msos).sort().map(m => `<option value="${m}">${m}</option>`).join('');
    if (cur) msoSel.value = cur;
  }
  // street options for current area
  const area = (document.getElementById('pendFilterArea') || {}).value || '';
  const streetSel = document.getElementById('pendFilterStreet');
  if (streetSel) {
    const streets = new Set();
    allCustomers.filter(c => Number(c.dueAmt || c.due || 0) > 0)
      .filter(c => !area || (c.place || '') === area)
      .forEach(c => { if (c.street) streets.add(c.street); });
    const cur = streetSel.value;
    streetSel.innerHTML = '<option value="">All Streets</option>' +
      Array.from(streets).sort((a,b) => a.localeCompare(b, 'ta'))
        .map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
    if (cur && [...streets].includes(cur)) streetSel.value = cur;
  }

  const list = getPendingFiltered();
  const tbody = document.getElementById('pendingTableBody');
  const totalDue = list.reduce((s, c) => s + Number(c.dueAmt || c.due || 0), 0);
  document.getElementById('pendingCount').textContent = list.length;
  document.getElementById('pendingTotal').textContent = '₹' + totalDue.toLocaleString('en-IN');

  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">No pending in this filter</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-3 py-2 font-mono text-xs">${c.custId || c.id.slice(0,6)}</td>
      <td class="px-3 py-2">
        <div class="font-medium text-sm">${c.name || '-'}</div>
        <div class="text-[10px] text-slate-500">${c.street || ''} ${c.place ? '· '+c.place : ''}</div>
      </td>
      <td class="px-3 py-2 text-sm">${c.mobile || '-'}</td>
      <td class="px-3 py-2 font-mono text-xs">${c.boxNo || '-'}</td>
      <td class="px-3 py-2 text-xs">${c.mso || '-'}</td>
      <td class="px-3 py-2 text-sm font-bold text-red-600">₹${Number(c.dueAmt || c.due || 0).toLocaleString('en-IN')}</td>
      <td class="px-3 py-2 whitespace-nowrap">
        <button onclick="openWhatsApp('${c.mobile || ''}', '${(c.name || '').replace(/'/g, '')}', ${Number(c.dueAmt||c.due||0)})" class="text-green-600 hover:underline text-xs mr-2">WA</button>
        <button onclick="viewLedger('${c.id}')" class="text-purple-600 hover:underline text-xs">Ledger</button>
      </td>
    </tr>
  `).join('');
}

function exportPendingBoxes() {
  const list = getPendingFiltered().filter(c => (c.boxNo || '').trim());
  if (!list.length) { showToast('Box numbers இல்லை', true); return; }
  const text = list.map(c => String(c.boxNo).trim()).join(', ');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(list.length + ' Box Nos copied (comma) — MSO paste / OFF');
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
  // also show in prompt for easy copy on some phones
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '0'; ta.style.top = '0';
    ta.style.width = '90%'; ta.style.height = '40%';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    setTimeout(() => { try { document.body.removeChild(ta); } catch(e) {} }, 8000);
  } catch (e) {}
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
  const hint = document.getElementById('billDueHint');
  if (hint) {
    hint.classList.remove('hidden');
    hint.textContent = 'Current Due: ₹' + due.toLocaleString('en-IN') + ' · Partial / Full / Advance எல்லாம் OK';
  }
  updateBillPayHint();
}

function updateBillPayHint() {
  const c = selectedBillCustomer;
  const el = document.getElementById('billPayType');
  if (!el) return;
  if (!c) { el.textContent = ''; return; }
  const due = Number(c.dueAmt || c.due || 0);
  const amt = Number(document.getElementById('billAmount')?.value || 0);
  if (!amt) { el.textContent = ''; return; }
  if (amt < due) el.textContent = 'Partial · Balance ₹' + (due - amt).toLocaleString('en-IN');
  else if (amt === due) el.textContent = 'Full payment · Due clear';
  else el.textContent = 'Advance · Extra ₹' + (amt - due).toLocaleString('en-IN') + ' (credit)';
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

  // Partial / Full / Advance: due decreases by amount (floor 0); overpay stays 0 due
  const c0 = allCustomers.find(x => x.id === customerId);
  const currentDue = c0 ? Number(c0.dueAmt || c0.due || 0) : 0;
  const newDue = Math.max(0, currentDue - amount);
  data.payType = amount < currentDue ? 'partial' : (amount > currentDue ? 'advance' : 'full');
  data.prevDue = currentDue;
  data.balanceAfter = newDue;

  try {
    if (!navigator.onLine) throw new Error('OFFLINE');
    await db.collection('collections').add(data);
    if (c0) {
      await db.collection('customers').doc(customerId).update({
        dueAmt: newDue,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    showToast('Bill ' + billNo + ' · ₹' + amount + (data.payType === 'partial' ? ' (partial)' : ''));
    finishBillSave(data, newDue);
  } catch (err) {
    if (!navigator.onLine || String(err.message).includes('OFFLINE') || err.code === 'unavailable') {
      queueOfflineOp({ type: 'collection', data, customerId, newDue });
      showToast('Offline · saved locally · will sync', false);
      finishBillSave(data, newDue, true);
    } else {
      showToast('Error: ' + err.message, true);
    }
  }
}

function finishBillSave(data, newDue, offline) {
  const printOn = document.getElementById('billPrintReceipt')?.checked;
  if (printOn) showReceipt(data, newDue);
  document.getElementById('billForm').reset();
  document.getElementById('selectedCustomerInfo')?.classList.add('hidden');
  const bd = document.getElementById('billDate');
  if (bd) bd.value = new Date().toISOString().split('T')[0];
  if (document.getElementById('billPrintReceipt')) document.getElementById('billPrintReceipt').checked = true;
  selectedBillCustomer = null;
  // optimistic local update
  const c = allCustomers.find(x => x.id === data.customerId);
  if (c) c.dueAmt = newDue;
  if (!offline) {
    loadCustomers().then(() => { if (typeof loadDashboard === 'function') loadDashboard(); else if (typeof updateDashboardStats === 'function') updateDashboardStats(); });
  } else if (typeof updateDashboardStats === 'function') updateDashboardStats();
}

function showReceipt(data, balanceAfter) {
  const co = companyInfo || {};
  const html = `
    <div style="text-align:center;font-weight:700;font-size:14px">JSV CABLE TV</div>
    <div style="text-align:center;font-size:10px;margin-bottom:6px">${co.address || 'S. Alangulam'}</div>
    <div style="border-top:1px dashed #000;margin:6px 0"></div>
    <div>Bill No: <b>${data.billNo || '-'}</b></div>
    <div>Date: ${data.date || ''}</div>
    <div>Customer: ${data.customerName || ''}</div>
    <div style="border-top:1px dashed #000;margin:6px 0"></div>
    <div style="display:flex;justify-content:space-between"><span>Paid</span><b>₹${Number(data.amount).toLocaleString('en-IN')}</b></div>
    <div style="display:flex;justify-content:space-between"><span>Mode</span><span>${data.mode || ''}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Type</span><span>${data.payType || 'full'}</span></div>
    <div style="display:flex;justify-content:space-between"><span>Balance Due</span><b>₹${Number(balanceAfter||0).toLocaleString('en-IN')}</b></div>
    <div style="border-top:1px dashed #000;margin:6px 0"></div>
    <div style="font-size:10px">GPay: ${co.gpay || '9442527545'}</div>
    <div style="font-size:10px">Office: ${co.phone || ''} ${co.phone2 || ''}</div>
    <div style="text-align:center;margin-top:8px;font-size:10px">நன்றி · by JMR Apps</div>
  `;
  const el = document.getElementById('receiptContent');
  if (el) el.innerHTML = html;
  document.getElementById('receiptModal')?.classList.remove('hidden');
}
function closeReceipt() {
  document.getElementById('receiptModal')?.classList.add('hidden');
}
function printReceiptNow() {
  document.body.classList.add('printing-receipt');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-receipt'), 500);
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
  if (typeof loadBoxes === 'function') {
    try { await loadBoxes(); } catch (e) { console.log(e); }
  }
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
        const totalTodayAmt = Object.values(agents).reduce((s, a) => s + Number(a.amt || 0), 0) || 1;
    const setAgent = (id, cntId, barId, pctId, data) => {
      const el = document.getElementById(id);
      const cnt = document.getElementById(cntId);
      const bar = document.getElementById(barId);
      const pct = document.getElementById(pctId);
      const amt = Number(data.amt || 0);
      const p = Math.round((amt / totalTodayAmt) * 100);
      if (el) el.textContent = '₹' + amt.toLocaleString('en-IN');
      if (cnt) cnt.textContent = (data.cnt || 0) + ' bills';
      if (bar) bar.style.width = p + '%';
      if (pct) pct.textContent = p + '%';
    };
    setAgent('agentUma', 'agentUmaCnt', 'agentUmaBar', 'agentUmaPct', agents.uma);
    setAgent('agentMuthu', 'agentMuthuCnt', 'agentMuthuBar', 'agentMuthuPct', agents.muthumari);
    setAgent('agentOffice', 'agentOfficeCnt', 'agentOfficeBar', 'agentOfficePct', agents.office);
    setAgent('agentOnline', 'agentOnlineCnt', 'agentOnlineBar', 'agentOnlinePct', agents.online);
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
  const active = allCustomers.filter(c => String(c.status || 'ACT').toUpperCase() === 'ACT').length;
  const dc = allCustomers.filter(c => String(c.status || '').toUpperCase() === 'DC').length;
  const totalDue = allCustomers.reduce((s, c) => s + Number(c.dueAmt || c.due || 0), 0);

  // Customers
  const sc = document.getElementById('statCustomers');
  if (sc) sc.textContent = total;
  const split = document.getElementById('statCustSplit');
  if (split) split.textContent = 'A: ' + active + ' · DC: ' + dc;
  const sa = document.getElementById('statActive');
  if (sa) sa.textContent = active;
  const sp = document.getElementById('statPending');
  if (sp) sp.textContent = dc;

  // Boxes: prefer boxes collection; else customers with boxNo = distributed
  let totalBox = 0, assigned = 0, balance = 0;
  if (typeof allBoxes !== 'undefined' && allBoxes.length > 0) {
    totalBox = allBoxes.length;
    assigned = allBoxes.filter(b => b.status === 'assigned').length;
    balance = allBoxes.filter(b => b.status === 'available').length;
  } else {
    // fallback until stock imported
    assigned = allCustomers.filter(c => c.boxNo && String(c.boxNo).trim()).length;
    totalBox = assigned; // unknown stock
    balance = 0;
  }
  const sb = document.getElementById('statBoxes');
  if (sb) sb.textContent = totalBox;
  const sba = document.getElementById('statBoxAssigned');
  if (sba) sba.textContent = assigned;
  const sbb = document.getElementById('statBoxBalance');
  if (sbb) sbb.textContent = balance;

  const pendingN = allCustomers.filter(c => Number(c.dueAmt || c.due || 0) > 0).length;
  const sdc = document.getElementById('statDueCnt');
  if (sdc) sdc.textContent = pendingN.toLocaleString('en-IN');
  const activeN = allCustomers.filter(c => String(c.status || 'ACT').toUpperCase() === 'ACT').length;
  const totalN = allCustomers.length || 1;
  const ap = Math.round((activeN / totalN) * 100);
  const apEl = document.getElementById('statActivePct');
  if (apEl) apEl.textContent = ap + '% active';
  const ab = document.getElementById('statActiveBar');
  if (ab) ab.style.width = ap + '%';
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();
  const ms = document.getElementById('statMonthSub');
  if (ms) ms.textContent = monthNames[now.getMonth()] + ' ' + now.getFullYear();
  const sd = document.getElementById('statDue');
  if (sd) sd.textContent = '₹ ' + totalDue.toLocaleString('en-IN');
  const boxDisplay = document.getElementById('boxCountDisplay');
  if (boxDisplay) boxDisplay.textContent = totalBox;
}

// ==================== WHATSAPP ====================
const TAMIL_MONTHS = ['ஜனவரி','பிப்ரவரி','மார்ச்','ஏப்ரல்','மே','ஜூன்','ஜூலை','ஆகஸ்ட்','செப்டம்பர்','அக்டோபர்','நவம்பர்','டிசம்பர்'];

function getMonthNameTa() {
  return TAMIL_MONTHS[new Date().getMonth()];
}



let waTemplates = null; // { id: { name, text } }
let waDefaultTplId = 'due';
let waActiveTplId = 'due';

const DEFAULT_WA_TEMPLATES = {
  "due": "வணக்கம் {name},\n\nJSV Cable TV - {month} மாதத்திற்கு இன்னும் நீங்கள் பணம் கட்டவில்லை.\nநிலுவை: ₹{due}\n\nதயவுசெய்து உடனே செலுத்தி இணைப்பு துண்டிப்பை தவிர்க்கவும்.\n\nGPay: {gpay} (பணம் மட்டும் — புகார் வேண்டாம்)\nOffice / புகார்: {office}\n\nநன்றி.\nJSV Cable TV · S. Alangulam",
  "diwali": "வணக்கம் {name},\n\n✨ இனிய தீபாவளி நல்வாழ்த்துக்கள்! ✨\n\nJSV Cable TV குடும்பம் உங்களுக்கும் உங்கள் குடும்பத்தினருக்கும் இனிய தீபாவளி வாழ்த்துக்களை தெரிவித்துக் கொள்கிறது.\n\nநன்றி.\nJSV Cable TV · S. Alangulam",
  "christmas": "வணக்கம் {name},\n\n🎄 இனிய கிறிஸ்துமஸ் நல்வாழ்த்துக்கள்! 🎄\n\nJSV Cable TV உங்களுக்கும் குடும்பத்தினருக்கும் மகிழ்ச்சியான கிறிஸ்துமஸ் வாழ்த்துக்களைத் தெரிவிக்கிறது.\n\nநன்றி.\nJSV Cable TV · S. Alangulam",
  "newyear": "வணக்கம் {name},\n\n🎉 இனிய புத்தாண்டு நல்வாழ்த்துக்கள்! 🎉\n\nபுதிய ஆண்டு உங்களுக்கு ஆரோக்கியமும் செழிப்பும் தரட்டும்.\n\nநன்றி.\nJSV Cable TV · S. Alangulam",
  "ramadan": "வணக்கம் {name},\n\n🌙 ரம்ஜான் நல்வாழ்த்துக்கள்! 🌙\n\nஇந்த புனித மாதம் உங்களுக்கு அமைதியும் ஆசியும் தரட்டும்.\n\nநன்றி.\nJSV Cable TV · S. Alangulam",
  "pongal": "வணக்கம் {name},\n\n🌾 இனிய பொங்கல் நல்வாழ்த்துக்கள்! 🌾\n\nJSV Cable TV குடும்பம் உங்களுக்கு இனிய தைப்பொங்கல் வாழ்த்துக்களைத் தெரிவிக்கிறது.\n\nநன்றி.\nJSV Cable TV · S. Alangulam",
};

const DEFAULT_WA_NAMES = {"due": "Due Reminder", "diwali": "தீபாவளி வாழ்த்து", "christmas": "கிறிஸ்துமஸ் வாழ்த்து", "newyear": "புத்தாண்டு வாழ்த்து", "ramadan": "ரம்ஜான் வாழ்த்து", "pongal": "பொங்கல் வாழ்த்து"};

function ensureWaTemplates() {
  if (waTemplates && Object.keys(waTemplates).length) return;
  waTemplates = {};
  Object.keys(DEFAULT_WA_TEMPLATES).forEach(id => {
    waTemplates[id] = { name: DEFAULT_WA_NAMES[id] || id, text: DEFAULT_WA_TEMPLATES[id] };
  });
}

async function loadWaTemplate() {
  ensureWaTemplates();
  try {
    const doc = await db.collection('settings').doc('waTemplates').get();
    if (doc.exists) {
      const d = doc.data();
      if (d.templates && typeof d.templates === 'object') {
        waTemplates = { ...waTemplates, ...d.templates };
      }
      if (d.defaultId) waDefaultTplId = d.defaultId;
      // migrate old single template
    } else {
      const old = await db.collection('settings').doc('waTemplate').get();
      if (old.exists && old.data().text) {
        waTemplates.due = { name: 'Due Reminder', text: old.data().text };
      }
    }
  } catch (e) {}
  waActiveTplId = waDefaultTplId;
  fillWaTplSelects();
  onWaTplSelect();
}

function fillWaTplSelects() {
  ensureWaTemplates();
  const opts = Object.keys(waTemplates).map(id => {
    const n = waTemplates[id].name || id;
    return `<option value="${id}">${n}</option>`;
  }).join('');
  ['waTplSelect', 'waDefaultTpl', 'waQueueTpl'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = opts;
    if (id === 'waDefaultTpl') el.value = waDefaultTplId;
    else if (id === 'waTplSelect') el.value = waActiveTplId;
    else if (cur && waTemplates[cur]) el.value = cur;
    else el.value = waDefaultTplId;
  });
}

function onWaTplSelect() {
  const id = document.getElementById('waTplSelect')?.value || 'due';
  waActiveTplId = id;
  ensureWaTemplates();
  const t = waTemplates[id] || { name: id, text: '' };
  const nameEl = document.getElementById('waTplName');
  const ta = document.getElementById('waTemplate');
  if (nameEl) nameEl.value = t.name || '';
  if (ta) ta.value = t.text || '';
}

async function persistWaTemplates() {
  await db.collection('settings').doc('waTemplates').set({
    templates: waTemplates,
    defaultId: waDefaultTplId,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function saveWaTemplate() {
  ensureWaTemplates();
  const id = document.getElementById('waTplSelect')?.value || waActiveTplId || 'due';
  const name = (document.getElementById('waTplName')?.value || '').trim() || id;
  const text = (document.getElementById('waTemplate')?.value || '').trim();
  if (!text) { showToast('Template empty', true); return; }
  waTemplates[id] = { name, text };
  await persistWaTemplates();
  fillWaTplSelects();
  document.getElementById('waTplSelect').value = id;
  const st = document.getElementById('waTemplateStatus');
  if (st) st.textContent = '✓ Saved: ' + name;
  showToast('Template saved');
}

async function addWaTemplate() {
  const name = prompt('புதிய template பெயர் (எ.கா. Deepavali offer)');
  if (!name) return;
  const id = 'custom_' + Date.now().toString(36);
  ensureWaTemplates();
  waTemplates[id] = { name, text: 'வணக்கம் {name},\n\n' + name + '\n\nநன்றி.\nJSV Cable TV' };
  await persistWaTemplates();
  fillWaTplSelects();
  document.getElementById('waTplSelect').value = id;
  onWaTplSelect();
  showToast('New template added');
}

async function deleteWaTemplate() {
  const id = document.getElementById('waTplSelect')?.value;
  if (!id) return;
  if (id === 'due') { showToast('Due template delete செய்ய முடியாது', true); return; }
  if (!confirm('இந்த template நீக்கவா?')) return;
  delete waTemplates[id];
  if (waDefaultTplId === id) waDefaultTplId = 'due';
  await persistWaTemplates();
  fillWaTplSelects();
  onWaTplSelect();
  showToast('Deleted');
}

async function saveWaDefaultTpl() {
  waDefaultTplId = document.getElementById('waDefaultTpl')?.value || 'due';
  await persistWaTemplates();
  showToast('Default send template set');
}

async function resetWaTemplate() {
  ensureWaTemplates();
  Object.keys(DEFAULT_WA_TEMPLATES).forEach(id => {
    waTemplates[id] = { name: DEFAULT_WA_NAMES[id], text: DEFAULT_WA_TEMPLATES[id] };
  });
  await persistWaTemplates();
  fillWaTplSelects();
  onWaTplSelect();
  showToast('Festival templates restored');
}

function getWaTemplateText(tplId) {
  ensureWaTemplates();
  const id = tplId || waDefaultTplId || 'due';
  return (waTemplates[id] && waTemplates[id].text) || DEFAULT_WA_TEMPLATES.due;
}

function buildDueMessage(name, due, tplId) {
  const month = getMonthNameTa();
  const dueStr = Number(due || 0).toLocaleString('en-IN');
  const co = companyInfo || {};
  const office = [co.phone, co.phone2].filter(Boolean).join(' / ') || '0452-2527545 / 8678953333';
  const gpay = co.gpay || '9442527545';
  let tpl = getWaTemplateText(tplId);
  return tpl
    .replace(/\{name\}/g, name || 'Customer')
    .replace(/\{month\}/g, month)
    .replace(/\{due\}/g, dueStr)
    .replace(/\{gpay\}/g, gpay)
    .replace(/\{office\}/g, office);
}

function openWhatsApp(mobile, name, due, tplId) {
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
  const useTpl = tplId || document.getElementById('waQueueTpl')?.value || waDefaultTplId || 'due';
  const text = encodeURIComponent(buildDueMessage(name || 'Customer', due, useTpl));
  window.open(`https://wa.me/${num}?text=${text}`, '_blank');
}


// WhatsApp queue for pending
let waQueue = [];
let waQueueIndex = 0;

function startWaQueue() {
  waQueue = (typeof getPendingFiltered === "function" ? getPendingFiltered() : allCustomers.filter(c => Number(c.dueAmt || c.due || 0) > 0))
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
  openWhatsApp(c.mobile, c.name, due, document.getElementById('waQueueTpl')?.value);
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
  const btn = document.getElementById('genDueBtn');
  const status = document.getElementById('genDueStatus');
  const hint = document.getElementById('genDueHint');
  const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
  const monthLabel = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  try {
    const lockRef = db.collection('settings').doc('monthBill');
    const lockSnap = await lockRef.get();
    const last = lockSnap.exists ? (lockSnap.data().lastGeneratedYM || '') : '';
    if (last === ym) {
      const when = lockSnap.data().generatedAt || '';
      showToast('இந்த மாதம் ஏற்கனவே generate ஆனது (' + monthLabel + ')', true);
      if (status) status.textContent = '✅ Already done for ' + monthLabel + (when ? ' · ' + when : '');
      if (btn) { btn.disabled = true; btn.textContent = 'Already Generated · ' + monthLabel; btn.classList.add('opacity-60'); }
      if (hint) hint.innerHTML = 'அடுத்த மாசம் 1ம் தேதிக்குப் பிறகு மீண்டும் press செய்யலாம்.';
      return;
    }

    if (!confirm('Next Month Bill generate?\n\n' + monthLabel + '\nActive customers-க்கு Package Amount Due-ல் சேரும்.\nமாதத்திற்கு ஒரு முறை மட்டும்.\n\nதொடரவா?')) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
    if (status) { status.classList.remove('hidden'); status.textContent = 'Loading customers...'; }

    // Fresh read
    const snap = await db.collection('customers').get();
    const updates = [];
    snap.forEach(doc => {
      const d = doc.data();
      if ((d.status || 'ACT') !== 'ACT') return;
      const pkg = Number(d.packageAmt || d.package || 0);
      if (!pkg || pkg <= 0) return;
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
      if (btn) { btn.disabled = false; btn.textContent = 'Generate Next Month Bill'; }
      return;
    }

    if (status) status.textContent = updates.length + ' customers update ஆகிறது...';

    const BATCH_SIZE = 400;
    let done = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = db.batch();
      updates.slice(i, i + BATCH_SIZE).forEach(u => {
        batch.update(db.collection('customers').doc(u.id), {
          dueAmt: u.newDue,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      done += updates.slice(i, i + BATCH_SIZE).length;
      if (status) status.textContent = done + ' / ' + updates.length + ' done...';
    }

    // Lock this month
    const nowStr = new Date().toLocaleString('en-IN');
    await lockRef.set({
      lastGeneratedYM: ym,
      generatedAt: nowStr,
      count: updates.length,
      generatedBy: (currentUser && currentUser.email) || ''
    }, { merge: true });

    await loadCustomers();
    showToast('Next Month Bill · ' + updates.length + ' customers');
    if (status) status.textContent = '✅ ' + updates.length + ' customers · Locked for ' + monthLabel;
    if (btn) { btn.disabled = true; btn.textContent = 'Already Generated · ' + monthLabel; btn.classList.add('opacity-60'); }
    if (hint) hint.innerHTML = 'அடுத்த மாசம் வரை மீண்டும் generate செய்ய முடியாது.';
  } catch (err) {
    console.error(err);
    showToast('Error: ' + err.message, true);
    if (status) status.textContent = 'Error: ' + err.message;
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Next Month Bill'; }
  }
}

async function refreshMonthBillLockUI() {
  const btn = document.getElementById('genDueBtn');
  const status = document.getElementById('genDueStatus');
  const hint = document.getElementById('genDueHint');
  if (!btn) return;
  try {
    const ym = new Date().toISOString().slice(0, 7);
    const monthLabel = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const snap = await db.collection('settings').doc('monthBill').get();
    if (snap.exists && snap.data().lastGeneratedYM === ym) {
      btn.disabled = true;
      btn.textContent = 'Already Generated · ' + monthLabel;
      btn.classList.add('opacity-60');
      if (status) status.textContent = '✅ Done for ' + monthLabel + (snap.data().generatedAt ? ' · ' + snap.data().generatedAt : '');
      if (hint) hint.innerHTML = 'அடுத்த மாசம் வரை மீண்டும் generate செய்ய முடியாது.';
    }
  } catch (e) {}
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
  let avail = 0, assigned = 0, total = 0;
  if (allBoxes.length > 0) {
    avail = allBoxes.filter(b => b.status === 'available').length;
    assigned = allBoxes.filter(b => b.status === 'assigned').length;
    total = allBoxes.length;
  } else {
    // boxes not synced yet — show from customer list
    assigned = allCustomers.filter(c => c.boxNo && String(c.boxNo).trim()).length;
    avail = 0;
    total = assigned;
  }
  const el1 = document.getElementById('boxStockCount');
  const el2 = document.getElementById('boxAssignedCount');
  const el3 = document.getElementById('boxCountDisplay');
  if (el1) el1.textContent = avail;
  if (el2) el2.textContent = assigned;
  if (el3) el3.textContent = total;
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
  if (!confirm('Customer list-ல் box numbers-ஐ stock-ல் sync செய்யவா?\nWith Customers count update ஆகும்.')) return;
  try {
    showToast('Syncing... wait');
    // map existing boxNo -> docId
    const existing = new Map();
    allBoxes.forEach(b => { if (b.boxNo) existing.set(String(b.boxNo).trim().toUpperCase(), b.id); });
    let n = 0;
    const list = allCustomers.filter(c => (c.boxNo || '').trim());
    for (let i = 0; i < list.length; i += 400) {
      const chunk = list.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(c => {
        const boxNo = String(c.boxNo).trim();
        const key = boxNo.toUpperCase();
        const st = (c.status || 'ACT') === 'ACT' ? 'assigned' : 'available';
        const data = {
          boxNo,
          status: st,
          customerId: st === 'assigned' ? c.id : null,
          customerName: st === 'assigned' ? (c.name || '') : null,
          mso: c.mso || '',
          scNo: c.scNo || c.smartCard || '',
          boxType: c.boxType || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (existing.has(key)) {
          batch.update(db.collection('boxes').doc(existing.get(key)), data);
        } else {
          const ref = db.collection('boxes').doc();
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          data.source = 'customer-sync';
          batch.set(ref, data);
          existing.set(key, ref.id);
        }
        n++;
      });
      await batch.commit();
    }
    showToast('Synced ' + n + ' boxes → With Customers');
    await loadBoxes();
    updateDashboardStats();
  } catch (e) {
    showToast('Sync error: ' + e.message, true);
  }
}

async function importMsoBoxList() {
  const mso = (document.getElementById('importBoxMso') || {}).value || '';
  const boxType = (document.getElementById('importBoxType') || {}).value || 'HD';
  const text = (document.getElementById('importBoxText') || {}).value || '';
  const statusEl = document.getElementById('importBoxStatus');
  if (!mso) { showToast('MSO select பண்ணுங்கள்', true); return; }
  if (!text.trim()) { showToast('Box list paste பண்ணுங்கள்', true); return; }

  // parse lines: boxNo OR boxNo,scNo OR tab-separated
  const rows = [];
  text.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line) return;
    // skip headers
    if (/^(box|stb|serial|s\.?no|sc\s*no|smart)/i.test(line)) return;
    let boxNo = '', scNo = '';
    if (line.includes('\t')) {
      const p = line.split('\t').map(x => x.trim()).filter(Boolean);
      boxNo = p[0] || '';
      scNo = p[1] || '';
    } else if (line.includes(',')) {
      const p = line.split(',').map(x => x.trim()).filter(Boolean);
      boxNo = p[0] || '';
      scNo = p[1] || '';
    } else {
      // spaces: last token might be sc - prefer single token as box
      const p = line.split(/\s+/).filter(Boolean);
      boxNo = p[0] || '';
      if (p.length >= 2) scNo = p[p.length - 1];
    }
    boxNo = boxNo.replace(/[^a-zA-Z0-9]/g, '');
    if (boxNo.length >= 4) rows.push({ boxNo, scNo });
  });

  if (!rows.length) { showToast('Valid box numbers கிடைக்கவில்லை', true); return; }

  // customer map by boxNo
  const custByBox = new Map();
  allCustomers.forEach(c => {
    const b = String(c.boxNo || '').trim().toUpperCase();
    if (b) custByBox.set(b, c);
  });

  await loadBoxes();
  const existing = new Map();
  allBoxes.forEach(b => {
    if (b.boxNo) existing.set(String(b.boxNo).trim().toUpperCase(), b.id);
  });

  let assigned = 0, stock = 0, updated = 0;
  if (statusEl) statusEl.textContent = 'Importing ' + rows.length + ' boxes...';

  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach(({ boxNo, scNo }) => {
      const key = boxNo.toUpperCase();
      const cust = custByBox.get(key);
      const isAssigned = !!cust && (cust.status || 'ACT') === 'ACT';
      const data = {
        boxNo,
        mso,
        boxType,
        scNo: scNo || (cust && (cust.scNo || cust.smartCard)) || '',
        status: isAssigned ? 'assigned' : 'available',
        customerId: isAssigned ? cust.id : null,
        customerName: isAssigned ? (cust.name || '') : null,
        source: 'mso-import',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (isAssigned) assigned++; else stock++;
      if (existing.has(key)) {
        batch.update(db.collection('boxes').doc(existing.get(key)), data);
        updated++;
      } else {
        const ref = db.collection('boxes').doc();
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        batch.set(ref, data);
        existing.set(key, ref.id);
      }
    });
    await batch.commit();
  }

  const msg = 'Import OK · Match(Customers): ' + assigned + ' · Store: ' + stock + ' · Total lines: ' + rows.length;
  showToast(msg);
  if (statusEl) statusEl.textContent = msg;
  document.getElementById('importBoxText').value = '';
  await loadBoxes();
  updateDashboardStats();
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

function openMastersPanel(panel) {
  showPage('masters');
  setTimeout(function() {
    if (typeof showMasterPanel === 'function') showMasterPanel(panel);
  }, 50);
  try { if (window.innerWidth < 1024) toggleSidebar(); } catch(e) {}
}

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

  if (key === 'employee') loadEmployees();
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

let companyInfo = {
  name: 'JSV Cable TV',
  address: 'S. Alangulam',
  phone: '0452-2527545',
  phone2: '8678953333',
  gpay: '9442527545'
};


function setCompanyEditMode(on) {
  document.querySelectorAll('.co-field').forEach(el => {
    el.readOnly = !on;
    el.classList.toggle('bg-slate-50', !on);
    el.classList.toggle('bg-white', on);
  });
  const edit = document.getElementById('coEditBtn');
  const save = document.getElementById('coSaveBtn');
  const cancel = document.getElementById('coCancelBtn');
  if (edit) edit.classList.toggle('hidden', on);
  if (save) save.classList.toggle('hidden', !on);
  if (cancel) cancel.classList.toggle('hidden', !on);
  if (!on) loadCompanyInfo(); // reload values on cancel
}

async function loadCompanyInfo() {
  try {
    const doc = await db.collection('settings').doc('company').get();
    if (doc.exists) {
      const d = doc.data();
      companyInfo = {
        name: d.name || companyInfo.name,
        address: d.address || companyInfo.address,
        phone: d.phone || companyInfo.phone,
        phone2: d.phone2 || companyInfo.phone2,
        gpay: d.gpay || companyInfo.gpay
      };
    }
  } catch (e) {}
  if (document.getElementById('coName')) document.getElementById('coName').value = companyInfo.name || '';
  if (document.getElementById('coPhone')) document.getElementById('coPhone').value = companyInfo.phone || '';
  if (document.getElementById('coPhone2')) document.getElementById('coPhone2').value = companyInfo.phone2 || '';
  if (document.getElementById('coGpay')) document.getElementById('coGpay').value = companyInfo.gpay || '';
  if (document.getElementById('coAddress')) document.getElementById('coAddress').value = companyInfo.address || '';
  // stay view-only unless editing
  const saveBtn = document.getElementById('coSaveBtn');
  if (!saveBtn || saveBtn.classList.contains('hidden')) {
    document.querySelectorAll('.co-field').forEach(el => {
      el.readOnly = true;
      el.classList.add('bg-slate-50');
      el.classList.remove('bg-white');
    });
    const edit = document.getElementById('coEditBtn');
    const cancel = document.getElementById('coCancelBtn');
    if (edit) edit.classList.remove('hidden');
    if (saveBtn) saveBtn.classList.add('hidden');
    if (cancel) cancel.classList.add('hidden');
  }
}

async function saveCompanyInfo() {
  companyInfo = {
    name: document.getElementById('coName').value.trim() || 'JSV Cable TV',
    phone: document.getElementById('coPhone').value.trim(),
    phone2: (document.getElementById('coPhone2') || {}).value || '',
    gpay: (document.getElementById('coGpay') || {}).value || '',
    address: document.getElementById('coAddress').value.trim()
  };
  companyInfo.phone2 = String(companyInfo.phone2).trim();
  companyInfo.gpay = String(companyInfo.gpay).trim();
  await db.collection('settings').doc('company').set({
    ...companyInfo,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  showToast('Company saved ✓');
  const msg = document.getElementById('coSavedMsg');
  if (msg) {
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2500);
  }
  setCompanyEditMode(false);
}

async function importAugustCollections() {
  if (!confirm('ஆகஸ்ட் Collection list import?\n\n• ஏற்கனவே உள்ள bill (same BillNo+Date+Customer) SKIP\n• புதியவை ADD\n• Pay செய்த customers Due = 0')) return;
  try {
    showToast('Loading file...');
    const res = await fetch('collections_aug2026.json?t=' + Date.now());
    if (!res.ok) throw new Error('collections_aug2026.json not found in site — upload that file to GitHub too');
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) throw new Error('Empty list');

    // map custId -> customer doc
    const byCustId = new Map();
    allCustomers.forEach(c => {
      const id = String(c.custId || '').trim().toUpperCase();
      if (id) byCustId.set(id, c);
    });

    // existing collections key: custDocId|billNo|date
    showToast('Checking existing bills...');
    const existingKeys = new Set();
    const colSnap = await db.collection('collections').get();
    colSnap.forEach(doc => {
      const d = doc.data();
      const k = (d.customerId || '') + '|' + String(d.billNo || '') + '|' + (d.date || d.billDate || '');
      existingKeys.add(k);
      // also by imported custId
      if (d.importCustId) {
        existingKeys.add(String(d.importCustId).toUpperCase() + '|' + String(d.billNo || '') + '|' + (d.date || ''));
      }
    });

    let added = 0, skipped = 0, noMatch = 0;
    const paidCustDocIds = new Set();

    for (let i = 0; i < list.length; i += 400) {
      const chunk = list.slice(i, i + 400);
      const batch = db.batch();
      let batchOps = 0;
      for (const r of chunk) {
        const cid = String(r.custId || '').trim().toUpperCase();
        const cust = byCustId.get(cid);
        const date = r.colDate || r.billDate || '';
        const billNo = String(r.billNo || '');
        const skipKey1 = cid + '|' + billNo + '|' + date;
        const skipKey2 = cust ? (cust.id + '|' + billNo + '|' + date) : '';
        if (existingKeys.has(skipKey1) || (skipKey2 && existingKeys.has(skipKey2))) {
          skipped++;
          if (cust) paidCustDocIds.add(cust.id);
          continue;
        }
        if (!cust) { noMatch++; continue; }

        const ref = db.collection('collections').doc();
        const agent = (r.collected || r.employee || '').toUpperCase();
        batch.set(ref, {
          customerId: cust.id,
          customerName: cust.name || r.name || '',
          amount: Number(r.amount) || 0,
          date: date,
          billDate: r.billDate || date,
          billNo: billNo,
          mode: /GPAY|UPI|ONLINE/i.test(agent) ? 'UPI' : (/LOCAL|OFFICE|BANK/i.test(agent) ? 'Cash' : 'Cash'),
          remarks: 'Import Aug2026',
          status: 'active',
          importCustId: cid,
          collectedBy: r.collected || r.employee || '',
          employee: r.employee || '',
          createdBy: (r.collected || r.employee || 'import') + '@import',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        existingKeys.add(skipKey1);
        existingKeys.add(cust.id + '|' + billNo + '|' + date);
        paidCustDocIds.add(cust.id);
        added++;
        batchOps++;
      }
      if (batchOps > 0) await batch.commit();
    }

    // set due = 0 for paid customers this month
    showToast('Updating dues...');
    const paidArr = Array.from(paidCustDocIds);
    for (let i = 0; i < paidArr.length; i += 400) {
      const batch = db.batch();
      paidArr.slice(i, i + 400).forEach(id => {
        batch.update(db.collection('customers').doc(id), {
          dueAmt: 0,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }

    showToast('Import done · Added: ' + added + ' · Skipped: ' + skipped + ' · No customer: ' + noMatch + ' · Due cleared: ' + paidArr.length);
    await loadCustomers();
    loadDashboard();
  } catch (e) {
    console.error(e);
    showToast('Import error: ' + e.message, true);
  }
}

function globalCustomerSearch(openFirst) {
  const inp = document.getElementById('globalSearch');
  const box = document.getElementById('globalSearchResults');
  if (!inp || !box) return;
  const q = (inp.value || '').toLowerCase().trim();
  if (q.length < 2) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const matches = allCustomers.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.mobile || '').includes(q) ||
    (c.boxNo || '').toLowerCase().includes(q) ||
    (c.custId || '').toLowerCase().includes(q) ||
    (c.street || '').toLowerCase().includes(q)
  ).slice(0, 15);
  if (!matches.length) {
    box.innerHTML = '<div class="p-3 text-sm text-slate-400">No match</div>';
    box.classList.remove('hidden');
    return;
  }
  if (openFirst && matches.length === 1) {
    box.classList.add('hidden');
    viewLedger(matches[0].id);
    return;
  }
  box.innerHTML = matches.map(c => `
    <div class="p-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700 text-sm" onclick="globalPickCustomer('${c.id}')">
      <div class="font-medium text-white">${c.name || '-'}</div>
      <div class="text-xs text-slate-400">${c.custId || ''} · ${c.mobile || '-'} · Box ${c.boxNo || '-'} · Due ₹${Number(c.dueAmt||c.due||0)} · ${c.street || ''}</div>
    </div>`).join('');
  box.classList.remove('hidden');
}
function globalPickCustomer(id) {
  const box = document.getElementById('globalSearchResults');
  if (box) box.classList.add('hidden');
  const inp = document.getElementById('globalSearch');
  if (inp) inp.value = '';
  viewLedger(id);
}
document.addEventListener('click', (e) => {
  const box = document.getElementById('globalSearchResults');
  const inp = document.getElementById('globalSearch');
  if (!box || !inp) return;
  if (!box.contains(e.target) && e.target !== inp) box.classList.add('hidden');
});

async function importDcList() {
  if (!confirm('DC full import?\n• இருந்தால் update\n• இல்லையென்றால் ADD (name, mobile, box, street, area, SC, date)')) return;
  try {
    showToast('Loading DC...');
    const res = await fetch('dc_list.json?t=' + Date.now());
    if (!res.ok) throw new Error('dc_list.json missing');
    const list = await res.json();
    await loadCustomers();
    const byId = new Map(), byBox = new Map();
    allCustomers.forEach(c => {
      const id = String(c.custId || '').trim().toUpperCase();
      if (id) byId.set(id, c);
      const b = String(c.boxNo || '').trim().toUpperCase();
      if (b) byBox.set(b, c);
    });
    let updated = 0, added = 0;
    for (let i = 0; i < list.length; i += 200) {
      const batch = db.batch();
      for (const r of list.slice(i, i + 200)) {
        const cid = String(r.custId || '').trim();
        const box = String(r.box || '').trim();
        let cust = byId.get(cid.toUpperCase()) || (box ? byBox.get(box.toUpperCase()) : null);
        const bal = Number(r.balance || 0);
        const mobile = r.mobile || '';
        if (cust) {
          const up = { status: 'DC', dcDate: r.dcDate || '', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
          if (bal > 0) up.dueAmt = bal;
          if (mobile && !cust.mobile) up.mobile = mobile;
          if (box && !cust.boxNo) up.boxNo = box;
          if (r.sc && !cust.scNo) { up.scNo = r.sc; up.smartCard = r.sc; }
          if (r.place) up.place = r.place;
          if (r.street) up.street = r.street;
          if (r.reason) up.dcReason = r.reason;
          if (r.signal) up.signal = r.signal;
          batch.update(db.collection('customers').doc(cust.id), up);
          updated++;
        } else {
          const ref = db.collection('customers').doc();
          batch.set(ref, {
            custId: cid, name: r.name || '', mobile: mobile, doorNo: r.doorNo || '',
            place: r.place || '', street: r.street || '', boxNo: box, scNo: r.sc || '', smartCard: r.sc || '',
            status: 'DC', dcDate: r.dcDate || '', dcReason: r.reason || '', dueAmt: bal,
            packageAmt: 0, package: '', mso: '', signal: r.signal || 'Digital', billing: 'No',
            remarks: 'DC import', source: 'dc-import',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          added++;
          if (cid) byId.set(cid.toUpperCase(), { id: ref.id });
          if (box) byBox.set(box.toUpperCase(), { id: ref.id });
        }
      }
      await batch.commit();
    }
    await loadCustomers();
    updateDashboardStats();
    showToast('DC Updated: ' + updated + ' · Added: ' + added);
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}

// ==================== EMPLOYEES (Area Allotment) ====================
let allEmployees = [];

async function loadEmployees() {
  const el = document.getElementById('empList');
  if (el) el.innerHTML = '<div class="p-3 text-slate-400 text-center text-sm">Loading...</div>';
  const defaults = [
    { name: 'Muthumari', email: 'muthumari@jsvcable.com', area: 'AREA 1', role: 'collector' },
    { name: 'Uma', email: 'uma@jsvcable.com', area: 'AREA 2', role: 'collector' },
    { name: 'Office', email: 'office@jsvcable.com', area: 'ALL', role: 'office' },
    { name: 'Online', email: 'online@jsvcable.com', area: 'ALL', role: 'online' }
  ];
  try {
    const snap = await db.collection('employees').get();
    allEmployees = [];
    snap.forEach(doc => allEmployees.push({ id: doc.id, ...doc.data() }));
    allEmployees.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (allEmployees.length === 0) {
      // seed once — no recursive hang
      for (const d of defaults) {
        try {
          await db.collection('employees').add({
            ...d,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (se) {
          console.warn('seed employee failed', se);
        }
      }
      try {
        const snap2 = await db.collection('employees').get();
        allEmployees = [];
        snap2.forEach(doc => allEmployees.push({ id: doc.id, ...doc.data() }));
      } catch (e2) {}
      // if still empty (permission), show local defaults for display only
      if (!allEmployees.length) {
        allEmployees = defaults.map((d, i) => ({ id: 'local_' + i, ...d, _local: true }));
        if (el) {
          renderEmployeeList();
          el.insertAdjacentHTML('afterbegin',
            '<div class="p-2 text-xs text-amber-700 bg-amber-50 border-b">Firestore employees write fail — local list. Firebase Rules-ல் employees allow check பண்ணுங்கள்.</div>');
          return;
        }
      }
    }
    renderEmployeeList();
  } catch (e) {
    console.error(e);
    // permission / network — still show usable list
    allEmployees = defaults.map((d, i) => ({ id: 'local_' + i, ...d, _local: true }));
    if (el) {
      el.innerHTML = '<div class="p-2 text-xs text-red-600 bg-red-50 border-b">Error: ' + (e.message || e) +
        '<br>Firebase Console → Firestore → Rules: employees read/write allow authenticated.</div>';
      renderEmployeeList();
    }
  }
}

function renderEmployeeList() {
  const el = document.getElementById('empList');
  if (!el) return;
  if (!allEmployees.length) {
    el.innerHTML = '<div class="p-3 text-slate-400 text-center">No employees</div>';
    return;
  }
  el.innerHTML = allEmployees.map(e => `
    <div class="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 gap-2">
      <div class="min-w-0">
        <div class="font-medium truncate">${e.name || '-'}</div>
        <div class="text-[10px] text-slate-500 truncate">${e.email || ''} · ${e.role || 'collector'}</div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${e.area === 'AREA 1' ? 'bg-blue-100 text-blue-700' : e.area === 'AREA 2' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">${e.area || '-'}</span>
        <button type="button" onclick="editEmployee('${e.id}')" class="text-blue-600 text-xs">Edit</button>
        <button type="button" onclick="deleteEmployee('${e.id}')" class="text-red-600 text-xs">Del</button>
      </div>
    </div>
  `).join('');
}

function clearEmpForm() {
  document.getElementById('editEmpId').value = '';
  document.getElementById('empName').value = '';
  document.getElementById('empEmail').value = '';
  document.getElementById('empArea').value = 'AREA 1';
  document.getElementById('empRole').value = 'collector';
}

function editEmployee(id) {
  const e = allEmployees.find(x => x.id === id);
  if (!e) return;
  document.getElementById('editEmpId').value = id;
  document.getElementById('empName').value = e.name || '';
  document.getElementById('empEmail').value = e.email || '';
  document.getElementById('empArea').value = e.area || 'AREA 1';
  document.getElementById('empRole').value = e.role || 'collector';
}

async function saveEmployee() {
  const id = document.getElementById('editEmpId').value;
  const name = (document.getElementById('empName').value || '').trim();
  const email = (document.getElementById('empEmail').value || '').trim().toLowerCase();
  const area = document.getElementById('empArea').value;
  const role = document.getElementById('empRole').value;
  if (!name || !email) { showToast('Name + Email required', true); return; }
  try {
    const data = { name, email, area, role, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (id) {
      await db.collection('employees').doc(id).update(data);
      showToast('Employee updated');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('employees').add(data);
      showToast('Employee added');
    }
    clearEmpForm();
    await loadEmployees();
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}

async function deleteEmployee(id) {
  if (String(id).startsWith('local_')) { showToast('Local only — Firestore-ல் save முதலில்', true); return; }
  if (!confirm('Delete this employee mapping?')) return;
  try {
    await db.collection('employees').doc(id).delete();
    showToast('Deleted');
    await loadEmployees();
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}

// ==================== COLLECTION REPORT (Street-wise Print) ====================
function getCollectionReportData(area) {
  const list = allCustomers.filter(c => {
    if (Number(c.dueAmt || c.due || 0) <= 0) return false;
    if ((c.status || 'ACT').toUpperCase() === 'DC') return false; // optional: skip DC
    if (area && (c.place || '') !== area) return false;
    return true;
  });
  // group by street
  const map = new Map();
  list.forEach(c => {
    const st = (c.street || '— No Street —').trim();
    if (!map.has(st)) map.set(st, []);
    map.get(st).push(c);
  });
  // sort streets Tamil-friendly, customers by custId
  const streets = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'ta'));
  streets.forEach(st => {
    map.get(st).sort((a, b) => String(a.custId || '').localeCompare(String(b.custId || ''), 'en', { numeric: true }));
  });
  return { streets, map, list };
}

function renderCollectionReport() {
  const area = (document.getElementById('colRepArea') || {}).value || 'AREA 1';
  const box = document.getElementById('colRepPrint');
  const sum = document.getElementById('colRepSummary');
  if (!box) return;
  const { streets, map, list } = getCollectionReportData(area);
  const totalDue = list.reduce((s, c) => s + Number(c.dueAmt || c.due || 0), 0);
  if (sum) {
    sum.textContent = area + ' · ' + list.length + ' customers · ' + streets.length + ' streets · Total ₹' + totalDue.toLocaleString('en-IN');
  }
  const month = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  if (!list.length) {
    box.innerHTML = '<div class="text-center text-slate-400 text-sm py-8">No pending in ' + area + '</div>';
    return;
  }
  let html = `
    <div class="col-rep-head">
      <h2>JSV CABLE TV — Collection Report</h2>
      <p>${area} · ${month} · Pending Due · ${list.length} customers</p>
      <p>Total Due: ₹${totalDue.toLocaleString('en-IN')}</p>
    </div>`;
  streets.forEach(st => {
    const rows = map.get(st);
    const stTotal = rows.reduce((s, c) => s + Number(c.dueAmt || c.due || 0), 0);
    html += `<div class="col-street">
      <h4>${st} <span style="float:right;font-weight:600">₹${stTotal.toLocaleString('en-IN')} · ${rows.length}</span></h4>
      <table>
        <thead><tr><th style="width:22%">ID</th><th>Name</th><th style="width:18%;text-align:right">Amount</th></tr></thead>
        <tbody>`;
    rows.forEach(c => {
      const amt = Number(c.dueAmt || c.due || 0);
      html += `<tr>
        <td>${c.custId || '-'}</td>
        <td>${c.name || '-'}</td>
        <td class="amt">₹${amt.toLocaleString('en-IN')}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  });
  html += `<div style="margin-top:12px;font-size:10px;text-align:center;color:#64748b">JSV Cable TV · S. Alangulam · ${area}<br>by JMR Apps</div>`;
  box.innerHTML = html;
}

function printCollectionReport() {
  renderCollectionReport();
  setTimeout(() => window.print(), 200);
}

// ==================== FULL MONTHLY BACKUP ====================
function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

function toCSV(rows, headers) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
  return '\uFEFF' + lines.join('\n'); // BOM for Excel Tamil
}

async function runFullBackup() {
  const btn = document.getElementById('backupBtn');
  const st = document.getElementById('backupStatus');
  if (btn) { btn.disabled = true; btn.textContent = 'Backing up...'; }
  if (st) st.textContent = 'Loading data from Firebase...';

  try {
    // Ensure fresh data
    await loadCustomers();
    let boxes = [];
    try {
      const bs = await db.collection('boxes').get();
      bs.forEach(d => boxes.push({ id: d.id, ...d.data() }));
    } catch (e) {}
    let collections = [];
    try {
      const cs = await db.collection('collections').get();
      cs.forEach(d => collections.push({ id: d.id, ...d.data() }));
    } catch (e) {}
    let streets = [];
    try {
      const ss = await db.collection('streets').get();
      ss.forEach(d => streets.push({ id: d.id, ...d.data() }));
    } catch (e) {}
    let employees = [];
    try {
      const es = await db.collection('employees').get();
      es.forEach(d => employees.push({ id: d.id, ...d.data() }));
    } catch (e) {}
    let company = {};
    try {
      const cd = await db.collection('settings').doc('company').get();
      if (cd.exists) company = cd.data();
    } catch (e) {}
    let monthBill = {};
    try {
      const md = await db.collection('settings').doc('monthBill').get();
      if (md.exists) monthBill = md.data();
    } catch (e) {}

    const stamp = new Date().toISOString().slice(0, 10);
    const ym = new Date().toISOString().slice(0, 7);

    // 1) Full JSON backup
    if (st) st.textContent = '1/3 JSON full backup...';
    const full = {
      meta: {
        app: 'JSV Cable TV',
        place: 'S. Alangulam',
        exportedAt: new Date().toISOString(),
        month: ym
      },
      company,
      monthBill,
      customers: allCustomers.map(({ id, ...r }) => ({ id, ...r })),
      boxes,
      collections: collections.map(c => {
        const o = { ...c };
        // stringify timestamps
        if (o.createdAt && o.createdAt.toDate) o.createdAt = o.createdAt.toDate().toISOString();
        if (o.updatedAt && o.updatedAt.toDate) o.updatedAt = o.updatedAt.toDate().toISOString();
        return o;
      }),
      streets,
      employees
    };
    downloadBlob(
      'JSV_Backup_FULL_' + stamp + '.json',
      JSON.stringify(full, null, 2),
      'application/json'
    );

    await new Promise(r => setTimeout(r, 400));

    // 2) Customers CSV (Excel-friendly)
    if (st) st.textContent = '2/3 Customers CSV...';
    const custRows = allCustomers.map(c => ({
      custId: c.custId || '',
      name: c.name || '',
      mobile: c.mobile || '',
      place: c.place || '',
      street: c.street || '',
      boxNo: c.boxNo || '',
      scNo: c.scNo || c.smartCard || '',
      mso: c.mso || '',
      package: c.package || '',
      packageAmt: c.packageAmt || c.package || '',
      dueAmt: c.dueAmt || c.due || 0,
      status: c.status || 'ACT',
      dcDate: c.dcDate || '',
      doorNo: c.doorNo || '',
      signal: c.signal || ''
    }));
    const custHeaders = ['custId','name','mobile','place','street','boxNo','scNo','mso','package','packageAmt','dueAmt','status','dcDate','doorNo','signal'];
    downloadBlob(
      'JSV_Customers_' + stamp + '.csv',
      toCSV(custRows, custHeaders),
      'text/csv;charset=utf-8'
    );

    await new Promise(r => setTimeout(r, 400));

    // 3) Collections CSV
    if (st) st.textContent = '3/3 Collections CSV...';
    const colRows = collections.map(c => ({
      billNo: c.billNo || '',
      date: c.date || c.billDate || '',
      customerId: c.customerId || '',
      customerName: c.customerName || '',
      amount: c.amount || 0,
      mode: c.mode || '',
      collectedBy: c.collectedBy || c.employee || '',
      createdBy: c.createdBy || '',
      remarks: c.remarks || '',
      status: c.status || ''
    }));
    const colHeaders = ['billNo','date','customerId','customerName','amount','mode','collectedBy','createdBy','remarks','status'];
    downloadBlob(
      'JSV_Collections_' + stamp + '.csv',
      toCSV(colRows, colHeaders),
      'text/csv;charset=utf-8'
    );

    const msg = 'Backup OK · Customers ' + allCustomers.length +
      ' · Boxes ' + boxes.length +
      ' · Collections ' + collections.length +
      ' · 3 files downloaded';
    if (st) st.textContent = '✅ ' + msg;
    showToast('Backup complete — 3 files');
  } catch (e) {
    console.error(e);
    if (st) st.textContent = 'Error: ' + e.message;
    showToast('Backup error: ' + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Backup Now'; }
  }
}

function openReport(kind) {
  const menu = document.getElementById('reportMenu');
  if (menu) menu.classList.add('hidden');
  document.querySelectorAll('.report-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('reportPanel-' + kind);
  if (panel) panel.classList.remove('hidden');
  if (kind === 'collection') renderCollectionReport();
  if (kind === 'customers') renderCustomerReport();
  if (kind === 'dc') renderDcReport();
  if (kind === 'package') renderPackageReport();
}
function closeReportPanels() {
  document.querySelectorAll('.report-panel').forEach(p => p.classList.add('hidden'));
  const menu = document.getElementById('reportMenu');
  if (menu) menu.classList.remove('hidden');
}
function renderCustomerReport() {
  const st = (document.getElementById('custRepStatus') || {}).value || '';
  let list = allCustomers.slice();
  if (st) list = list.filter(c => String(c.status || 'ACT').toUpperCase() === st.toUpperCase());
  list.sort((a, b) => String(a.custId || '').localeCompare(String(b.custId || '')));
  const sum = document.getElementById('custRepSummary');
  if (sum) sum.textContent = list.length + ' customers';
  const body = document.getElementById('custRepBody');
  if (!body) return;
  body.innerHTML = `<div class="overflow-x-auto max-h-[70vh]"><table class="w-full text-sm">
    <thead class="bg-slate-50 sticky top-0"><tr>
      <th class="text-left px-2 py-2">ID</th><th class="text-left px-2 py-2">Name</th>
      <th class="text-left px-2 py-2">Mobile</th><th class="text-left px-2 py-2">Street</th>
      <th class="text-right px-2 py-2">Due</th><th class="text-left px-2 py-2">Status</th>
    </tr></thead><tbody>` + list.map(c => `<tr class="border-t">
      <td class="px-2 py-1.5">${c.custId||''}</td><td class="px-2 py-1.5">${c.name||''}</td>
      <td class="px-2 py-1.5">${c.mobile||''}</td><td class="px-2 py-1.5 text-xs">${c.street||''}</td>
      <td class="px-2 py-1.5 text-right">₹${Number(c.dueAmt||c.due||0).toLocaleString('en-IN')}</td>
      <td class="px-2 py-1.5">${c.status||'ACT'}</td></tr>`).join('') + '</tbody></table></div>';
}
function renderDcReport() {
  const list = allCustomers.filter(c => String(c.status||'').toUpperCase() === 'DC')
    .sort((a,b) => String(a.custId||'').localeCompare(String(b.custId||'')));
  const sum = document.getElementById('dcRepSummary');
  if (sum) sum.textContent = list.length + ' DC customers';
  const body = document.getElementById('dcRepBody');
  if (!body) return;
  body.innerHTML = `<div class="overflow-x-auto max-h-[70vh]"><table class="w-full text-sm">
    <thead class="bg-slate-50 sticky top-0"><tr>
      <th class="text-left px-2 py-2">ID</th><th class="text-left px-2 py-2">Name</th>
      <th class="text-left px-2 py-2">Box</th><th class="text-left px-2 py-2">DC Date</th>
      <th class="text-right px-2 py-2">Balance</th>
    </tr></thead><tbody>` + list.map(c => `<tr class="border-t">
      <td class="px-2 py-1.5">${c.custId||''}</td><td class="px-2 py-1.5">${c.name||''}</td>
      <td class="px-2 py-1.5 text-xs">${c.boxNo||''}</td><td class="px-2 py-1.5">${c.dcDate||''}</td>
      <td class="px-2 py-1.5 text-right">₹${Number(c.dueAmt||c.due||0).toLocaleString('en-IN')}</td>
    </tr>`).join('') + '</tbody></table></div>';
}
function renderPackageReport() {
  const map = new Map();
  allCustomers.filter(c => String(c.status||'ACT').toUpperCase() !== 'DC').forEach(c => {
    const amt = Number(c.packageAmt || 0);
    const key = '₹' + amt;
    if (!map.has(key)) map.set(key, { amt, count: 0 });
    map.get(key).count++;
  });
  const rows = Array.from(map.values()).sort((a,b) => a.amt - b.amt);
  const body = document.getElementById('pkgRepBody');
  if (!body) return;
  body.innerHTML = '<h3 class="font-semibold mb-3">Package Amount Wise (Active)</h3><table class="w-full text-sm"><thead><tr><th class="text-left py-2">Package ₹</th><th class="text-right py-2">Customers</th></tr></thead><tbody>' +
    rows.map(r => `<tr class="border-t"><td class="py-2">₹${r.amt.toLocaleString('en-IN')}</td><td class="py-2 text-right font-medium">${r.count}</td></tr>`).join('') +
    '</tbody></table>';
}

// ==================== OFFLINE QUEUE ====================
const OFFLINE_KEY = 'jsv_offline_queue';

function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch (e) { return []; }
}
function setOfflineQueue(q) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
  updateOfflineBadges();
}
function queueOfflineOp(op) {
  const q = getOfflineQueue();
  op.id = 'off_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  op.queuedAt = new Date().toISOString();
  q.push(op);
  setOfflineQueue(q);
}
function updateOfflineBadges() {
  const off = document.getElementById('offlineBadge');
  const sync = document.getElementById('syncBadge');
  const q = getOfflineQueue();
  if (off) {
    if (!navigator.onLine) off.classList.remove('hidden');
    else off.classList.add('hidden');
  }
  if (sync) {
    if (q.length) {
      sync.classList.remove('hidden');
      sync.textContent = 'Sync ' + q.length;
    } else sync.classList.add('hidden');
  }
}
async function flushOfflineQueue() {
  if (!navigator.onLine) return;
  let q = getOfflineQueue();
  if (!q.length) { updateOfflineBadges(); return; }
  const sync = document.getElementById('syncBadge');
  if (sync) { sync.classList.remove('hidden'); sync.textContent = 'Syncing…'; }
  const remain = [];
  for (const op of q) {
    try {
      if (op.type === 'collection') {
        await db.collection('collections').add(op.data);
        if (op.customerId != null) {
          await db.collection('customers').doc(op.customerId).update({
            dueAmt: op.newDue,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      } else if (op.type === 'expense') {
        await db.collection('expenses').add(op.data);
      }
    } catch (e) {
      remain.push(op);
    }
  }
  setOfflineQueue(remain);
  if (!remain.length) showToast('Offline data synced');
  await loadCustomers();
  if (typeof updateDashboardStats === 'function') updateDashboardStats();
  updateOfflineBadges();
}
window.addEventListener('online', () => { updateOfflineBadges(); flushOfflineQueue(); });
window.addEventListener('offline', updateOfflineBadges);
document.addEventListener('DOMContentLoaded', updateOfflineBadges);

// ==================== EXPENSES ====================
function onExpCategoryChange() {
  const cat = document.getElementById('expCategory')?.value || '';
  const wrap = document.getElementById('expNameWrap');
  if (!wrap) return;
  const need = (cat === 'Donation' || cat === 'Monthly Salary');
  wrap.classList.toggle('hidden', !need);
}

async function saveExpense() {
  const amount = Number(document.getElementById('expAmount')?.value || 0);
  if (!amount || amount <= 0) { showToast('Enter amount', true); return; }
  let category = document.getElementById('expCategory')?.value || 'Other';
  const person = (document.getElementById('expPersonName')?.value || '').trim();
  if ((category === 'Donation' || category === 'Monthly Salary') && !person) {
    showToast('Name உள்ளிடவும்', true);
    return;
  }
  if (person && (category === 'Donation' || category === 'Monthly Salary')) {
    category = category + ' · ' + person;
  }
  const data = {
    date: document.getElementById('expDate')?.value || new Date().toISOString().slice(0, 10),
    category,
    amount,
    personName: person || '',
    note: (document.getElementById('expNote')?.value || '').trim(),
    createdBy: currentUser?.email || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    if (!navigator.onLine) throw new Error('OFFLINE');
    await db.collection('expenses').add(data);
    showToast('Expense saved · ₹' + amount);
  } catch (e) {
    const plain = { ...data, createdAt: new Date().toISOString() };
    queueOfflineOp({ type: 'expense', data: plain });
    showToast('Offline · expense queued');
  }
  document.getElementById('expAmount').value = '';
  document.getElementById('expNote').value = '';
  if (document.getElementById('expPersonName')) document.getElementById('expPersonName').value = '';
  loadExpenses();
}

async function loadExpenses() {
  const listEl = document.getElementById('expList');
  const totEl = document.getElementById('expMonthTotal');
  if (!listEl) return;
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  try {
    const snap = await db.collection('expenses').where('date', '>=', monthStart).get();
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    if (totEl) totEl.textContent = '₹' + total.toLocaleString('en-IN');
    listEl.innerHTML = rows.length ? rows.map(r => `
      <div class="py-2.5 flex justify-between gap-2">
        <div>
          <div class="font-medium">${r.category || ''}</div>
          <div class="text-[10px] text-slate-500">${r.date || ''} · ${r.note || ''}</div>
        </div>
        <div class="font-bold text-rose-600 shrink-0">₹${Number(r.amount||0).toLocaleString('en-IN')}</div>
      </div>`).join('') : '<div class="py-4 text-center text-slate-400">No expenses this month</div>';
  } catch (e) {
    listEl.innerHTML = '<div class="text-red-500 text-xs">' + e.message + '</div>';
  }
}
