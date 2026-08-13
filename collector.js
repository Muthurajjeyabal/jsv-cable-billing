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

let currentUser = null;
let allCustomers = [];
let allCustomersRaw = [];
let selectedCustomer = null;
let placesMap = {};

// Area allotment — loaded from Firestore `employees` (Admin Masters)
let AGENT_AREAS = {};   // email -> ['AREA 1'] or null for ALL
let AGENT_NAMES = {};   // email -> [display names]
let myEmployee = null;

async function loadEmployeeMap() {
  AGENT_AREAS = {};
  AGENT_NAMES = {};
  try {
    const snap = await db.collection('employees').get();
    snap.forEach(doc => {
      const d = doc.data();
      const email = String(d.email || '').toLowerCase().trim();
      if (!email) return;
      const area = (d.area || 'ALL').toUpperCase().trim();
      AGENT_AREAS[email] = (area === 'ALL') ? null : [d.area];
      const nm = (d.name || email.split('@')[0]).toUpperCase().trim();
      AGENT_NAMES[email] = [nm, nm.replace(/\s+/g, ''), email.split('@')[0].toUpperCase()];
    });
  } catch (e) {
    console.error('employees load', e);
  }
  // fallback if empty
  if (!Object.keys(AGENT_AREAS).length) {
    AGENT_AREAS = {
      'uma@jsvcable.com': ['AREA 2'],
      'muthumari@jsvcable.com': ['AREA 1'],
      'office@jsvcable.com': null,
      'online@jsvcable.com': null
    };
    AGENT_NAMES = {
      'uma@jsvcable.com': ['UMA'],
      'muthumari@jsvcable.com': ['MUTHUMARI'],
      'office@jsvcable.com': ['LOCAL', 'OFFICE'],
      'online@jsvcable.com': ['ONLINE']
    };
  }
}

function getAgentNames() {
  if (!currentUser) return [];
  const email = (currentUser.email || '').toLowerCase();
  if (AGENT_NAMES[email]) return AGENT_NAMES[email];
  for (const [k, names] of Object.entries(AGENT_NAMES)) {
    if (email.startsWith(k.split('@')[0])) return names;
  }
  const local = email.split('@')[0].toUpperCase();
  return local ? [local] : [];
}

function isMyCollection(d) {
  if (!currentUser) return false;
  if (d.createdBy === currentUser.email) return true;
  const names = getAgentNames();
  const emp = (d.employee || d.collectedBy || d.createdBy || '').toUpperCase().trim();
  return names.some(n => emp === n || emp.includes(n));
}

function getAgentAreas() {
  if (!currentUser) return null;
  const email = (currentUser.email || '').toLowerCase();
  if (email in AGENT_AREAS) return AGENT_AREAS[email];
  for (const [k, v] of Object.entries(AGENT_AREAS)) {
    if (email.startsWith(k.split('@')[0])) return v;
  }
  // admin emails → all
  if (email.includes('admin') || email.includes('jeyabal') || email.includes('stefi') || email.includes('muthuraj')) return null;
  // unknown collector with no employee record → no customers (safe)
  return [];
}

function filterByAgentArea(list) {
  const areas = getAgentAreas();
  if (!areas) return list; // all areas
  return list.filter(c => areas.includes((c.place || '').trim()));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  const today = new Date().toISOString().split('T')[0]; // today only — no backdate
  const yest = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const fromEl = document.getElementById('colFrom');
  const toEl = document.getElementById('colTo');
  if (fromEl) fromEl.value = today;
  if (toEl) toEl.value = today;

  auth.onAuthStateChanged(async user => {
    if (user) {
      await loadEmployeeMap();
      try { updateColOfflineUI(); flushCollectorOffline(); } catch(e) {}
      currentUser = user;
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('appScreen').classList.remove('hidden');
      document.getElementById('agentLabel').textContent = user.email;
      document.getElementById('settingsEmail').textContent = user.email;
      document.getElementById('dashAgentName').textContent = (user.email || '').split('@')[0].toUpperCase();
      await loadCustomers();
      goHome();
    } else {
      currentUser = null;
      document.getElementById('loginScreen').classList.remove('hidden');
      document.getElementById('appScreen').classList.add('hidden');
    }
  });
});

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  btn.disabled = true; btn.textContent = 'Logging in...'; err.classList.add('hidden');
  try { await auth.signInWithEmailAndPassword(email, password); }
  catch (ex) { err.textContent = 'Invalid email or password'; err.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.textContent = 'Login'; }
}

