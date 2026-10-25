import { useState, useEffect } from 'react';
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

const Reports = () => {
  const [bookings, setBookings] = useState([]);
  const [gowns, setGowns]       = useState([]);
  const [timeFilter, setTimeFilter] = useState('week');
  const [searchTerm, setSearchTerm] = useState('');

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
    isPenaltySettled: row.is_penalty_settled,
    petticoatPrice: row.petticoat_price || 0,
    addons: row.addons || [],
    swapCharges: row.swap_charges || 0,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  });

  const fetchData = async () => {
    const [bRes, gRes] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('gowns').select('*').order('name'),
    ]);
    if (!bRes.error) setBookings(bRes.data.map(mapBooking));
    if (!gRes.error) setGowns(gRes.data);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Financial calcs ──
  const rentalCollected  = bookings.reduce((a, b) => a + (Number(b.down) || 0), 0);
  const totalPenaltyPaid = bookings.reduce((a, b) => a + (Number(b.penaltyPaid) || 0), 0);
  const totalCommissions = bookings.reduce((a, b) => a + (Number(b.commissions) || 0), 0);
  const totalSwapCharges = bookings.reduce((a, b) => a + (Number(b.swapCharges) || 0), 0);
  const totalCash        = rentalCollected + totalPenaltyPaid + totalCommissions + totalSwapCharges;

  const totalStockUnits  = gowns.reduce((a, g) => a + (Number(g.stock) || 0), 0);
  const outOfStockCount  = gowns.filter(g => (g.stock || 0) === 0).length;

  // ── Revenue trend ──
  const getRevenueTrend = () => {
    const now  = new Date();
    const iter = timeFilter === 'day' ? 24 : timeFilter === 'week' ? 7 : timeFilter === 'month' ? 30 : 12;
    return [...Array(iter)].map((_, i) => {
      const d = new Date();
      let label = '', filtered = [];
      if (timeFilter === 'day') {
        d.setHours(now.getHours() - i);
        label = `${d.getHours()}:00`;
        filtered = bookings.filter(b => b.createdAt && b.createdAt.toDateString() === d.toDateString() && b.createdAt.getHours() === d.getHours());
      } else if (timeFilter === 'week' || timeFilter === 'month') {
        d.setDate(now.getDate() - i);
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        filtered = bookings.filter(b => b.createdAt && b.createdAt.toDateString() === d.toDateString());
      } else {
        d.setMonth(now.getMonth() - i);
        label = d.toLocaleDateString('en-US', { month: 'short' });
        filtered = bookings.filter(b => b.createdAt && b.createdAt.getMonth() === d.getMonth() && b.createdAt.getFullYear() === d.getFullYear());
      }
      return {
        name: label,
        rental:  filtered.reduce((a, b) => a + (Number(b.down) || 0), 0),
        penalty: filtered.reduce((a, b) => a + (Number(b.penaltyPaid) || 0), 0),
      };
    }).reverse();
  };

  const getInventoryByCategory = () => {
    const totals = {};
    gowns.forEach(g => { const cat = g.category || 'Other'; totals[cat] = (totals[cat] || 0) + (Number(g.stock) || 0); });
    return Object.entries(totals).map(([name, stock]) => ({ name, stock }));
  };

  const activeReservations = bookings.filter(b => b.returnStatus === 'reserved' || b.returnStatus === 'claimed');
  const penaltyRecords     = bookings.filter(b => (Number(b.penalty) > 0) || (Number(b.penaltyPaid) > 0));
  const filteredHistory    = bookings.filter(b =>
    b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.gownName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const fc = (amt) => `₱${new Intl.NumberFormat('en-PH').format(amt || 0)}`;

  // ── Export ──
  const handleExport = () => {
    const bookingSheet = bookings.map(b => ({
      Date: b.createdAt?.toLocaleDateString(),
      Customer: b.name, Contact: b.contact, Gown: b.gownName,
      Status: b.returnStatus, 'Booking Date': b.bookingDate,
      'Return Date': b.returnDate || '',
      'Rental Price': b.rentalPrice,
      'Addons Price': (b.addons || []).reduce((s, a) => s + Number(a.price), 0),
      'Petticoat': b.petticoatPrice || 0,
      'Swap Charges': b.swapCharges || 0,
      Downpayment: b.down, Deposit: b.deposit,
      Penalty: b.penaltyPaid, Commission: b.commissions,
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
            <div className="report-stat-content"><span>Out of Stock</span><h2 className="color-red">{outOfStockCount}/{gowns.length}</h2></div>
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
              <BarChart data={getRevenueTrend()} barGap={4}>
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
            <div className="report-visual-header"><PieIcon size={17} color="#b8860b" /><h3>Revenue Share</h3></div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={[
                  { name: 'Rental',     value: rentalCollected },
                  { name: 'Penalty',    value: totalPenaltyPaid },
                  { name: 'Commission', value: totalCommissions },
                  { name: 'Swaps',      value: totalSwapCharges },
                ]} innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value">
                  <Cell fill="#b8860b" /><Cell fill="#ff416c" /><Cell fill="#2193b0" /><Cell fill="#9333ea" />
                </Pie>
                <Tooltip formatter={(v) => fc(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="rep-legend">
              <div className="rep-leg-item"><span className="dot-gold" /> Rental</div>
              <div className="rep-leg-item"><span className="dot-red"  /> Penalty</div>
              <div className="rep-leg-item"><span className="dot-blue" /> Commission</div>
              <div className="rep-leg-item"><span style={{width:10,height:10,borderRadius:'50%',background:'#9333ea',display:'inline-block'}} /> Swaps</div>
            </div>
          </div>
        </div>

        {/* INVENTORY CHART */}
        <div className="reports-main-layout">
          <div className="report-visual-card chart-wide">
            <div className="report-visual-header">
              <div className="header-title"><Package size={17} color="#b8860b" /><h3>Stock by Category</h3></div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={getInventoryByCategory()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar name="Stock" dataKey="stock" fill="#2193b0" radius={[6,6,0,0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="report-visual-card chart-narrow">
            <div className="report-visual-header"><AlertTriangle size={17} color="#ff416c" /><h3>Out of Stock</h3></div>
            <div className="rep-summary-list">
              {gowns.filter(g => (g.stock || 0) === 0).length > 0
                ? gowns.filter(g => (g.stock || 0) === 0).map(g => (
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
                ? penaltyRecords.map(b => (
                    <div key={b.id} className="rep-summary-row">
                      <div className="rep-summary-left">
                        <span className="rep-summary-name">{b.name}</span>
                        <span className="rep-summary-sub">{b.gownName}</span>
                      </div>
                      <div className="rep-summary-right">
                        <span className="rep-summary-amount">{fc(b.isPenaltySettled ? b.penaltyPaid : b.penalty)}</span>
                        <span className={`badge ${b.isPenaltySettled ? 'badge-settled' : 'badge-pending'}`}>{b.isPenaltySettled ? 'Paid' : 'Pending'}</span>
                      </div>
                    </div>
                  ))
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
              <input type="text" placeholder="Search..." onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="rep-table-container">
            <table className="rep-main-table">
              <thead>
                <tr><th>Date</th><th>Customer</th><th>Gown</th><th>Add-ons</th><th>Rental</th><th>Penalty</th><th>Total</th></tr>
              </thead>
              <tbody>
                {filteredHistory.map(b => {
                  const addonsTotal = (b.addons || []).reduce((s, a) => s + Number(a.price), 0) + (b.petticoatPrice || 0);
                  const grandTotal = (Number(b.down) || 0) + (Number(b.penaltyPaid) || 0) + (Number(b.commissions) || 0);
                  return (
                    <tr key={b.id}>
                      <td>{b.createdAt?.toLocaleDateString()}</td>
                      <td className="customer-name">{b.name}</td>
                      <td>{b.gownName}</td>
                      <td className="color-gold">{addonsTotal > 0 ? fc(addonsTotal) : '—'}</td>
                      <td className="color-gold">{fc(b.down)}</td>
                      <td className="color-red">{fc(b.penaltyPaid || 0)}</td>
                      <td className="total-cell">{fc(grandTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default Reports;