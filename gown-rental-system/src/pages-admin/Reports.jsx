import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  FileChartLine, PieChart as PieIcon, TrendingUp, Calendar, ArrowUpRight, History, Search,
  Download, Package, AlertTriangle, UserCheck
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
  const [gowns, setGowns] = useState([]);
  const [timeFilter, setTimeFilter] = useState('week');
  const [searchTerm, setSearchTerm] = useState('');

  // --- DB ROW (snake_case) -> JS (camelCase) ---
  const mapBookingFromDb = (row) => ({
    id: row.id,
    name: row.name,
    contact: row.contact,
    gownId: row.gown_id,
    gownName: row.gown_name,
    bookingDate: row.booking_date,
    reservationDate: row.reservation_date,
    returnDate: row.return_date,
    rentalPrice: row.rental_price,
    down: row.down,
    deposit: row.deposit,
    assistedBy: row.assisted_by,
    commissions: row.commissions,
    returnStatus: row.return_status,
    penalty: row.penalty,
    penaltyPaid: row.penalty_paid,
    isPenaltySettled: row.is_penalty_settled,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  });

  const fetchBookings = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error("Error fetching bookings:", error);
    else setBookings(data.map(mapBookingFromDb));
  };

  const fetchGowns = async () => {
    const { data, error } = await supabase
      .from('gowns')
      .select('*')
      .order('name', { ascending: true });

    if (error) console.error("Error fetching gowns:", error);
    else setGowns(data);
  };

  useEffect(() => {
    fetchBookings();
    fetchGowns();
  }, []);

  // --- Financial Calculations ---
  const rentalCollected = bookings.reduce((acc, curr) => acc + (Number(curr.down) || 0), 0);
  const totalPenaltyPaid = bookings.reduce((acc, curr) => acc + (Number(curr.penaltyPaid) || 0), 0);
  const totalCommissions = bookings.reduce((acc, curr) => acc + (Number(curr.commissions) || 0), 0);
  const totalCash = rentalCollected + totalPenaltyPaid + totalCommissions;

  // --- Inventory Calculations ---
  const totalGowns = gowns.length;
  const totalStockUnits = gowns.reduce((acc, g) => acc + (Number(g.stock) || 0), 0);
  const outOfStockCount = gowns.filter(g => (g.stock || 0) === 0).length;

  const getRevenueTrend = () => {
    const now = new Date();
    let iterations = timeFilter === 'day' ? 24 : (timeFilter === 'week' ? 7 : (timeFilter === 'month' ? 30 : 12));

    return [...Array(iterations)].map((_, i) => {
      const d = new Date();
      let label = "";
      let filtered = [];

      if (timeFilter === 'day') {
        d.setHours(now.getHours() - i);
        label = `${d.getHours()}:00`;
        filtered = bookings.filter(b => {
          const bDate = b.createdAt;
          return bDate && bDate.toDateString() === d.toDateString() && bDate.getHours() === d.getHours();
        });
      } else if (timeFilter === 'week' || timeFilter === 'month') {
        d.setDate(now.getDate() - i);
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        filtered = bookings.filter(b => b.createdAt && b.createdAt.toDateString() === d.toDateString());
      } else if (timeFilter === 'year') {
        d.setMonth(now.getMonth() - i);
        label = d.toLocaleDateString('en-US', { month: 'short' });
        filtered = bookings.filter(b => {
          const bDate = b.createdAt;
          return bDate && bDate.getMonth() === d.getMonth() && bDate.getFullYear() === d.getFullYear();
        });
      }

      return {
        name: label,
        rental: filtered.reduce((acc, curr) => acc + (Number(curr.down) || 0), 0),
        penalty: filtered.reduce((acc, curr) => acc + (Number(curr.penaltyPaid) || 0), 0),
        commission: filtered.reduce((acc, curr) => acc + (Number(curr.commissions) || 0), 0)
      };
    }).reverse();
  };

  const getInventoryByCategory = () => {
    const totals = {};
    gowns.forEach(g => {
      const cat = g.category || 'Uncategorized';
      totals[cat] = (totals[cat] || 0) + (Number(g.stock) || 0);
    });
    return Object.entries(totals).map(([name, stock]) => ({ name, stock }));
  };

  // Naka-reserve o naka-claim karon (mga aktibo nga "renter")
  const activeReservations = bookings.filter(b => b.returnStatus === 'reserved' || b.returnStatus === 'claimed');

  // Tanan nga naay penalty (pending o napaid na)
  const penaltyRecords = bookings.filter(b => (Number(b.penalty) > 0) || (Number(b.penaltyPaid) > 0));

  const filteredHistory = bookings.filter(b =>
    b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.gownName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (amt) => `₱${new Intl.NumberFormat('en-PH').format(amt || 0)}`;

  // --- EXPORT TO EXCEL (Bookings + Inventory sa usa ka file, lain-laing sheet) ---
  const handleExportExcel = () => {
    const bookingSheetData = bookings.map(b => ({
      Date: b.createdAt ? b.createdAt.toLocaleDateString() : '',
      Customer: b.name,
      Contact: b.contact,
      Gown: b.gownName,
      Status: b.returnStatus,
      'Booking Date': b.bookingDate,
      'Reservation Date': b.reservationDate || '',
      'Return Date': b.returnDate || '',
      'Rental Price': b.rentalPrice,
      Downpayment: b.down,
      Deposit: b.deposit,
      Penalty: b.penalty,
      'Penalty Paid': b.penaltyPaid,
      Commission: b.commissions,
      'Assisted By': b.assistedBy,
    }));

    const inventorySheetData = gowns.map(g => ({
      Name: g.name,
      Category: g.category,
      Size: g.size,
      Price: g.price,
      Stock: g.stock,
      Status: g.status,
    }));

    const wb = XLSX.utils.book_new();
    const wsBookings = XLSX.utils.json_to_sheet(bookingSheetData);
    const wsInventory = XLSX.utils.json_to_sheet(inventorySheetData);
    XLSX.utils.book_append_sheet(wb, wsBookings, 'Bookings');
    XLSX.utils.book_append_sheet(wb, wsInventory, 'Inventory');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Gown_Rental_Report_${today}.xlsx`);
  };

  return (
    <>
      <Header />
      <div className="reports-wrapper">
        <div className="reports-hero">
          <div>
            <h1>Financial Reports & Analytics</h1>
            <p>Detailed breakdown of revenue, inventory, and transaction history</p>
          </div>
          <button className="btn-export-excel" onClick={handleExportExcel}>
            <Download size={16} /> Export to Excel
          </button>
        </div>

        {/* Summary Cards */}
        <div className="reports-stats-grid">
          <div className="report-card-stat gold-border-active">
            <div className="report-icon-circle orange-bg"><TrendingUp size={20} color="white" /></div>
            <div className="report-stat-content">
              <span>Total Cash Collected</span>
              <h2 className="color-orange">{formatCurrency(totalCash)}</h2>
            </div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle gold-bg"><Calendar size={20} color="white" /></div>
            <div className="report-stat-content">
              <span>Rental Income</span>
              <h2 className="color-gold">{formatCurrency(rentalCollected)}</h2>
            </div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle red-bg"><ArrowUpRight size={20} color="white" /></div>
            <div className="report-stat-content">
              <span>Penalty Earnings</span>
              <h2 className="color-red">{formatCurrency(totalPenaltyPaid)}</h2>
            </div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle blue-bg"><Package size={20} color="white" /></div>
            <div className="report-stat-content">
              <span>Total Stock Units</span>
              <h2 className="color-blue">{totalStockUnits}</h2>
            </div>
          </div>
          <div className="report-card-stat">
            <div className="report-icon-circle gray-bg"><AlertTriangle size={20} color="white" /></div>
            <div className="report-stat-content">
              <span>Out of Stock Items</span>
              <h2 className="color-gray">{outOfStockCount} / {totalGowns}</h2>
            </div>
          </div>
        </div>

        <div className="reports-main-layout">
          {/* Revenue Chart */}
          <div className="report-visual-card chart-wide">
            <div className="report-visual-header">
              <div className="header-title">
                <FileChartLine size={18} color="#b8860b" />
                <h3>Revenue Trends</h3>
              </div>
              <div className="report-filters">
                {['day', 'week', 'month', 'year'].map((f) => (
                  <button
                    key={f}
                    className={`rep-filter-btn ${timeFilter === f ? 'is-active' : ''}`}
                    onClick={() => setTimeFilter(f)}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={getRevenueTrend()} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => formatCurrency(v)} cursor={{ fill: 'rgba(184,134,11,0.06)' }} />
                <Legend verticalAlign="top" align="right" height={36} />
                <Bar name="Rental" dataKey="rental" fill="#b8860b" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar name="Penalty" dataKey="penalty" fill="#ff416c" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="report-visual-card chart-narrow">
            <div className="report-visual-header">
              <PieIcon size={18} color="#b8860b" />
              <h3>Revenue Share</h3>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    {name: 'Rental', value: rentalCollected},
                    {name: 'Penalty', value: totalPenaltyPaid},
                    {name: 'Commission', value: totalCommissions}
                  ]}
                  innerRadius={65} outerRadius={85} paddingAngle={5} dataKey="value"
                >
                  <Cell fill="#ffb700" /><Cell fill="#ff416c" /><Cell fill="#11a1c5ed" />
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="rep-legend">
              <div className="rep-leg-item"><span className="dot-gold"></span> Rental</div>
              <div className="rep-leg-item"><span className="dot-red"></span> Penalty</div>
              <div className="rep-leg-item"><span className="dot-blue"></span> Commission</div>
            </div>
          </div>
        </div>

        {/* Inventory Monitoring */}
        <div className="reports-main-layout">
          <div className="report-visual-card chart-wide">
            <div className="report-visual-header">
              <div className="header-title">
                <Package size={18} color="#b8860b" />
                <h3>Inventory Stock by Category</h3>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={getInventoryByCategory()} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(33,147,176,0.06)' }} />
                <Bar name="Stock" dataKey="stock" fill="#2193b0" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="report-visual-card chart-narrow">
            <div className="report-visual-header">
              <AlertTriangle size={18} color="#ff416c" />
              <h3>Out of Stock</h3>
            </div>
            <div className="rep-summary-list">
              {gowns.filter(g => (g.stock || 0) === 0).length > 0 ? (
                gowns.filter(g => (g.stock || 0) === 0).map(g => (
                  <div key={g.id} className="rep-summary-row">
                    <span className="rep-summary-name">{g.name}</span>
                    <span className="badge badge-out">0 stock</span>
                  </div>
                ))
              ) : (
                <p className="rep-empty-text">Walay out-of-stock nga gowns. 🎉</p>
              )}
            </div>
          </div>
        </div>

        {/* Reservations & Penalty Summary */}
        <div className="reports-main-layout reports-summary-layout">
          <div className="report-visual-card">
            <div className="report-visual-header">
              <div className="header-title">
                <UserCheck size={18} color="#b8860b" />
                <h3>Active Reservations / Renters</h3>
              </div>
            </div>
            <div className="rep-summary-list">
              {activeReservations.length > 0 ? (
                activeReservations.map(b => (
                  <div key={b.id} className="rep-summary-row">
                    <div className="rep-summary-left">
                      <span className="rep-summary-name">{b.name}</span>
                      <span className="rep-summary-sub">{b.gownName} • Return: {b.returnDate || 'N/A'}</span>
                    </div>
                    <span className={`badge ${b.returnStatus === 'claimed' ? 'badge-claimed' : 'badge-reserved'}`}>
                      {b.returnStatus}
                    </span>
                  </div>
                ))
              ) : (
                <p className="rep-empty-text">Walay aktibo nga reservation/renter karon.</p>
              )}
            </div>
          </div>

          <div className="report-visual-card">
            <div className="report-visual-header">
              <div className="header-title">
                <AlertTriangle size={18} color="#ff416c" />
                <h3>Penalty Summary</h3>
              </div>
            </div>
            <div className="rep-summary-list">
              {penaltyRecords.length > 0 ? (
                penaltyRecords.map(b => (
                  <div key={b.id} className="rep-summary-row">
                    <div className="rep-summary-left">
                      <span className="rep-summary-name">{b.name}</span>
                      <span className="rep-summary-sub">{b.gownName}</span>
                    </div>
                    <div className="rep-summary-right">
                      <span className="rep-summary-amount">
                        {formatCurrency(b.isPenaltySettled ? b.penaltyPaid : b.penalty)}
                      </span>
                      <span className={`badge ${b.isPenaltySettled ? 'badge-settled' : 'badge-pending'}`}>
                        {b.isPenaltySettled ? 'Paid' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rep-empty-text">Walay penalty record.</p>
              )}
            </div>
          </div>
        </div>

        {/* Transaction History Table */}
        <div className="report-visual-card table-card">
          <div className="report-visual-header">
            <div className="header-title">
              <History size={18} color="#b8860b" />
              <h3>Transaction History</h3>
            </div>
            <div className="rep-search-wrapper">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search history..."
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="rep-table-container">
            <table className="rep-main-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Gown Item</th>
                  <th>Rental</th>
                  <th>Penalty</th>
                  <th>Comm.</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((b) => (
                  <tr key={b.id}>
                    <td>{b.createdAt?.toLocaleDateString()}</td>
                    <td className="customer-name">{b.name}</td>
                    <td>{b.gownName}</td>
                    <td className="color-gold">{formatCurrency(b.down)}</td>
                    <td className="color-red">{formatCurrency(b.penaltyPaid || 0)}</td>
                    <td className="color-blue">{formatCurrency(b.commissions || 0)}</td>
                    <td className="total-cell">{formatCurrency((Number(b.down) || 0) + (Number(b.penaltyPaid) || 0) + (Number(b.commissions) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default Reports;