function logout() { if (confirm('Logout?')) auth.signOut(); }

function goHome() {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-home').classList.remove('hidden');
  document.getElementById('backBtn').classList.add('hidden');
  document.getElementById('headerTitle').textContent = 'JSV CABLE';
}

function showPage(id) {
  try {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const page = document.getElementById('page-' + id);
    if (!page) { console.error('Page not found:', id); showToast('Page error: ' + id, true); return; }
    page.classList.remove('hidden');
    const back = document.getElementById('backBtn');
    if (back) back.classList.remove('hidden');
    const titles = { dashboard:'DASHBOARD', customers:'CUSTOMER INFO', billing:'BILLING', ledger:'LEDGER', colReport:'COLLECTION REPORT', pending:'PENDING REPORT', settings:'SETTINGS' };
    const ht = document.getElementById('headerTitle');
    if (ht) ht.textContent = titles[id] || id;
    if (id === 'dashboard') loadDashboard();
    if (id === 'customers') { buildPlaceStreet(); filterCustomers(); }
    if (id === 'colReport') loadColReport();
    if (id === 'pending') loadPending();
  } catch (e) {
    console.error('showPage error', e);
    showToast('Error: ' + e.message, true);
  }
}

// Expose to window for onclick

async function loadCustomers() {
  const snap = await db.collection('customers').get();
  allCustomersRaw = [];
  snap.forEach(doc => {
    allCustomersRaw.push({ id: doc.id, ...doc.data() });
  });
  allCustomersRaw.sort((a,b) => (a.name||'').localeCompare(b.name||'','ta'));
  allCustomers = filterByAgentArea(allCustomersRaw);
  placesMap = {};
  allCustomers.forEach(d => {
    const pl = d.place || 'Other';
    const st = d.street || 'Other';
    if (!placesMap[pl]) placesMap[pl] = new Set();
    placesMap[pl].add(st);
  });
  console.log('Agent areas:', getAgentAreas(), 'Customers:', allCustomers.length);
}

function buildPlaceStreet() {
  const placeSel = document.getElementById('filterPlace');
  const streetSel = document.getElementById('filterStreet');
  placeSel.innerHTML = '<option value="">- Select Place -</option>';
  Object.keys(placesMap).sort().forEach(p => {
    placeSel.innerHTML += `<option value="${p}">${p}</option>`;
  });
  streetSel.innerHTML = '<option value="">- Select Street -</option>';
}

function onPlaceChange() {
  const place = document.getElementById('filterPlace').value;
  const streetSel = document.getElementById('filterStreet');
  streetSel.innerHTML = '<option value="">- Select Street -</option>';
  if (place && placesMap[place]) {
    [...placesMap[place]].sort().forEach(s => {
      streetSel.innerHTML += `<option value="${s}">${s}</option>`;
    });
  }
  filterCustomers();
}

