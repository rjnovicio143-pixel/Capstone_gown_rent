import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  FileChartLine, PieChart as PieIcon, TrendingUp, Calendar,
  ArrowUpRight, History, Search, Download, Package,
  AlertTriangle, UserCheck, Banknote
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import Header from '../components/Header';
import '../styles/Reports.css';

/* ---------- HELPERS ---------- */
const num = (v) => Number(v) || 0;
const sumAddons = (list) => (list || []).reduce((s, a) => s + num(a.price), 0);
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

  const rate = num(b.penaltyRate) || 500;
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
  createdAt: row.created_at ? new Date(row.created_at) : null,
});

const PIE_COLORS = ['#b8860b', '#ff416c', '#9333ea'];

const Reports = () => {
  const [bookings, setBookings] = useState([]);
  const [gowns, setGowns]       = useState([]);
  const [timeFilter, setTimeFilter] = useState('week');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    const [bRes, gRes] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('gowns').select('*').order('name'),
    ]);
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

  // ── Export ──
  const handleExport = () => {
    const bookingSheet = bookings.map(b => ({
      Date: b.createdAt?.toLocaleDateString(),
      Customer: b.name, Contact: b.contact, Gown: b.gownName,
      Status: b.returnStatus, 'Booking Date': b.bookingDate,
      'Return Date': b.returnDate || '',
      'Rental Price': num(b.rentalPrice),
      'Addons Price': sumAddons(b.addons),
      'Petticoat': num(b.petticoatPrice),
      'Swap Charges': num(b.swapCharges),
      Downpayment: num(b.down), Deposit: num(b.deposit),
      'Penalty Paid': num(b.penaltyPaid),
      'Penalty Unpaid': unpaidPenalty(b),
      'Staff Commission': num(b.commissions),
    }));
    const inventorySheet = gowns.map(g => ({
      Name: g.name, Category: g.category, Size: g.size,
      Price: g.price, Stock: g.stock, Status: g.status,
      Posted: g.is_posted ? 'Yes' : 'No',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookingSheet), 'Bookings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inventorySheet), 'Inventory');
    XLSX.writeFile(wb, `MrsG_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          <button className="btn-export-excel" onClick={handleExport}>
            <Download size={16} /> Export to Excel
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
            <div className="report-stat-content"><span>Out of Stock</span><h2 className="color-red">{outOfStock.length}/{gowns.length}</h2></div>
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
                ? outOfStock.map(g => (
                    <div key={g.id} className="rep-summary-row">
                      <span className="rep-summary-name">{g.name}</span>
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