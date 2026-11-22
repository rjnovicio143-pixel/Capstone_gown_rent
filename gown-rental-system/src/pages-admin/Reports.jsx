import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  FileChartLine, PieChart as PieIcon, TrendingUp, Calendar,
  ArrowUpRight, History, Search, Download, Package,
  AlertTriangle, UserCheck, Banknote, Users, Boxes
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { downloadWorkbook } from '../utils/exportWorkbook';
import Header from '../components/Header';
import '../styles/Reports.css';

/* ---------- HELPERS ---------- */
const num = (v) => Number(v) || 0;
const sumAddons = (list) => (list || []).reduce((s, a) => s + num(a.price), 0);
// 0 is a real value (= no penalty), so never use "|| 500"
const numOr = (v, d) => (v === null || v === undefined || v === '' ? d : (Number.isFinite(Number(v)) ? Number(v) : d));
const fc = (amt) => `₱${new Intl.NumberFormat('en-PH').format(amt || 0)}`;

/* ---------- PENALTY (same rule as the Customers page) ----------
   While a gown is claimed and late, the penalty grows every day:
   days 1 to 3 cost the daily rate, every day after that costs double.
   Tip: move these two helpers to a shared file (e.g. utils/penalty.js) so
   Customers and Reports can never get out of sync. */
const accruedPenalty = (b) => {
  if (!b || b.returnStatus !== 'claimed' || !b.returnDate) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(b.returnDate); due.setHours(0, 0, 0, 0);
  if (today <= due) return 0;

  const rate = numOr(b.penaltyRate, 500);
  if (rate <= 0) return 0;
  const days = Math.ceil((today - due) / 86400000);
  let total = 0;
  for (let i = 1; i <= days; i++) total += i > 3 ? rate * 2 : rate;
  return total;
};

// Penalty that is still unpaid
const unpaidPenalty = (b) => {
  if (b.returnStatus === 'claimed') {
    if (b.isPenaltySettled) return 0; // older records
    return Math.max(0, accruedPenalty(b) - num(b.penaltyPaid));
  }
  return num(b.penalty); // returned or cancelled: the stored unpaid amount
};

const mapBooking = (row) => ({
  id: row.id, name: row.name, contact: row.contact,
  gownId: row.gown_id, gownName: row.gown_name,
  bookingDate: row.booking_date,
  reservationDate: row.reservation_date,
  returnDate: row.return_date,
  rentalPrice: row.rental_price,
  down: row.down, deposit: row.deposit,
  assistedBy: row.assisted_by,
  commissions: row.commissions,
  returnStatus: row.return_status,
  penalty: row.penalty, penaltyPaid: row.penalty_paid,
  penaltyRate: row.penalty_rate,
  isPenaltySettled: row.is_penalty_settled,
  petticoatPrice: row.petticoat_price || 0,
  addons: row.addons || [],
  swapCharges: row.swap_charges || 0,
  discount: row.discount || 0, totalRent: row.total_rent, balance: row.balance,
  createdAt: row.created_at ? new Date(row.created_at) : null,
});

const PIE_COLORS = ['#b8860b', '#ff416c', '#9333ea'];

