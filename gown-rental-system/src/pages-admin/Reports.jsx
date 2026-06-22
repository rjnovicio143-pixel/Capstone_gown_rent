import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { 
  FileChartLine, PieChart as PieIcon, TrendingUp, Calendar, ArrowUpRight, History, Search
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import Header from '../components/Header';
import '../styles/Reports.css'; // Kaugalingon nga CSS

const Reports = () => {
  const [bookings, setBookings] = useState([]);
  const [timeFilter, setTimeFilter] = useState('week');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // Financial Calculations
  const rentalCollected = bookings.reduce((acc, curr) => acc + (Number(curr.down) || 0), 0);
  const totalPenaltyPaid = bookings.reduce((acc, curr) => acc + (Number(curr.penaltyPaid) || 0), 0);
  const totalCommissions = bookings.reduce((acc, curr) => acc + (Number(curr.commissions) || 0), 0);
  const totalCash = rentalCollected + totalPenaltyPaid + totalCommissions;

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
          const bDate = b.createdAt?.toDate();
          return bDate && bDate.toDateString() === d.toDateString() && bDate.getHours() === d.getHours();
        });
      } else if (timeFilter === 'week' || timeFilter === 'month') {
        d.setDate(now.getDate() - i);
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        filtered = bookings.filter(b => b.createdAt?.toDate().toDateString() === d.toDateString());
      } else if (timeFilter === 'year') {
        d.setMonth(now.getMonth() - i);
        label = d.toLocaleDateString('en-US', { month: 'short' });
        filtered = bookings.filter(b => {
          const bDate = b.createdAt?.toDate();
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

  const filteredHistory = bookings.filter(b => 
    b.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.gownName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (amt) => `₱${new Intl.NumberFormat('en-PH').format(amt)}`;

  return (
    <>
      <Header />
      <div className="reports-wrapper">
        <div className="reports-hero">
          <h1>Financial Reports & Analytics</h1>
          <p>Detailed breakdown of revenue, commissions, and transaction history</p>
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
              <AreaChart data={getRevenueTrend()}>
                <defs>
                  <linearGradient id="gradRent" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#b8860b" stopOpacity={0.2}/><stop offset="95%" stopColor="#b8860b" stopOpacity={0}/></linearGradient>
                  <linearGradient id="gradPen" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ff416c" stopOpacity={0.2}/><stop offset="95%" stopColor="#ff416c" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#bbb" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend verticalAlign="top" align="right" height={36}/>
                <Area name="Rental" type="monotone" dataKey="rental" stroke="#b8860b" fill="url(#gradRent)" strokeWidth={2} />
                <Area name="Penalty" type="monotone" dataKey="penalty" stroke="#ff416c" fill="url(#gradPen)" strokeWidth={2} />
              </AreaChart>
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
                    <td>{b.createdAt?.toDate().toLocaleDateString()}</td>
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