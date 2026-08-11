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

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  // Set default dates
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('custConDate').value = today;
  document.getElementById('billDate').value = today;

  // Auth state listener
  auth.onAuthStateChanged(user => {
    if (user) {
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

  // Forms
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('customerForm').addEventListener('submit', handleSaveCustomer);
  document.getElementById('billForm').addEventListener('submit', handleSaveBill);
  document.getElementById('createUserForm').addEventListener('submit', handleCreateUser);
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
    errBox.textContent = err.message.includes('user-not-found') || err.message.includes('wrong-password')
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
    // Create user (this will sign in as the new user temporarily in some cases)
    // Better way: use Admin SDK, but for simple case we use client
    const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
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
    boxes: 'Box Management',
    reports: 'Reports',
    masters: 'Masters',
    settings: 'Settings'
  };
  document.getElementById('pageTitle').textContent = titles[pageId] || pageId;

  // Reset form if new customer
  if (pageId === 'newCustomer') {
    document.getElementById('customerForm').reset();
    document.getElementById('editCustomerId').value = '';
    document.getElementById('customerFormTitle').textContent = 'New Customer';
    document.getElementById('custConDate').value = new Date().toISOString().split('T')[0];
  }

  // Close mobile sidebar
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
    const snap = await db.collection('customers').orderBy('createdAt', 'desc').get();
    allCustomers = [];
    snap.forEach(doc => {
      allCustomers.push({ id: doc.id, ...doc.data() });
    });
    renderCustomerTable(allCustomers);
    updateDashboardStats();
  } catch (err) {
    console.error(err);
    document.getElementById('customerTableBody').innerHTML =
      `<tr><td colspan="6" class="text-center py-8 text-red-500">Error loading data</td></tr>`;
  }
}

