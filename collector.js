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
let selectedCustomer = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('appScreen').classList.remove('hidden');
      document.getElementById('agentName').textContent = user.email;
      await loadCustomers();
      await loadTodayTotal();
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
  btn.disabled = true;
  btn.textContent = 'Logging in...';
  err.classList.add('hidden');
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (ex) {
    err.textContent = 'Invalid email or password';
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
}

function logout() {
  if (confirm('Logout?')) auth.signOut();
}

async function loadCustomers() {
  try {
    const snap = await db.collection('customers').get();
    allCustomers = [];
    snap.forEach(doc => {
      const d = doc.data();
      // Only show Active customers for collection
      if ((d.status || 'ACT') === 'ACT') {
        allCustomers.push({ id: doc.id, ...d });
      }
    });
    allCustomers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ta'));
  } catch (e) {
    console.error(e);
    showToast('Error loading customers', true);
  }
}

async function loadTodayTotal() {
  const today = new Date().toISOString().split('T')[0];
  try {
    const snap = await db.collection('collections')
      .where('date', '==', today)
      .where('createdBy', '==', currentUser.email)
      .get();
    let total = 0;
    snap.forEach(d => total += Number(d.data().amount || 0));
    document.getElementById('todayTotal').textContent = '₹' + total.toLocaleString('en-IN');
  } catch (e) {
    // fallback: all today
    try {
      const snap = await db.collection('collections').where('date', '==', today).get();
      let total = 0;
      snap.forEach(d => {
        const data = d.data();
        if (data.createdBy === currentUser.email) total += Number(data.amount || 0);
      });
      document.getElementById('todayTotal').textContent = '₹' + total.toLocaleString('en-IN');
    } catch (e2) {
      document.getElementById('todayTotal').textContent = '₹0';
    }
  }
}

function doSearch() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const box = document.getElementById('results');

  if (q.length < 2) {
    box.innerHTML = '<div class="text-center text-slate-400 py-10 text-sm">குறைந்தது 2 எழுத்து type செய்யவும்</div>';
    return;
  }

  const matches = allCustomers.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.mobile || '').includes(q) ||
    (c.boxNo || '').toLowerCase().includes(q) ||
    (c.custId || '').toLowerCase().includes(q) ||
    (c.scNo || '').toLowerCase().includes(q) ||
    (c.smartCard || '').toLowerCase().includes(q)
  ).slice(0, 30);

  if (matches.length === 0) {
    box.innerHTML = '<div class="text-center text-slate-400 py-10 text-sm">யாரும் கிடைக்கவில்லை</div>';
    return;
  }

  box.innerHTML = matches.map(c => {
    const due = Number(c.dueAmt || c.due || 0);
    return `
    <div class="bg-white rounded-xl p-3 shadow-sm border border-slate-100 active:bg-emerald-50"
         onclick="openCollect('${c.id}')">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-semibold text-sm">${c.name || '-'}</div>
          <div class="text-xs text-slate-500 mt-0.5">${c.mobile || '-'} • ${c.boxNo || '-'}</div>
          <div class="text-xs text-slate-400">${c.custId || ''} • ${c.package || ''} • ${c.street || c.place || ''}</div>
        </div>
        <div class="text-right">
          <div class="text-sm font-bold ${due > 0 ? 'text-red-600' : 'text-slate-400'}">₹${due}</div>
          <div class="text-xs text-emerald-600 mt-1">Collect →</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openCollect(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  selectedCustomer = c;
  const due = Number(c.dueAmt || c.due || 0);

  document.getElementById('modalName').textContent = c.name || '-';
  document.getElementById('modalInfo').textContent =
    `${c.mobile || '-'} | Box: ${c.boxNo || '-'} | ${c.package || ''} | ${c.custId || ''}`;
  document.getElementById('modalDue').textContent = '₹' + due.toLocaleString('en-IN');
  document.getElementById('colAmount').value = due > 0 ? due : (c.packageAmt || '');
  document.getElementById('colMode').value = 'Cash';
  document.getElementById('colRemarks').value = '';
  document.getElementById('collectModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('colAmount').focus(), 200);
}

function closeModal() {
  document.getElementById('collectModal').classList.add('hidden');
  selectedCustomer = null;
}

async function saveCollection() {
  if (!selectedCustomer) return;
  const amount = Number(document.getElementById('colAmount').value);
  if (!amount || amount <= 0) {
    showToast('சரியான amount உள்ளிடவும்', true);
    return;
  }

  const btn = document.getElementById('saveColBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const today = new Date().toISOString().split('T')[0];
  const data = {
    customerId: selectedCustomer.id,
    custId: selectedCustomer.custId || '',
    customerName: selectedCustomer.name || '',
    amount,
    date: today,
    mode: document.getElementById('colMode').value,
    remarks: document.getElementById('colRemarks').value.trim(),
    package: selectedCustomer.package || '',
    boxNo: selectedCustomer.boxNo || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser.email,
    source: 'agent-app'
  };

  try {
    await db.collection('collections').add(data);

    // Reduce due
    const currentDue = Number(selectedCustomer.dueAmt || selectedCustomer.due || 0);
    const newDue = Math.max(0, currentDue - amount);
    await db.collection('customers').doc(selectedCustomer.id).update({
      dueAmt: newDue,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Update local
    selectedCustomer.dueAmt = newDue;
    const idx = allCustomers.findIndex(x => x.id === selectedCustomer.id);
    if (idx >= 0) allCustomers[idx].dueAmt = newDue;

    showToast('₹' + amount + ' saved!');
    closeModal();
    doSearch();
    loadTodayTotal();
  } catch (err) {
    showToast('Error: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Collection';
  }
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden', 'bg-red-600', 'bg-emerald-700');
  t.classList.add(isError ? 'bg-red-600' : 'bg-emerald-700');
  setTimeout(() => t.classList.add('hidden'), 2500);
}
