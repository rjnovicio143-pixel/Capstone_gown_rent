import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  TrendingUp, ShoppingBag, DollarSign, Award, Clock, AlertCircle, Users
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import Header from '../components/Header';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [trendFilter, setTrendFilter] = useState('week');

  // --- DB ROW (snake_case) -> JS (camelCase) ---
  const mapBookingFromDb = (row) => ({
    id: row.id,
    name: row.name,
    gownName: row.gown_name,
    rentalPrice: row.rental_price,
    down: row.down,
    commissions: row.commissions,
    penaltyPaid: row.penalty_paid,
    returnStatus: row.return_status,
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

  useEffect(() => {
    fetchBookings();
  }, []);

  // 1. Financial Calculations
  const totalExpected = bookings.reduce((acc, curr) => acc + (Number(curr.rentalPrice) || 0), 0);
  const totalPenaltyPaid = bookings.reduce((acc, curr) => acc + (Number(curr.penaltyPaid) || 0), 0);
  const rentalCollected = bookings.reduce((acc, curr) => acc + (Number(curr.down) || 0), 0);
  const totalCommissions = bookings.reduce((acc, curr) => acc + (Number(curr.commissions) || 0), 0);

  // Cash Collected = Downpayment + Penalty + Commission
  const totalCollected = rentalCollected + totalPenaltyPaid + totalCommissions;

  const activeRentals = bookings.filter(b => b.returnStatus !== 'returned' && b.returnStatus !== 'cancelled').length;

  // 2. Trend Logic Summary (Day to Year)
  const getFilteredData = (filterType) => {
    const now = new Date();
    let iterations = filterType === 'day' ? 24 : (filterType === 'week' ? 7 : (filterType === 'month' ? 30 : 12));

    return [...Array(iterations)].map((_, i) => {
      const d = new Date();
      let label = "";
      let filtered = [];

      if (filterType === 'day') {
        d.setHours(now.getHours() - i);
        label = `${d.getHours()}:00`;
        filtered = bookings.filter(b => {
          const bDate = b.createdAt;
          return bDate && bDate.toDateString() === d.toDateString() && bDate.getHours() === d.getHours();
        });
      } else if (filterType === 'week' || filterType === 'month') {
        d.setDate(now.getDate() - i);
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        filtered = bookings.filter(b => b.createdAt && b.createdAt.toDateString() === d.toDateString());
      } else if (filterType === 'year') {
        d.setMonth(now.getMonth() - i);
        label = d.toLocaleDateString('en-US', { month: 'short' });
        filtered = bookings.filter(b => {
          const bDate = b.createdAt;
          return bDate && bDate.getMonth() === d.getMonth() && bDate.getFullYear() === d.getFullYear();
        });
      }
      return { name: label, count: filtered.length };
    }).reverse();
  };

  const getTopGowns = () => {
    const counts = {};
    bookings.forEach(b => { if (b.gownName) counts[b.gownName] = (counts[b.gownName] || 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 4);
  };

  const formatCurrency = (amt) => `₱${new Intl.NumberFormat('en-PH').format(amt || 0)}`;

  const FilterButtons = ({ active, setter }) => (
    <div className="time-filters">
      {['day', 'week', 'month', 'year'].map((f) => (
        <button
          key={f}
          className={`filter-btn-mini ${active === f ? 'active' : ''}`}
          onClick={() => setter(f)}
        >
          {f.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <>
    <Header />
    <div className="white-dashboard">
      <div className="dash-hero">
        <h1>Business Performance</h1>
        <p>Real-time analytics & financial summary</p>
      </div>

      <div className="stats-container">
        <div className="white-card stat-item gold-border">
          <div className="stat-icon-box gold-grad"><DollarSign size={22} color="white" /></div>
          <div className="stat-info"><span>Expected Revenue</span><h2 className="text-gold">{formatCurrency(totalExpected)}</h2></div>
        </div>
        <div className="white-card stat-item">
          <div className="stat-icon-box orange-grad"><TrendingUp size={22} color="white" /></div>
          <div className="stat-info"><span>Cash Collected</span><h2 className="text-orange">{formatCurrency(totalCollected)}</h2></div>
        </div>
        <div className="white-card stat-item">
          <div className="stat-icon-box red-grad"><AlertCircle size={22} color="white" /></div>
          <div className="stat-info"><span>Penalty Revenue</span><h2 className="text-red">{formatCurrency(totalPenaltyPaid)}</h2></div>
        </div>
        <div className="white-card stat-item">
          <div className="stat-icon-box blue-grad"><Users size={22} color="white" /></div>
          <div className="stat-info"><span>Staff Commissions</span><h2 className="text-blue">{formatCurrency(totalCommissions)}</h2></div>
        </div>
        <div className="white-card stat-item">
          <div className="stat-icon-box yellow-grad"><ShoppingBag size={22} color="white" /></div>
          <div className="stat-info"><span>Active Rentals</span><h2 className="text-yellow">{activeRentals}</h2></div>
        </div>
      </div>

      <div className="main-charts-grid">
        <div className="white-card chart-main">
          <div className="chart-header-row">
            <h3>Booking Trends</h3>
            <FilterButtons active={trendFilter} setter={setTrendFilter} />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={getFilteredData(trendFilter)} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" stroke="#999" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis stroke="#999" fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(255, 174, 0, 0.08)' }} />
              <Bar dataKey="count" fill="#ffae00" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="white-card chart-side">
          <h3>Revenue Share</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={[
                {name: 'Rental', value: rentalCollected},
                {name: 'Penalty', value: totalPenaltyPaid},
                {name: 'Comm.', value: totalCommissions}
              ]} innerRadius={60} outerRadius={80} dataKey="value">
                <Cell fill="#ffae00" /><Cell fill="#ff416c" /><Cell fill="#2193b0" />
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="legend-custom">
            <div className="leg"><span className="dot gold"></span> Rent</div>
            <div className="leg"><span className="dot pink"></span> Pen</div>
            <div className="leg"><span className="dot blue"></span> Com</div>
          </div>
        </div>
      </div>

      <div className="bottom-sections-grid">
        <div className="white-card list-panel">
          <div className="panel-header"><Award size={18} color="#ffae00" /><h3>Top Gown Rentals</h3></div>
          <div className="gown-list">
            {getTopGowns().map((gown, i) => (
              <div key={i} className="gown-row">
                <div className="gown-rank">{i + 1}</div>
                <div className="gown-details">
                  <p>{gown.name}</p>
                  <div className="progress-container">
                    <div className="progress-bar" style={{ width: `${(gown.count / (bookings.length || 1)) * 100}%` }}></div>
                  </div>
                </div>
                <span className="count-tag">{gown.count} Rent</span>
              </div>
            ))}
          </div>
        </div>
        <div className="white-card list-panel">
          <div className="panel-header"><Clock size={18} color="#ff8c00" /><h3>Recent Activity</h3></div>
          <div className="activity-feed">
            {bookings.slice(0, 5).map((activity, i) => (
              <div key={i} className="activity-item">
                <div className="activity-indicator"></div>
                <div className="activity-info">
                  <p><strong>{activity.name}</strong> rented <span>{activity.gownName}</span></p>
                  <small>{activity.createdAt?.toLocaleDateString()}</small>
                </div>
                <div className="activity-status">+{formatCurrency(activity.down)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default Dashboard;