import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  TrendingUp, ShoppingBag, DollarSign, Award, Clock, AlertCircle, Users,
  CalendarHeart, Globe, RefreshCw
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import Header from '../components/Header';
import '../styles/Dashboard.css';

const formatCurrency = (amt) => `₱${new Intl.NumberFormat('en-PH').format(Math.round(Number(amt) || 0))}`;
const num = (v) => Number(v) || 0;
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const niceDate = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const FILTERS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
const STATUS_TEXT = {
  pending: 'Pending', reserved: 'Reserved', claimed: 'Claimed', returned: 'Returned', cancelled: 'Cancelled', overdue: 'Overdue',
};

const Dashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [weddings, setWeddings] = useState(null);       // null = could not load
  const [trendFilter, setTrendFilter] = useState('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mapBooking = (row) => ({
    id: row.id,
    name: row.name,
    gownName: row.gown_name,
    rentalPrice: row.rental_price,
    down: row.down,
    commissions: row.commissions,
    penaltyPaid: row.penalty_paid,
    returnStatus: row.return_status,
    isOnlineHold: !!row.is_online_hold,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  });

  const load = async () => {
    setLoading(true);
    setError('');
    const [bRes, wRes] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('wedding_reservations')
        .select('id, name, package_name, package_price, downpayment, wedding_date, status'),
    ]);
    if (bRes.error) { console.error('Error fetching bookings:', bRes.error); setError(bRes.error.message); }
    else setBookings((bRes.data || []).map(mapBooking));
    if (wRes.error) { console.error('Error fetching weddings:', wRes.error); setWeddings(null); }
    else setWeddings(wRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ---------- RENTAL FIGURES ---------- */
  const stats = useMemo(() => {
    // Cancelled bookings and online holds still waiting for the shop do not count as revenue
    const real = bookings.filter(b => b.returnStatus !== 'cancelled' && !(b.isOnlineHold && b.returnStatus === 'pending'));
    const expected = real.reduce((a, b) => a + num(b.rentalPrice), 0);
    const penalty = bookings.reduce((a, b) => a + num(b.penaltyPaid), 0);
    const rental = bookings.reduce((a, b) => a + num(b.down), 0);
    const commissions = bookings.reduce((a, b) => a + num(b.commissions), 0);
    const active = real.filter(b => b.returnStatus !== 'returned').length;
    const holds = bookings.filter(b => b.isOnlineHold && b.returnStatus === 'pending').length;
    return { expected, penalty, rental, commissions, collected: rental + penalty + commissions, active, holds };
  }, [bookings]);

  /* ---------- WEDDING FIGURES ---------- */
  const wedding = useMemo(() => {
    if (!weddings) return null;
    const live = weddings.filter(w => w.status !== 'cancelled');
    const today = todayKey();
    const upcoming = live
      .filter(w => (w.status === 'pending' || w.status === 'confirmed') && String(w.wedding_date) >= today)
      .sort((a, b) => String(a.wedding_date).localeCompare(String(b.wedding_date)));
    return {
      count: live.length,
      expected: live.reduce((a, w) => a + num(w.package_price), 0),
      collected: live.reduce((a, w) => a + num(w.downpayment), 0),
      upcoming,
    };
  }, [weddings]);

  /* ---------- TREND ---------- */
  const trend = useMemo(() => {
    const now = new Date();
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const made = bookings.filter(b => b.createdAt);

    if (trendFilter === 'day') {
      return [...Array(24)].map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - (23 - i));
        return {
          name: `${d.getHours()}:00`,
          count: made.filter(b => sameDay(b.createdAt, d) && b.createdAt.getHours() === d.getHours()).length,
        };
      });
    }
    if (trendFilter === 'year') {
      return [...Array(12)].map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        return {
          name: d.toLocaleDateString('en-US', { month: 'short' }),
          count: made.filter(b => b.createdAt.getMonth() === d.getMonth() && b.createdAt.getFullYear() === d.getFullYear()).length,
        };
      });
    }
    const days = trendFilter === 'week' ? 7 : 30;
    return [...Array(days)].map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
      return {
        name: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: made.filter(b => sameDay(b.createdAt, d)).length,
      };
    });
  }, [bookings, trendFilter]);
  const trendTotal = trend.reduce((a, t) => a + t.count, 0);

  /* ---------- TOP GOWNS ---------- */
  const topGowns = useMemo(() => {
    const counts = {};
    bookings.forEach(b => {
      if (b.gownName && b.returnStatus !== 'cancelled') counts[b.gownName] = (counts[b.gownName] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [bookings]);
  const topMax = topGowns[0]?.count || 1;

  const share = [
    { name: 'Rental downpayment', value: stats.rental, color: '#e0a800' },
    { name: 'Penalty', value: stats.penalty, color: '#e11d48' },
    { name: 'Commissions', value: stats.commissions, color: '#0e7490' },
  ];
  const shareTotal = share.reduce((a, s) => a + s.value, 0);

  const KPIS = [
    { label: 'Expected Revenue', value: formatCurrency(stats.expected), icon: DollarSign, tone: 'gold', hint: 'Cancelled and unconfirmed holds not counted' },
    { label: 'Cash Collected', value: formatCurrency(stats.collected), icon: TrendingUp, tone: 'orange', hint: 'Downpayment + penalty + commission' },
    { label: 'Penalty Revenue', value: formatCurrency(stats.penalty), icon: AlertCircle, tone: 'red', hint: 'Late return fees paid' },
    { label: 'Staff Commissions', value: formatCurrency(stats.commissions), icon: Users, tone: 'blue', hint: 'Total commissions' },
    { label: 'Active Rentals', value: stats.active, icon: ShoppingBag, tone: 'green', hint: stats.holds ? `${stats.holds} online hold${stats.holds === 1 ? '' : 's'} waiting` : 'Not yet returned' },
  ];

  return (
    <>
      <Header />
      <div className="db-page">
        <div className="db-hero">
          <div>
            <h1>Business Performance</h1>
            <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · analytics &amp; financial summary</p>
          </div>
          <button className="db-refresh" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'db-spin' : ''} /> Refresh
          </button>
        </div>

        {error && <div className="db-error">Could not load the bookings: {error}</div>}

        <div className="db-kpis">
          {KPIS.map(k => (
            <div key={k.label} className={`db-card db-kpi db-${k.tone}`}>
              <div className="db-kpi-icon"><k.icon size={20} /></div>
              <div className="db-kpi-body">
                <span className="db-kpi-label">{k.label}</span>
                <strong className="db-kpi-value">{loading ? '…' : k.value}</strong>
                <small>{k.hint}</small>
              </div>
            </div>
          ))}
        </div>

        {wedding && (
          <div className="db-card db-wedding">
            <div className="db-wedding-head">
              <div className="db-panel-title"><CalendarHeart size={18} color="#be185d" /><h3>Wedding Packages</h3></div>
              <div className="db-wedding-stats">
                <div><span>Reservations</span><strong>{wedding.count}</strong></div>
                <div><span>Package value</span><strong>{formatCurrency(wedding.expected)}</strong></div>
                <div><span>Downpayments</span><strong>{formatCurrency(wedding.collected)}</strong></div>
              </div>
            </div>
            <div className="db-upcoming">
              {wedding.upcoming.length === 0 ? (
                <p className="db-empty">No upcoming weddings.</p>
              ) : wedding.upcoming.slice(0, 4).map(w => (
                <div key={w.id} className="db-wedding-item">
                  <b>{niceDate(w.wedding_date)}</b>
                  <span>{w.name}</span>
                  <em>{w.package_name}</em>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="db-grid-main">
          <div className="db-card db-chart">
            <div className="db-chart-head">
              <div>
                <h3>Booking Trends</h3>
                <small>{trendTotal} booking{trendTotal === 1 ? '' : 's'} in this period</small>
              </div>
              <div className="db-filters">
                {FILTERS.map(([f, label]) => (
                  <button key={f} className={trendFilter === f ? 'active' : ''} onClick={() => setTrendFilter(f)}>{label}</button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1ede4" vertical={false} />
                <XAxis dataKey="name" stroke="#9a9484" fontSize={10} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#9a9484" fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip cursor={{ fill: 'rgba(224,168,0,0.08)' }} formatter={(v) => [v, 'Bookings']} />
                <Bar dataKey="count" fill="#e0a800" radius={[6, 6, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="db-card db-chart">
            <h3>Revenue Share</h3>
            <small>Collected from rentals</small>
            <div className="db-donut">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={shareTotal > 0 ? share : [{ name: 'None', value: 1, color: '#ece8dc' }]}
                    innerRadius={58} outerRadius={80} dataKey="value" stroke="none" paddingAngle={shareTotal > 0 ? 2 : 0}
                  >
                    {(shareTotal > 0 ? share : [{ color: '#ece8dc' }]).map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  {shareTotal > 0 && <Tooltip formatter={(v) => formatCurrency(v)} />}
                </PieChart>
              </ResponsiveContainer>
              <div className="db-donut-center"><span>Total</span><strong>{formatCurrency(shareTotal)}</strong></div>
            </div>
            <div className="db-legend">
              {share.map(s => (
                <div key={s.name}>
                  <span><i style={{ background: s.color }} />{s.name}</span>
                  <b>{formatCurrency(s.value)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="db-grid-bottom">
          <div className="db-card db-list">
            <div className="db-panel-title"><Award size={18} color="#e0a800" /><h3>Top Gown Rentals</h3></div>
            {topGowns.length === 0 ? <p className="db-empty">No rentals yet.</p> : topGowns.map((g, i) => (
              <div key={g.name} className="db-gown-row">
                <div className="db-rank">{i + 1}</div>
                <div className="db-gown-info">
                  <p>{g.name}</p>
                  <div className="db-bar"><div style={{ width: `${(g.count / topMax) * 100}%` }} /></div>
                </div>
                <span className="db-count">{g.count}×</span>
              </div>
            ))}
          </div>

          <div className="db-card db-list">
            <div className="db-panel-title"><Clock size={18} color="#ea580c" /><h3>Recent Activity</h3></div>
            {bookings.length === 0 ? <p className="db-empty">No bookings yet.</p> : bookings.slice(0, 6).map(a => (
              <div key={a.id} className="db-activity">
                <div className="db-dot" />
                <div className="db-activity-info">
                  <p>
                    <strong>{a.name}</strong> {a.isOnlineHold && a.returnStatus === 'pending' ? 'reserved online' : 'rented'} <span>{a.gownName}</span>
                    {a.isOnlineHold && <em className="db-online"><Globe size={10} /> online</em>}
                  </p>
                  <small>
                    {a.createdAt?.toLocaleDateString()}
                    {a.returnStatus && <i className={`db-status db-st-${a.returnStatus}`}>{STATUS_TEXT[a.returnStatus] || a.returnStatus}</i>}
                  </small>
                </div>
                <div className="db-money">+{formatCurrency(a.down)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;