function renderCustomerTable(list) {
  const tbody = document.getElementById('customerTableBody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No customers found</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-4 py-3 font-mono text-xs">${c.custId || c.id.slice(0,6)}</td>
      <td class="px-4 py-3 font-medium">${c.name || '-'}</td>
      <td class="px-4 py-3">${c.mobile || '-'}</td>
      <td class="px-4 py-3 font-mono text-xs">${c.boxNo || '-'}</td>
      <td class="px-4 py-3">
        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'ACT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
          ${c.status || 'ACT'}
        </span>
      </td>
      <td class="px-4 py-3">
        <button onclick="editCustomer('${c.id}')" class="text-blue-600 hover:underline text-xs mr-2">Edit</button>
        <button onclick="openWhatsApp('${c.mobile}', '${c.name}')" class="text-green-600 hover:underline text-xs">WA</button>
      </td>
    </tr>
  `).join('');
}

function searchCustomers() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const status = document.getElementById('statusFilter').value;

  let filtered = allCustomers;
  if (status) filtered = filtered.filter(c => c.status === status);
  if (q) {
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.mobile || '').includes(q) ||
      (c.boxNo || '').toLowerCase().includes(q) ||
      (c.custId || '').toLowerCase().includes(q) ||
      (c.scNo || '').toLowerCase().includes(q)
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
    boxNo: document.getElementById('custBox').value.trim(),
    scNo: document.getElementById('custSC').value.trim(),
    package: document.getElementById('custPackage').value,
    packageAmt: Number(document.getElementById('custPkgAmt').value) || 0,
    conDate: document.getElementById('custConDate').value,
    status: document.getElementById('custStatus').value,
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
  document.getElementById('custBox').value = c.boxNo || '';
  document.getElementById('custSC').value = c.scNo || '';
  document.getElementById('custPackage').value = c.package || '';
  document.getElementById('custPkgAmt').value = c.packageAmt || '';
  document.getElementById('custConDate').value = c.conDate || '';
  document.getElementById('custStatus').value = c.status || 'ACT';
  document.getElementById('custRemarks').value = c.remarks || '';

  showPage('newCustomer');
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
    (c.boxNo || '').toLowerCase().includes(q)
  ).slice(0, 8);

  if (matches.length === 0) {
    resultsDiv.innerHTML = '<div class="p-3 text-slate-400 text-sm">No match</div>';
  } else {
    resultsDiv.innerHTML = matches.map(c => `
      <div class="p-3 hover:bg-blue-50 cursor-pointer border-b text-sm" onclick="selectBillCustomer('${c.id}')">
        <div class="font-medium">${c.name}</div>
        <div class="text-xs text-slate-500">${c.mobile} • Box: ${c.boxNo || '-'} • ${c.status}</div>
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
  document.getElementById('billCustDetails').textContent = `${c.mobile} | Box: ${c.boxNo || '-'} | ${c.package || ''} | Due: ₹${c.due || 0}`;
  document.getElementById('selectedCustomerInfo').classList.remove('hidden');
  document.getElementById('billSearchResults').classList.add('hidden');
  document.getElementById('billSearch').value = c.name;
  document.getElementById('billAmount').value = c.packageAmt || '';
}

async function handleSaveBill(e) {
  e.preventDefault();
  const customerId = document.getElementById('billCustomerId').value;
  if (!customerId) {
    showToast('Please select a customer', true);
    return;
  }

  const amount = Number(document.getElementById('billAmount').value);
  const data = {
    customerId,
    customerName: selectedBillCustomer?.name || '',
    amount,
    date: document.getElementById('billDate').value,
    mode: document.getElementById('billMode').value,
    remarks: document.getElementById('billRemarks').value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser.email
  };

  try {
    await db.collection('collections').add(data);
    showToast('Collection saved! ₹' + amount);
    document.getElementById('billForm').reset();
    document.getElementById('selectedCustomerInfo').classList.add('hidden');
    document.getElementById('billDate').value = new Date().toISOString().split('T')[0];
    selectedBillCustomer = null;
    loadDashboard();
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
  updateDashboardStats();

  // Today collection
  const today = new Date().toISOString().split('T')[0];
  try {
    const colSnap = await db.collection('collections').where('date', '==', today).get();
    let todayTotal = 0;
    colSnap.forEach(d => todayTotal += (d.data().amount || 0));
    document.getElementById('statTodayCol').textContent = '₹ ' + todayTotal.toLocaleString('en-IN');

    // This month (simple)
    const monthStart = today.slice(0, 8) + '01';
    const monthSnap = await db.collection('collections').where('date', '>=', monthStart).get();
    let monthTotal = 0;
    monthSnap.forEach(d => monthTotal += (d.data().amount || 0));
    document.getElementById('statMonthCol').textContent = '₹ ' + monthTotal.toLocaleString('en-IN');
  } catch (e) {
    console.log('Collection stats error', e);
  }
}

function updateDashboardStats() {
  const total = allCustomers.length;
  const active = allCustomers.filter(c => c.status === 'ACT').length;
  const pending = allCustomers.filter(c => c.status === 'DC').length;
  const boxes = allCustomers.filter(c => c.boxNo).length;

  document.getElementById('statCustomers').textContent = total;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statBoxes').textContent = boxes;
  document.getElementById('boxCountDisplay').textContent = boxes;
}

// ==================== WHATSAPP ====================
function openWhatsApp(mobile, name) {
  if (!mobile) {
    showToast('No mobile number', true);
    return;
  }
  let num = mobile.replace(/\D/g, '');
  if (num.length === 10) num = '91' + num;
  const text = encodeURIComponent(`வணக்கம் ${name},\n\nJSV Cable - உங்கள் கேபிள் பில் நிலுவையில் உள்ளது. தயவுசெய்து செலுத்துங்கள்.\n\nநன்றி.`);
  window.open(`https://wa.me/${num}?text=${text}`, '_blank');
}

// ==================== TOAST ====================
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden', 'bg-red-600', 'bg-slate-800');
  toast.classList.add(isError ? 'bg-red-600' : 'bg-slate-800');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