function filterCustomers() {
  const place = document.getElementById('filterPlace').value;
  const street = document.getElementById('filterStreet').value;
  const showDC = document.getElementById('filterDC').checked;
  const showACT = document.getElementById('filterACT').checked;
  const q = (document.getElementById('custSearch').value || '').toLowerCase().trim();
  const pendingOnly = window._pendingOnly || false;

  let list = allCustomers.filter(c => {
    const st = c.status || 'ACT';
    if (st === 'ACT' && !showACT) return false;
    if (st === 'DC' && !showDC) return false;
    if (place && (c.place || '') !== place) return false;
    if (street && (c.street || '') !== street) return false;
    if (pendingOnly && Number(c.dueAmt || c.due || 0) <= 0) return false;
    if (q) {
      return (c.name||'').toLowerCase().includes(q) || (c.mobile||'').includes(q) ||
        (c.boxNo||'').toLowerCase().includes(q) || (c.custId||'').toLowerCase().includes(q);
    }
    return true;
  });

  const box = document.getElementById('custList');
  if (list.length === 0) {
    box.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm">No customers</div>';
    return;
  }
  box.innerHTML = list.slice(0, 100).map(c => {
    const due = Number(c.dueAmt || c.due || 0);
    return `<div class="bg-white rounded-lg p-2.5 border shadow-sm" onclick="openCollect('${c.id}')">
      <div class="flex justify-between">
        <div>
          <div class="font-medium text-sm">${c.name||'-'}</div>
          <div class="text-xs text-slate-500">${c.mobile||'-'} • ${c.boxNo||'-'}</div>
          <div class="text-xs text-slate-400">${c.custId||''} • ${c.street||c.place||''}</div>
        </div>
        <div class="text-right">
          <div class="text-sm font-bold ${due>0?'text-red-600':'text-slate-400'}">₹${due}</div>
          <div class="text-xs ${c.status==='DC'?'text-red-500':'text-green-600'}">${c.status||'ACT'}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function showPendingOnly() { window._pendingOnly = true; filterCustomers(); }
function showAllCust() { window._pendingOnly = false; document.getElementById('filterACT').checked = true; document.getElementById('filterDC').checked = true; filterCustomers(); }

function searchBill() {
  const q = document.getElementById('billSearch').value.toLowerCase().trim();
  const box = document.getElementById('billResults');
  if (q.length < 2) { box.innerHTML = '<div class="text-center text-slate-400 py-10 text-sm">குறைந்தது 2 எழுத்து</div>'; return; }
  const matches = allCustomers.filter(c => (c.status||'ACT')==='ACT' && (
    (c.name||'').toLowerCase().includes(q) || (c.mobile||'').includes(q) ||
    (c.boxNo||'').toLowerCase().includes(q) || (c.custId||'').toLowerCase().includes(q)
  )).slice(0, 25);
  if (!matches.length) { box.innerHTML = '<div class="text-center text-slate-400 py-10 text-sm">கிடைக்கவில்லை</div>'; return; }
  box.innerHTML = matches.map(c => {
    const due = Number(c.dueAmt||c.due||0);
    return `<div class="bg-white rounded-lg p-3 border shadow-sm" onclick="openCollect('${c.id}')">
      <div class="flex justify-between"><div><div class="font-semibold text-sm">${c.name}</div>
      <div class="text-xs text-slate-500">${c.mobile||'-'} • Box: ${c.boxNo||'-'}</div></div>
      <div class="text-sm font-bold ${due>0?'text-red-600':'text-slate-400'}">₹${due}</div></div></div>`;
  }).join('');
}

function openCollect(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  selectedCustomer = c;
  const due = Number(c.dueAmt || c.due || 0);
  document.getElementById('modalName').textContent = c.name || '-';
  document.getElementById('modalInfo').textContent = `${c.mobile||'-'} | ${c.boxNo||'-'} | ${c.package||''} | ${c.custId||''}`;
  document.getElementById('modalDue').textContent = '₹' + due.toLocaleString('en-IN');
  document.getElementById('colAmount').value = due > 0 ? due : (c.packageAmt || '');
  document.getElementById('colMode').value = 'Cash';
  document.getElementById('colRemarks').value = '';
  document.getElementById('collectModal').classList.remove('hidden');
}

function closeModal() { document.getElementById('collectModal').classList.add('hidden'); selectedCustomer = null; }

async function saveCollection() {
  if (!selectedCustomer) return;
  const amount = Number(document.getElementById('colAmount').value);
  if (!amount || amount <= 0) { showToast('Amount உள்ளிடவும்', true); return; }
  const btn = document.getElementById('saveColBtn');
  btn.disabled = true; btn.textContent = 'Saving...';
  const today = new Date().toISOString().split('T')[0]; // today only — no backdate
  const currentDue = Number(selectedCustomer.dueAmt || selectedCustomer.due || 0);
  const newDue = Math.max(0, currentDue - amount);
  const payType = amount < currentDue ? 'partial' : (amount > currentDue ? 'advance' : 'full');
  const data = {
    customerId: selectedCustomer.id,
    custId: selectedCustomer.custId || '',
    customerName: selectedCustomer.name || '',
    amount, date: today,
    mode: document.getElementById('colMode').value,
    remarks: document.getElementById('colRemarks').value.trim(),
    package: selectedCustomer.package || '',
    boxNo: selectedCustomer.boxNo || '',
    payType, prevDue: currentDue, balanceAfter: newDue,
    createdBy: currentUser.email,
    collectedBy: displayAgentName(currentUser.email),
    source: 'agent-app',
    status: 'active'
  };
  try {
    if (!navigator.onLine) throw new Error('OFFLINE');
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('collections').add(data);
    await db.collection('customers').doc(selectedCustomer.id).update({
      dueAmt: newDue,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    applyLocalDue(selectedCustomer.id, newDue);
    showToast('₹' + amount + ' saved' + (payType === 'partial' ? ' (partial)' : '') + '!');
    closeModal();
    if (!document.getElementById('page-customers').classList.contains('hidden')) filterCustomers();
    if (typeof loadDashboard === 'function') loadDashboard();
  } catch (err) {
    if (!navigator.onLine || String(err.message).includes('OFFLINE') || err.code === 'unavailable') {
      data.createdAt = new Date().toISOString();
      queueCollectorOffline({ type: 'collection', data, customerId: selectedCustomer.id, newDue });
      applyLocalDue(selectedCustomer.id, newDue);
      showToast('Offline · saved · will sync');
      closeModal();
      if (!document.getElementById('page-customers').classList.contains('hidden')) filterCustomers();
    } else {
      showToast('Error: ' + err.message, true);
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Save Collection';
  }
}

function applyLocalDue(id, newDue) {
  if (selectedCustomer && selectedCustomer.id === id) selectedCustomer.dueAmt = newDue;
  const idx = allCustomers.findIndex(x => x.id === id);
  if (idx >= 0) allCustomers[idx].dueAmt = newDue;
}

const COL_OFF_KEY = 'jsv_collector_offline_queue';
function getColQueue() {
  try { return JSON.parse(localStorage.getItem(COL_OFF_KEY) || '[]'); } catch (e) { return []; }
}
function setColQueue(q) {
  localStorage.setItem(COL_OFF_KEY, JSON.stringify(q));
  updateColOfflineUI();
}
function queueCollectorOffline(op) {
  const q = getColQueue();
  op.id = 'coff_' + Date.now();
  op.queuedAt = new Date().toISOString();
  q.push(op);
  setColQueue(q);
}
function updateColOfflineUI() {
  const off = document.getElementById('colOfflineBadge');
  const sync = document.getElementById('colSyncBadge');
  const q = getColQueue();
  if (off) off.classList.toggle('hidden', navigator.onLine);
  if (sync) {
    if (q.length) { sync.classList.remove('hidden'); sync.textContent = 'Sync ' + q.length; }
    else sync.classList.add('hidden');
  }
}
async function flushCollectorOffline() {
  if (!navigator.onLine) return;
  let q = getColQueue();
  if (!q.length) { updateColOfflineUI(); return; }
  const remain = [];
  for (const op of q) {
    try {
      if (op.type === 'collection') {
        const d = { ...op.data };
        d.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('collections').add(d);
        if (op.customerId) {
          await db.collection('customers').doc(op.customerId).update({
            dueAmt: op.newDue,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    } catch (e) { remain.push(op); }
  }
  setColQueue(remain);
  if (!remain.length) showToast('Offline collections synced');
  updateColOfflineUI();
}
window.addEventListener('online', () => { updateColOfflineUI(); flushCollectorOffline(); });
window.addEventListener('offline', updateColOfflineUI);


function searchLedger() {
  const q = document.getElementById('ledgerSearch').value.toLowerCase().trim();
  const box = document.getElementById('ledgerSearchResults');
  if (q.length < 2) { box.classList.add('hidden'); return; }
  const matches = allCustomers.filter(c =>
    (c.name||'').toLowerCase().includes(q) || (c.mobile||'').includes(q) || (c.boxNo||'').toLowerCase().includes(q)
  ).slice(0, 8);
  box.classList.remove('hidden');
  box.innerHTML = matches.map(c =>
    `<div class="p-2 border-b text-sm cursor-pointer hover:bg-blue-50" onclick="viewLedger('${c.id}')">${c.name} • ${c.mobile||''} • Due ₹${c.dueAmt||0}</div>`
  ).join('') || '<div class="p-2 text-slate-400 text-sm">No match</div>';
}

async function viewLedger(id) {
  document.getElementById('ledgerSearchResults').classList.add('hidden');
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  const content = document.getElementById('ledgerContent');
  content.innerHTML = '<div class="text-center py-6 text-slate-400">Loading...</div>';
  try {
    const snap = await db.collection('collections').where('customerId', '==', id).get();
    const rows = [];
    snap.forEach(doc => rows.push(doc.data()));
    rows.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    let total = 0;
    let html = `<div class="bg-white rounded-xl p-3 mb-3 border">
      <div class="font-bold">${c.name}</div>
      <div class="text-xs text-slate-500">${c.mobile||'-'} | ${c.boxNo||'-'} | Due: ₹${c.dueAmt||0}</div>
    </div>`;
    if (!rows.length) html += '<div class="text-center text-slate-400 py-6">No records</div>';
    else {
      html += '<div class="bg-white rounded-xl border overflow-hidden"><table class="w-full text-xs"><thead class="bg-slate-100"><tr><th class="p-2 text-left">Date</th><th class="p-2 text-left">Amt</th><th class="p-2 text-left">Mode</th><th class="p-2 text-left">By</th></tr></thead><tbody>';
      rows.forEach(r => {
        total += Number(r.amount||0);
        html += `<tr class="border-t"><td class="p-2">${r.date||'-'}</td><td class="p-2 font-semibold">₹${r.amount||0}</td><td class="p-2">${r.mode||'-'}</td><td class="p-2">${displayAgentName(r)}</td></tr>`;
      });
      html += `</tbody></table><div class="p-2 bg-slate-50 font-bold text-sm">Total: ₹${total.toLocaleString('en-IN')}</div></div>`;
    }
    content.innerHTML = html;
  } catch (e) { content.innerHTML = '<div class="text-red-500 text-center py-6">Error loading</div>'; }
}

async function loadColReport() {
  const from = document.getElementById('colFrom').value;
  const to = document.getElementById('colTo').value;
  const list = document.getElementById('colReportList');
  list.innerHTML = '<div class="text-center py-6 text-slate-400">Loading...</div>';
  try {
    let snap;
    if (from && to) {
      snap = await db.collection('collections').where('date', '>=', from).where('date', '<=', to).get();
    } else {
      const today = new Date().toISOString().split('T')[0]; // today only — no backdate
      snap = await db.collection('collections').where('date', '==', today).get();
    }
    const rows = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.createdBy === currentUser.email || true) rows.push(d);
    });
    rows.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    let total = 0;
    if (!rows.length) {
      list.innerHTML = '<div class="text-center py-8 text-slate-400">No collections</div>';
    } else {
      list.innerHTML = `<table class="w-full text-xs"><thead class="bg-green-700 text-white sticky top-0"><tr>
        <th class="p-2 text-left">SNo</th><th class="p-2 text-left">Name</th><th class="p-2 text-left">Date</th><th class="p-2 text-left">Amt</th></tr></thead><tbody>` +
        rows.map((r,i) => {
          total += Number(r.amount||0);
          return `<tr class="border-b bg-white"><td class="p-2">${i+1}</td><td class="p-2">${r.customerName||'-'}</td><td class="p-2">${r.date||'-'}</td><td class="p-2 font-semibold">₹${r.amount||0}</td></tr>`;
        }).join('') + '</tbody></table>';
    }
    document.getElementById('colReportTotal').textContent = 'Total: ₹' + total.toLocaleString('en-IN') + ' (' + rows.length + ')';
  } catch (e) {
    list.innerHTML = '<div class="text-red-500 text-center py-6">Error (may need index)</div>';
    console.error(e);
  }
}

function loadPending() {
  const list = allCustomers.filter(c => Number(c.dueAmt || c.due || 0) > 0)
    .sort((a,b) => Number(b.dueAmt||b.due||0) - Number(a.dueAmt||a.due||0));
  const total = list.reduce((s,c) => s + Number(c.dueAmt||c.due||0), 0);
  const box = document.getElementById('pendingList');
  if (!list.length) box.innerHTML = '<div class="text-center py-8 text-slate-400">No pending</div>';
  else {
    box.innerHTML = `<table class="w-full text-xs"><thead class="bg-green-700 text-white sticky top-0"><tr>
      <th class="p-2 text-left">SNo</th><th class="p-2 text-left">Name</th><th class="p-2 text-left">Amount</th></tr></thead><tbody>` +
      list.map((c,i) => `<tr class="border-b bg-white" onclick="openCollect('${c.id}')">
        <td class="p-2">${i+1}</td><td class="p-2">${c.name}<div class="text-slate-400">${c.mobile||''}</div></td>
        <td class="p-2 font-bold text-red-600">₹${Number(c.dueAmt||c.due||0)}</td></tr>`).join('') + '</tbody></table>';
  }
  document.getElementById('pendingTotalBar').textContent = `Total: ₹${total.toLocaleString('en-IN')} (${list.length})`;
}

async function loadDashboard() {
  const active = allCustomers.filter(c => (c.status||'ACT')==='ACT').length;
  const dc = allCustomers.filter(c => c.status==='DC').length;
  const unpaidList = allCustomers.filter(c => Number(c.dueAmt||c.due||0) > 0);
  const unpaidAmt = unpaidList.reduce((s,c) => s + Number(c.dueAmt||c.due||0), 0);
  document.getElementById('dActive').textContent = active;
  document.getElementById('dDC').textContent = dc;
  document.getElementById('dUnpaidCust').textContent = unpaidList.length;
  document.getElementById('dUnpaidAmt').textContent = '₹' + unpaidAmt.toLocaleString('en-IN');
  document.getElementById('dPending').textContent = '₹' + unpaidAmt.toLocaleString('en-IN');

  // Only this agent's area customer IDs
  const myCustIds = new Set(allCustomers.map(c => c.id));
  const myCustIdCodes = new Set(allCustomers.map(c => c.custId).filter(Boolean));

  const today = new Date().toISOString().split('T')[0]; // today only — no backdate
  const yest = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';

  try {
    const allCol = await db.collection('collections').where('date', '>=', monthStart).get();
    let todayT = 0, yestT = 0, monthT = 0, myMonth = 0;
    const paidIds = new Set();
    allCol.forEach(doc => {
      const d = doc.data();
      // Filter: only collections for customers in this agent's area
      const inArea = myCustIds.has(d.customerId) || myCustIdCodes.has(d.custId);
      if (!inArea) return;
      const amt = Number(d.amount || 0);
      monthT += amt;
      if (d.date === today) todayT += amt;
      if (d.date === yest) yestT += amt;
      if (isMyCollection(d)) myMonth += amt;
      if (d.customerId) paidIds.add(d.customerId);
      else if (d.custId) paidIds.add(d.custId);
    });
    document.getElementById('dToday').textContent = '₹' + todayT.toLocaleString('en-IN');
    document.getElementById('dYest').textContent = '₹' + yestT.toLocaleString('en-IN');
    document.getElementById('dPaidAmt').textContent = '₹' + monthT.toLocaleString('en-IN');
    document.getElementById('dMyTotal').textContent = '₹' + myMonth.toLocaleString('en-IN');
    document.getElementById('dPaidCust').textContent = paidIds.size;
  } catch (e) {
    console.error(e);
  }
}

function displayAgentName(d) {
  const s = (typeof d === 'string' ? d : (d && (d.collectedBy || d.employee || d.createdBy) || '')).toString();
  const lower = s.toLowerCase();
  if (lower.includes('muthumari')) return 'MUTHUMARI';
  if (lower.includes('uma@') || lower === 'uma' || /(^|[^a-z])uma([^a-z]|$)/.test(lower)) return 'UMA';
  if (lower.includes('office') || lower.includes('local')) return 'OFFICE';
  if (lower.includes('online')) return 'ONLINE';
  if (lower.includes('stefi')) return 'STEFI';
  if (lower.includes('jeyabal') || lower.includes('muthuraj')) return 'ADMIN';
  if (s && !s.includes('@') && s.length < 20) return s.toUpperCase();
  if (s.includes('@')) return s.split('@')[0].toUpperCase();
  return s || '-';
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden', 'bg-red-600', 'bg-green-700');
  t.classList.add(isError ? 'bg-red-600' : 'bg-green-700');
  setTimeout(() => t.classList.add('hidden'), 2500);
}

window.showPage = showPage;
window.goHome = goHome;
window.logout = logout;
window.openCollect = openCollect;
window.closeModal = closeModal;
window.saveCollection = saveCollection;
window.filterCustomers = filterCustomers;
window.onPlaceChange = onPlaceChange;
window.showPendingOnly = showPendingOnly;
window.showAllCust = showAllCust;
window.searchBill = searchBill;
window.searchLedger = searchLedger;
window.viewLedger = viewLedger;
window.loadColReport = loadColReport;
window.loadPending = loadPending;