const Reports = () => {
  const [bookings, setBookings] = useState([]);
  const [gowns, setGowns]       = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [petticoats, setPetticoats]   = useState([]);
  const [weddings, setWeddings]       = useState([]);
  const [invTab, setInvTab]           = useState('gowns');
  const [invSearch, setInvSearch]     = useState('');
  const EXPORT_OPTIONS = ['Summary', 'Gowns & Suits', 'Accessories', 'Petticoats', 'Customers', 'Rentals', 'Wedding Packages'];
  const TAB_SHEET = { gowns: 'Gowns & Suits', accessories: 'Accessories', petticoats: 'Petticoats', customers: 'Customers', weddings: 'Wedding Packages' };
  const [timeFilter, setTimeFilter] = useState('week');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    const [bRes, gRes, aRes, pRes, wRes] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('gowns').select('*').order('name'),
      supabase.from('accessories').select('*').order('name'),
      supabase.from('petticoats').select('*').order('layer'),
      supabase.from('wedding_reservations').select('*'),
    ]);
    if (!aRes.error) setAccessories(aRes.data || []);
    if (!pRes.error) setPetticoats(pRes.data || []);
    if (!wRes.error) setWeddings((wRes.data || []).filter(w => w.status !== 'cancelled'));
    if (bRes.error) console.error('Error fetching bookings:', bRes.error);
    else setBookings(bRes.data.map(mapBooking));
    if (gRes.error) console.error('Error fetching gowns:', gRes.error);
    else setGowns(gRes.data);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Financial calcs ──
  // Staff commission is an expense paid to staff, so it is NOT counted as cash collected.
  const rentalCollected  = bookings.reduce((a, b) => a + num(b.down), 0);
  const totalPenaltyPaid = bookings.reduce((a, b) => a + num(b.penaltyPaid), 0);
  const totalSwapCharges = bookings.reduce((a, b) => a + num(b.swapCharges), 0);
  const totalCash        = rentalCollected + totalPenaltyPaid + totalSwapCharges;

  const totalStockUnits = gowns.reduce((a, g) => a + num(g.stock), 0);
  const outOfStock      = gowns.filter(g => num(g.stock) === 0);
  const outAccessories  = accessories.filter(a => num(a.stock) === 0);
  const outTotal        = outOfStock.length + outAccessories.length;
  const itemsTotal      = gowns.length + accessories.length;

  // ── Revenue trend ──
  // Every bucket is built from the calendar (not from "today minus i"), so the
  // month view stays correct on days like the 31st.
  const revenueTrend = useMemo(() => {
    const now = new Date();
    const steps = timeFilter === 'day' ? 24 : timeFilter === 'week' ? 7 : timeFilter === 'month' ? 30 : 12;

    return [...Array(steps)].map((_, i) => {
      let label = '';
      let inBucket;

      if (timeFilter === 'day') {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - i);
        label = `${d.getHours()}:00`;
        inBucket = (c) =>
          c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth() &&
          c.getDate() === d.getDate() && c.getHours() === d.getHours();
      } else if (timeFilter === 'week' || timeFilter === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        inBucket = (c) => c.toDateString() === d.toDateString();
      } else {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        label = d.toLocaleDateString('en-US', { month: 'short' });
        inBucket = (c) => c.getMonth() === d.getMonth() && c.getFullYear() === d.getFullYear();
      }

      const rows = bookings.filter(b => b.createdAt && inBucket(b.createdAt));
      return {
        name: label,
        rental:  rows.reduce((a, b) => a + num(b.down), 0),
        penalty: rows.reduce((a, b) => a + num(b.penaltyPaid), 0),
      };
    }).reverse();
  }, [bookings, timeFilter]);

  const inventoryByCategory = useMemo(() => {
    const totals = {};
    gowns.forEach(g => { const cat = g.category || 'Other'; totals[cat] = (totals[cat] || 0) + num(g.stock); });
    return Object.entries(totals).map(([name, stock]) => ({ name, stock }));
  }, [gowns]);

  const pieData = [
    { name: 'Rental',  value: rentalCollected },
    { name: 'Penalty', value: totalPenaltyPaid },
    { name: 'Swaps',   value: totalSwapCharges },
  ];
  const hasRevenue = pieData.some(d => d.value > 0);

  const activeReservations = bookings.filter(b => b.returnStatus === 'reserved' || b.returnStatus === 'claimed');

  // Includes late gowns that are still claimed (their penalty is calculated live)
  const penaltyRecords = useMemo(
    () => bookings
      .map(b => ({ ...b, unpaid: unpaidPenalty(b) }))
      .filter(b => b.unpaid > 0 || num(b.penaltyPaid) > 0),
    [bookings]
  );

  const term = searchTerm.trim().toLowerCase();
  const filteredHistory = bookings.filter(b =>
    !term ||
    b.name?.toLowerCase().includes(term) ||
    b.gownName?.toLowerCase().includes(term)
  );

  /* ---------- INVENTORY SUMMARY (text only, no photos) ---------- */
  const gownCode = (id) => gowns.find(g => String(g.id) === String(id))?.code || '';
  const accName = (id) => accessories.find(a => String(a.id) === String(id))?.name || '';
  const stockState = (n) => (num(n) < 1 ? 'Out of stock' : num(n) <= 1 ? 'Low (1 left)' : 'Available');

  /* ---------- CUSTOMER SUMMARY (one row per customer) ---------- */
  const customerRows = useMemo(() => {
    const map = new Map();
    bookings.forEach(b => {
      const key = `${(b.name || '').trim().toLowerCase()}|${(b.contact || '').trim()}`;
      if (!map.has(key)) map.set(key, { name: b.name, contact: b.contact || '', rentals: 0, active: 0, value: 0, paid: 0, unpaidPenalty: 0, last: null });
      const c = map.get(key);
      const cancelled = b.returnStatus === 'cancelled';
      if (!cancelled) { c.rentals += 1; c.value += num(b.totalRent ?? b.rentalPrice); }
      if (b.returnStatus === 'reserved' || b.returnStatus === 'claimed') c.active += 1;
      c.paid += num(b.down) + num(b.penaltyPaid) + num(b.swapCharges);
      c.unpaidPenalty += unpaidPenalty(b);
      if (b.createdAt && (!c.last || b.createdAt > c.last)) c.last = b.createdAt;
    });
    return [...map.values()].sort((a, b) => (b.last || 0) - (a.last || 0));
  }, [bookings]);

  const invRows = useMemo(() => {
    const t = invSearch.trim().toLowerCase();
    const hit = (...vals) => !t || vals.some(v => String(v ?? '').toLowerCase().includes(t));
    if (invTab === 'accessories') {
      return accessories.filter(a => hit(a.name, a.category)).map(a => ({
        key: a.id, cells: [a.name, a.category || '', fc(a.price), fc(a.swap_fee), num(a.stock), stockState(a.stock)],
        out: num(a.stock) < 1,
      }));
    }
    if (invTab === 'petticoats') {
      return petticoats.filter(p => hit(`Layer ${p.layer}`)).map(p => ({
        key: p.id ?? p.layer, cells: [`Layer ${p.layer}`, fc(p.price), fc(p.swap_fee), gowns.filter(g => num(g.petticoat_layer) === num(p.layer)).length],
        out: false,
      }));
    }
    if (invTab === 'customers') {
      return customerRows.filter(c => hit(c.name, c.contact)).map(c => ({
        key: `${c.name}|${c.contact}`,
        cells: [c.name, c.contact || '—', c.rentals, c.active, fc(c.value), fc(c.paid), c.unpaidPenalty > 0 ? fc(c.unpaidPenalty) : '—', c.last ? c.last.toLocaleDateString() : '—'],
        out: false,
      }));
    }
    if (invTab === 'weddings') {
      return weddings.filter(w => hit(w.name, w.package_name, w.status)).map(w => ({
        key: w.id, cells: [w.wedding_date || '—', w.name || '', w.package_name || '', fc(w.package_price), fc(w.downpayment), fc(Math.max(0, num(w.package_price) - num(w.downpayment))), w.status || ''],
        out: false,
      }));
    }
    return gowns.filter(g => hit(g.code, g.name, g.category)).map(g => ({
      key: g.id, cells: [g.code || '—', g.name, g.category || '', g.type === 'suit' ? "Men's suit" : 'Gown', g.size || '—', fc(g.price), num(g.stock), stockState(g.stock), g.is_posted ? 'Posted' : 'Draft'],
      out: num(g.stock) < 1,
    }));
  }, [invTab, invSearch, gowns, accessories, petticoats, customerRows, weddings]);

  const INV_HEADS = {
    gowns: ['Code', 'Name', 'Category', 'Type', 'Sizes / Ages', 'Price', 'Stock', 'Status', 'Posted'],
    accessories: ['Name', 'Category', 'Price', 'Swap fee', 'Stock', 'Status'],
    petticoats: ['Layer', 'Price', 'Swap fee', 'Used by gowns'],
    customers: ['Customer', 'Contact', 'Rentals', 'Active now', 'Rental value', 'Total paid', 'Unpaid penalty', 'Last booking'],
    weddings: ['Wedding date', 'Name', 'Package', 'Package price', 'Downpayment', 'Balance', 'Wedding status'],
  };

  // ── Export: one Excel file, one sheet per topic (text and numbers only) ──
  const handleExport = (picked = EXPORT_OPTIONS) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const weddingValue = weddings.reduce((a, w) => a + num(w.package_price), 0);
    const weddingPaid  = weddings.reduce((a, w) => a + num(w.downpayment), 0);
    const unpaidPen    = bookings.reduce((a, b) => a + unpaidPenalty(b), 0);
    const posted       = gowns.filter(g => g.is_posted).length;

    const summaryRows = [
      ['INVENTORY', ''],
      ['Gowns & suits (total)', gowns.length],
      ['Posted on the website', posted],
      ['Draft (not posted)', gowns.length - posted],
      ['Gowns & suits out of stock', outOfStock.length],
      ['Total gown stock (pieces)', totalStockUnits],
      ['Accessories (types)', accessories.length],
      ['Accessories out of stock', outAccessories.length],
      ['Petticoat layers', petticoats.length],
      ['CUSTOMERS & RENTALS', ''],
      ['Customers', customerRows.length],
      ['Rentals (not cancelled)', bookings.filter(b => b.returnStatus !== 'cancelled').length],
      ['Active rentals (reserved / claimed)', activeReservations.length],
      ['MONEY', ''],
      ['Rental downpayments collected', rentalCollected],
      ['Penalty paid', totalPenaltyPaid],
      ['Swap charges', totalSwapCharges],
      ['Cash collected (rentals)', totalCash],
      ['Wedding reservations', weddings.length],
      ['Wedding package value', weddingValue],
      ['Wedding downpayments collected', weddingPaid],
      ['Cash collected (rentals + weddings)', totalCash + weddingPaid],
      ['Penalty still unpaid', unpaidPen],
    ];
    const moneyRows = [14, 15, 16, 17, 19, 20, 21, 22];

    const sheets = [
      { name: 'Summary', title: 'Mrs. G Gown Rental — Shop Report', note: `Generated ${new Date().toLocaleString()}`, headers: ['Item', 'Value'], rows: summaryRows, moneyRows, label: true },
      {
        name: 'Gowns & Suits',
        headers: ['Code', 'Name', 'Type', 'Category', 'Sizes / Ages', 'Price (₱)', 'Discount (%)', 'Stock', 'Status', 'Posted', 'Petticoat layer', 'Included accessories'],
        rows: gowns.map(g => [
          g.code || '', g.name, g.type === 'suit' ? "Men's suit" : 'Gown', g.category || '', g.size || '',
          num(g.price), num(g.discount_percent), num(g.stock), stockState(g.stock), g.is_posted ? 'Posted' : 'Draft',
          g.petticoat_layer ? `Layer ${g.petticoat_layer}` : '', (g.included_accessories || []).map(accName).filter(Boolean).join(', '),
        ]),
        money: [5], totals: [7],
      },
      {
        name: 'Accessories',
        headers: ['Name', 'Category', 'Price (₱)', 'Swap fee (₱)', 'Stock', 'Status', 'Used by gowns'],
        rows: accessories.map(a => [a.name, a.category || '', num(a.price), num(a.swap_fee), num(a.stock), stockState(a.stock),
          gowns.filter(g => (g.included_accessories || []).includes(a.id)).length]),
        money: [2, 3], totals: [4],
      },
      {
        name: 'Petticoats',
        headers: ['Layer', 'Price (₱)', 'Swap fee (₱)', 'Used by gowns'],
        rows: petticoats.map(p => [`Layer ${p.layer}`, num(p.price), num(p.swap_fee), gowns.filter(g => num(g.petticoat_layer) === num(p.layer)).length]),
        money: [1, 2],
      },
      {
        name: 'Customers',
        headers: ['Customer', 'Contact', 'Rentals', 'Active now', 'Total rental value (₱)', 'Total paid (₱)', 'Unpaid penalty (₱)', 'Last booking'],
        rows: customerRows.map(c => [c.name, c.contact, c.rentals, c.active, c.value, c.paid, c.unpaidPenalty, c.last ? c.last.toLocaleDateString() : '']),
        money: [4, 5, 6], totals: [2, 4, 5, 6],
      },
      {
        name: 'Rentals',
        headers: ['Booked on', 'Customer', 'Contact', 'Gown code', 'Gown', 'Status', 'Reservation date', 'Return date', 'Rental price (₱)', 'Petticoat (₱)', 'Add-ons (₱)', 'Swap charges (₱)', 'Discount (₱)', 'Total (₱)', 'Downpayment (₱)', 'Balance (₱)', 'Deposit (₱)', 'Penalty paid (₱)', 'Penalty unpaid (₱)', 'Staff commission (₱)', 'Assisted by'],
        rows: bookings.map(b => [
          b.createdAt ? b.createdAt.toLocaleDateString() : '', b.name, b.contact || '', gownCode(b.gownId), b.gownName || '', b.returnStatus || '',
          b.reservationDate || '', b.returnDate || '', num(b.rentalPrice), num(b.petticoatPrice), sumAddons(b.addons), num(b.swapCharges), num(b.discount),
          num(b.totalRent ?? b.rentalPrice), num(b.down), num(b.balance), num(b.deposit), num(b.penaltyPaid), unpaidPenalty(b), num(b.commissions), b.assistedBy || '',
        ]),
        money: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], totals: [8, 13, 14, 17, 18],
      },
      {
        name: 'Wedding Packages',
        headers: ['Wedding date', 'Name', 'Package', 'Package price (₱)', 'Downpayment (₱)', 'Balance (₱)', 'Status'],
        rows: weddings.map(w => [w.wedding_date || '', w.name || '', w.package_name || '', num(w.package_price), num(w.downpayment), Math.max(0, num(w.package_price) - num(w.downpayment)), w.status || '']),
        money: [3, 4, 5], totals: [3, 4, 5],
      },
    ];
    const chosen = sheets.filter(sh => picked.includes(sh.name));
    if (!chosen.length) return;
    downloadWorkbook(`MrsG_Shop_Report_${stamp}.xlsx`, chosen);
  };

  return (
    <>
      <Header />
      <div className="reports-wrapper">
        {/* HERO */}
        <div className="reports-hero">
          <div>
            <h1>Financial Reports & Analytics</h1>
            <p>Revenue, inventory, and transaction summary</p>
          </div>
          <button className="btn-export-excel" onClick={() => handleExport()}>
            <Download size={16} /> Export all (Excel)
          </button>
        </div>

        {/* STATS */}
        <div className="reports-stats-grid">
          <div className="report-card-stat gold-border-active">
            <div className="report-icon-circle orange-bg"><TrendingUp size={18} color="white" /></div>
            <div className="report-stat-content"><span>Cash Collected</span><h2 className="color-orange">{fc(totalCash)}</h2></div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle gold-bg"><Calendar size={18} color="white" /></div>
            <div className="report-stat-content"><span>Rental Income</span><h2 className="color-gold">{fc(rentalCollected)}</h2></div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle red-bg"><ArrowUpRight size={18} color="white" /></div>
            <div className="report-stat-content"><span>Penalty Earnings</span><h2 className="color-red">{fc(totalPenaltyPaid)}</h2></div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle blue-bg"><Banknote size={18} color="white" /></div>
            <div className="report-stat-content"><span>Swap Charges</span><h2 className="color-blue">{fc(totalSwapCharges)}</h2></div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle gray-bg"><Package size={18} color="white" /></div>
            <div className="report-stat-content"><span>Total Stock</span><h2 className="color-gray">{totalStockUnits}</h2></div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle red-bg"><AlertTriangle size={18} color="white" /></div>
            <div className="report-stat-content"><span>Out of Stock</span><h2 className="color-red">{outTotal}/{itemsTotal}</h2></div>
          </div>
        </div>

        {/* REVENUE CHART */}
        <div className="reports-main-layout">
          <div className="report-visual-card chart-wide">
            <div className="report-visual-header">
              <div className="header-title"><FileChartLine size={17} color="#b8860b" /><h3>Revenue Trends</h3></div>
              <div className="report-filters">
                {['day','week','month','year'].map(f => (
                  <button key={f} className={`rep-filter-btn ${timeFilter === f ? 'is-active' : ''}`} onClick={() => setTimeFilter(f)}>{f.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueTrend} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => fc(v)} cursor={{ fill: 'rgba(184,134,11,0.06)' }} />
                <Legend verticalAlign="top" align="right" height={36} />
                <Bar name="Rental" dataKey="rental" fill="#b8860b" radius={[6,6,0,0]} maxBarSize={28} />
                <Bar name="Penalty" dataKey="penalty" fill="#ff416c" radius={[6,6,0,0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* PIE */}
          <div className="report-visual-card chart-narrow">
            <div className="report-visual-header">
              <div className="header-title"><PieIcon size={17} color="#b8860b" /><h3>Revenue Share</h3></div>
            </div>
            {hasRevenue ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value">
                      {pieData.map((d, i) => <Cell key={d.name} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fc(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="rep-legend">
                  <div className="rep-leg-item"><span className="dot-gold" /> Rental</div>
                  <div className="rep-leg-item"><span className="dot-red" /> Penalty</div>
                  <div className="rep-leg-item"><span className="dot-purple" /> Swaps</div>
                </div>
              </>
            ) : (
              <p className="rep-empty-text">No revenue yet.</p>
            )}
          </div>
        </div>

        {/* INVENTORY CHART */}
        <div className="reports-main-layout">
          <div className="report-visual-card chart-wide">
            <div className="report-visual-header">
              <div className="header-title"><Package size={17} color="#b8860b" /><h3>Stock by Category</h3></div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={inventoryByCategory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar name="Stock" dataKey="stock" fill="#2193b0" radius={[6,6,0,0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="report-visual-card chart-narrow">
            <div className="report-visual-header">
              <div className="header-title"><AlertTriangle size={17} color="#ff416c" /><h3>Out of Stock</h3></div>
            </div>
            <div className="rep-summary-list">
              {outOfStock.length > 0
                ? [...outOfStock.map(g => ({ id: `g${g.id}`, name: g.name, kind: 'Gown' })),
                   ...outAccessories.map(a => ({ id: `a${a.id}`, name: a.name, kind: 'Accessory' }))].map(g => (
                    <div key={g.id} className="rep-summary-row">
                      <div className="rep-summary-left">
                        <span className="rep-summary-name">{g.name}</span>
                        <span className="rep-summary-sub">{g.kind}</span>
                      </div>
                      <span className="badge badge-out">0 stock</span>
                    </div>
                  ))
                : <p className="rep-empty-text">Walay out-of-stock. 🎉</p>
              }
            </div>
          </div>
        </div>

        {/* SUMMARIES */}
        <div className="reports-main-layout reports-summary-layout">
          <div className="report-visual-card">
            <div className="report-visual-header">
              <div className="header-title"><UserCheck size={17} color="#b8860b" /><h3>Active Renters</h3></div>
            </div>
            <div className="rep-summary-list">
              {activeReservations.length > 0
                ? activeReservations.map(b => (
                    <div key={b.id} className="rep-summary-row">
                      <div className="rep-summary-left">
                        <span className="rep-summary-name">{b.name}</span>
                        <span className="rep-summary-sub">{b.gownName} · Return: {b.returnDate || 'N/A'}</span>
                      </div>
                      <span className={`badge ${b.returnStatus === 'claimed' ? 'badge-claimed' : 'badge-reserved'}`}>{b.returnStatus}</span>
                    </div>
                  ))
                : <p className="rep-empty-text">Walay aktibo karon.</p>
              }
            </div>
          </div>
          <div className="report-visual-card">
            <div className="report-visual-header">
              <div className="header-title"><AlertTriangle size={17} color="#ff416c" /><h3>Penalty Summary</h3></div>
            </div>
            <div className="rep-summary-list">
              {penaltyRecords.length > 0
                ? penaltyRecords.map(b => {
                    const paid = num(b.penaltyPaid);
                    const owing = b.unpaid > 0;
                    return (
                      <div key={b.id} className="rep-summary-row">
                        <div className="rep-summary-left">
                          <span className="rep-summary-name">{b.name}</span>
                          <span className="rep-summary-sub">
                            {b.gownName}{owing && paid > 0 ? ` · Paid ${fc(paid)}` : ''}
                          </span>
                        </div>
                        <div className="rep-summary-right">
                          <span className="rep-summary-amount">{fc(owing ? b.unpaid : paid)}</span>
                          <span className={`badge ${owing ? 'badge-pending' : 'badge-settled'}`}>{owing ? 'Pending' : 'Paid'}</span>
                        </div>
                      </div>
                    );
                  })
                : <p className="rep-empty-text">Walay penalty record.</p>
              }
            </div>
          </div>
        </div>

        {/* SHOP INVENTORY SUMMARY (no photos) */}
        <div className="report-visual-card table-card">
          <div className="report-visual-header">
            <div className="header-title"><Boxes size={17} color="#b8860b" /><h3>Shop Summary</h3></div>
            <div className="rep-card-tools">
            <button className="rep-export-tab" onClick={() => handleExport([TAB_SHEET[invTab]])}>
              <Download size={14} /> Export this table
            </button>
            <div className="rep-search-wrapper">
              <Search size={13} className="search-icon" />
              <input type="text" placeholder={invTab === 'customers' ? 'Search name or contact...' : invTab === 'weddings' ? 'Search name, package, status...' : 'Search code, name, category...'} value={invSearch} onChange={e => setInvSearch(e.target.value)} />
            </div>
            </div>
          </div>
          <div className="rep-chips">
            <span className="rep-chip">Gowns &amp; suits <b>{gowns.length}</b></span>
            <span className="rep-chip">Posted <b>{gowns.filter(g => g.is_posted).length}</b></span>
            <span className="rep-chip">Accessories <b>{accessories.length}</b></span>
            <span className="rep-chip">Petticoats <b>{petticoats.length}</b></span>
            <span className={`rep-chip ${outTotal ? 'bad' : ''}`}>Out of stock <b>{outTotal}</b></span>
          </div>
          <div className="rep-tabs">
            {[['gowns', 'Gowns & Suits', gowns.length], ['accessories', 'Accessories', accessories.length], ['petticoats', 'Petticoats', petticoats.length], ['customers', 'Customers', customerRows.length], ['weddings', 'Wedding Packages', weddings.length]].map(([id, label, n]) => (
              <button key={id} className={invTab === id ? 'active' : ''} onClick={() => { setInvTab(id); setInvSearch(''); }}>{label} <span>{n}</span></button>
            ))}
          </div>
          <div className="rep-table-container">
            <table className="rep-main-table">
              <thead><tr>{INV_HEADS[invTab].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {invRows.map(r => (
                  <tr key={r.key} className={r.out ? 'rep-row-out' : ''}>
                    {r.cells.map((c, i) => {
                      const head = INV_HEADS[invTab][i];
                      if (head === 'Status') return <td key={i}><span className={`badge ${c === 'Out of stock' ? 'badge-out' : c.startsWith('Low') ? 'badge-reserved' : 'badge-settled'}`}>{c}</span></td>;
                      if (head === 'Active now') return <td key={i}>{c > 0 ? <span className="badge badge-claimed">{c}</span> : '—'}</td>;
                      if (head === 'Unpaid penalty') return <td key={i} className={c !== '—' ? 'color-red' : ''}>{c}</td>;
                      if (head === 'Customer') return <td key={i} className="customer-name">{c}</td>;
                      if (head === 'Wedding status') return <td key={i}><span className="badge badge-reserved">{c}</span></td>;
                      if (head === 'Posted') return <td key={i}><span className={`badge ${c === 'Posted' ? 'badge-settled' : 'badge-claimed'}`}>{c}</span></td>;
                      if (head === 'Code') return <td key={i}>{c !== '—' ? <span className="rep-code">{c}</span> : '—'}</td>;
                      return <td key={i} className={i === 1 && invTab === 'gowns' ? 'customer-name' : ''}>{c}</td>;
                    })}
                  </tr>
                ))}
                {invRows.length === 0 && <tr><td colSpan={INV_HEADS[invTab].length} className="rep-empty-text">Nothing found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* TRANSACTION TABLE */}
        <div className="report-visual-card table-card">
          <div className="report-visual-header">
            <div className="header-title"><History size={17} color="#b8860b" /><h3>Transaction History</h3></div>
            <div className="rep-search-wrapper">
              <Search size={13} className="search-icon" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="rep-table-container">
            <table className="rep-main-table">
              <thead>
                <tr><th>Date</th><th>Customer</th><th>Gown</th><th>Add-ons</th><th>Rental</th><th>Penalty</th><th>Swaps</th><th>Total</th></tr>
              </thead>
              <tbody>
                {filteredHistory.map(b => {
                  const addonsTotal = sumAddons(b.addons) + num(b.petticoatPrice);
                  // Same money as the "Cash Collected" card: rental + penalty + swaps (no commission)
                  const rowTotal = num(b.down) + num(b.penaltyPaid) + num(b.swapCharges);
                  return (
                    <tr key={b.id}>
                      <td>{b.createdAt?.toLocaleDateString()}</td>
                      <td className="customer-name">{b.name}</td>
                      <td>{b.gownName}</td>
                      <td className="color-gold">{addonsTotal > 0 ? fc(addonsTotal) : '—'}</td>
                      <td className="color-gold">{fc(b.down)}</td>
                      <td className="color-red">{fc(b.penaltyPaid)}</td>
                      <td className="color-blue">{num(b.swapCharges) > 0 ? fc(b.swapCharges) : '—'}</td>
                      <td className="total-cell">{fc(rowTotal)}</td>
                    </tr>
                  );
                })}
                {filteredHistory.length === 0 && (
                  <tr><td colSpan="8" className="rep-empty-text">No transactions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default Reports;