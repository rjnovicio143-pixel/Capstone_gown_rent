import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import {
  Search, X, Crown, Gift, CalendarDays, Plus, Gem, Phone, Palette,
  CheckCircle2, Ban, Wallet, Sparkles, Info
} from 'lucide-react';
import Header from '../components/Header';
import '../styles/Availability.css';

/* ---------- SETTINGS (confirm these with the shop owner) ---------- */
const MAX_WEDDINGS_PER_DAY = 2;  // how many weddings the shop can handle on one date
const MIN_DOWNPAYMENT = 1000;    // "as low as ₱1,000" from the poster
const CANCEL_REASON = 'The date was taken by a customer who paid the downpayment first.';

/* ---------- WEDDING PACKAGES (from the shop posters) ---------- */
const PARENTS_NOTE = "Barong set for father; formal attire for mother.";
const PRENUP_NOTE = 'If unused, prenup attire may be converted to additional entourage attire.';

const PACKAGES = [
  {
    key: 'intimate',
    name: 'Intimate Package',
    price: 7499,
    tagline: 'Beautiful essentials for your intimate celebration.',
    highlights: ['3 Bridesmaids', '3 Groomsmen', '3 Flower Girls'],
    inclusions: [
      'Bridal Gown', "Groom's Attire", '1 Maid of Honor', '1 Best Man',
      '3 Bridesmaids', '3 Groomsmen', '3 Flower Girls', '3 Bearers',
    ],
    freebies: [
      'Bridal Robe', 'Bridal Veil', 'Couple Veil', 'Cord', 'Pillow',
      'Flower Girl Baskets (3)', 'Floral Headbands (3)', 'Petticoat',
    ],
    note: '',
  },
  {
    key: 'classic',
    name: 'Classic Package',
    price: 9999,
    tagline: 'More entourage, more elegance.',
    highlights: ['4 Bridesmaids', '4 Groomsmen', '4 Flower Girls'],
    inclusions: [
      'Bridal Gown', "Groom's Attire", '1 Maid of Honor', '1 Best Man',
      '4 Bridesmaids', '4 Groomsmen', '4 Flower Girls', '3 Bearers',
      "2 Sets Parent's Attire",
    ],
    freebies: [
      'Bridal Robe', 'Bridal Veil', 'Couple Veil', 'Cord', 'Pillow',
      '5 Entourage Robes', 'Flower Girl Baskets (4)', 'Floral Headbands (4)', 'Petticoat',
    ],
    note: PARENTS_NOTE,
  },
  {
    key: 'diamond',
    name: 'Diamond Package',
    price: 13000,
    bestSeller: true,
    tagline: 'Our most chosen package for your dream wedding.',
    highlights: ['5 Bridesmaids', '5 Groomsmen', '1 Prenup set'],
    inclusions: [
      'Bridal Gown', "Groom's Attire", '1 Maid of Honor', '1 Best Man',
      '5 Bridesmaids', '5 Groomsmen', '5 Flower Girls', '3 Bearers',
      "2 Sets Parent's Attire",
    ],
    freebies: [
      '1 Set Prenup Attire', '6 Entourage Robes', 'Bridal Robe', 'Petticoat',
      'Bridal Veil', 'Couple Veil', 'Cord', 'Pillow',
      'Flower Girl Baskets (5)', 'Floral Headbands (5)',
    ],
    note: `${PARENTS_NOTE} ${PRENUP_NOTE}`,
  },
  {
    key: 'premium',
    name: 'Premium Package',
    price: 18000,
    tagline: 'More coverage, more memories, more elegance.',
    highlights: ['8 Bridesmaids', '8 Groomsmen', '2 Prenup sets'],
    inclusions: [
      'Bridal Gown', "Groom's Attire", '1 Maid of Honor', '1 Best Man',
      '8 Bridesmaids', '8 Groomsmen', '5 Flower Girls', '3 Bearers',
      "2 Sets Parent's Attire",
    ],
    freebies: [
      '2 Sets Prenup Attire', '9 Entourage Robes', 'Bridal Robe', 'Bridal Veil',
      'Couple Veil', 'Cord', 'Pillow', 'Flower Girl Baskets (5)',
      'Floral Headbands (5)', 'Petticoat',
    ],
    note: `${PARENTS_NOTE} ${PRENUP_NOTE}`,
  },
];

const MOTIF_COLORS = [
  { name: 'Dusty Blue', hex: '#8fb2d4' },
  { name: 'Royal Blue', hex: '#1e40af' },
  { name: 'Peach', hex: '#f9a98b' },
  { name: 'Sage Green', hex: '#8faf9a' },
  { name: 'Lilac/Lavender', hex: '#b79ce6' },
  { name: 'Beige/Nude', hex: '#d9c3a5' },
  { name: 'Rose Gold', hex: '#d9a29b' },
  { name: 'Old Rose', hex: '#c27c86' },
  { name: 'Gray', hex: '#8a8a8a' },
  { name: 'Burgundy/Maroon', hex: '#7a1230' },
  { name: 'Yellow', hex: '#f2c80f' },
  { name: 'Emerald Green', hex: '#0b7a55' },
];

const STATUS_LABEL = {
  pending: 'Awaiting downpayment',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/* ---------- HELPERS ---------- */
const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => new Date(`${k}T00:00:00`);
const prettyDate = (k) =>
  fromKey(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const longDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const mapReservation = (row) => ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  email: row.email || '',
  packageKey: row.package_key,
  packageName: row.package_name,
  packagePrice: Number(row.package_price) || 0,
  weddingDate: row.wedding_date,
  motifColor: row.motif_color || '',
  downpayment: Number(row.downpayment) || 0,
  status: row.status,
  notes: row.notes || '',
  cancelReason: row.cancel_reason || '',
});

const emptyForm = (dateKey) => ({
  name: '', contact: '', email: '',
  packageKey: 'diamond', weddingDate: dateKey,
  motifColor: '', downpayment: '', notes: '',
});

const Availability = () => {
  const [reservations, setReservations] = useState([]);
  const [date, setDate] = useState(new Date());
  const [viewPkg, setViewPkg] = useState(null);       // package details modal
  const [showForm, setShowForm] = useState(false);    // new reservation modal
  const [form, setForm] = useState(emptyForm(toKey(new Date())));
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [payInputs, setPayInputs] = useState({});     // amount typed per reservation

  const dateKey = toKey(date);
  const todayKey = toKey(new Date());

  /* ---------- FETCH ---------- */
  const fetchReservations = async () => {
    const { data, error } = await supabase
      .from('wedding_reservations')
      .select('*')
      .order('wedding_date', { ascending: true });
    if (error) console.error('Error fetching wedding reservations:', error);
    else setReservations((data || []).map(mapReservation));
  };

  useEffect(() => { fetchReservations(); }, []);

  // Close the modals with Esc
  useEffect(() => {
    if (!viewPkg && !showForm) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setViewPkg(null); setShowForm(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewPkg, showForm]);

  /* ---------- DERIVED DATA ---------- */
  // Reservations that take a slot on a date: confirmed or completed
  const slotTakers = (key) =>
    reservations.filter(r => r.weddingDate === key && (r.status === 'confirmed' || r.status === 'completed'));

  const dayInfo = useMemo(() => {
    const map = {};
    reservations.forEach(r => {
      if (r.status === 'cancelled') return;
      const d = map[r.weddingDate] || (map[r.weddingDate] = { taken: 0, pending: 0 });
      if (r.status === 'pending') d.pending += 1; else d.taken += 1;
    });
    return map;
  }, [reservations]);

  const forDate = reservations.filter(r => r.weddingDate === dateKey && r.status !== 'cancelled');
  const cancelledForDate = reservations.filter(r => r.weddingDate === dateKey && r.status === 'cancelled');
  const takenCount = slotTakers(dateKey).length;
  const slotsLeft = Math.max(0, MAX_WEDDINGS_PER_DAY - takenCount);
  const isFull = slotsLeft === 0;
  const totalPending = reservations.filter(r => r.status === 'pending').length;

  const q = search.trim().toLowerCase();
  const upcoming = reservations
    .filter(r => (r.status === 'pending' || r.status === 'confirmed') && r.weddingDate >= todayKey)
    .filter(r =>
      !q ||
      r.name?.toLowerCase().includes(q) ||
      r.contact?.includes(q) ||
      r.packageName?.toLowerCase().includes(q)
    )
    .slice(0, 8);

  const tileClass = ({ date: d, view }) => {
    if (view !== 'month') return null;
    const info = dayInfo[toKey(d)];
    if (!info) return null;
    if (info.taken >= MAX_WEDDINGS_PER_DAY) return 'wa-full';
    if (info.taken > 0) return 'wa-booked';
    return 'wa-pending';
  };

  /* ---------- FIRST-DOWNPAYMENT RULE ----------
     When a date has no slots left, every reservation still waiting for a
     downpayment on that date is cancelled. */
  const cancelCompetingPending = async (key) => {
    const { count, error } = await supabase
      .from('wedding_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('wedding_date', key)
      .in('status', ['confirmed', 'completed']);
    if (error || (count || 0) < MAX_WEDDINGS_PER_DAY) return 0;

    const { data, error: updateError } = await supabase
      .from('wedding_reservations')
      .update({ status: 'cancelled', cancel_reason: CANCEL_REASON })
      .eq('wedding_date', key)
      .eq('status', 'pending')
      .select('id');
    if (updateError) { console.error(updateError); return 0; }
    return data?.length || 0;
  };

  const notifyCancelled = (n) => {
    if (n > 0) alert(`${n} other reservation${n === 1 ? ' was' : 's were'} cancelled because this date is now full.`);
  };

  /* ---------- NEW RESERVATION ---------- */
  const openForm = (packageKey) => {
    setForm({ ...emptyForm(dateKey), packageKey: packageKey || 'diamond' });
    setViewPkg(null);
    setShowForm(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const pkg = PACKAGES.find(p => p.key === form.packageKey);
    const down = Number(form.downpayment) || 0;

    if (down > 0) {
      if (down < MIN_DOWNPAYMENT) return alert(`The minimum downpayment is ${peso(MIN_DOWNPAYMENT)}.`);
      if (down > pkg.price) return alert('The downpayment cannot be more than the package price.');
      if (slotTakers(form.weddingDate).length >= MAX_WEDDINGS_PER_DAY) {
        return alert('No slots left on this date. Pick another date.');
      }
    }

    setSaving(true);
    const { error } = await supabase.from('wedding_reservations').insert([{
      name: form.name.trim(),
      contact: form.contact.trim(),
      email: form.email.trim() || null,
      package_key: pkg.key,
      package_name: pkg.name,
      package_price: pkg.price,
      wedding_date: form.weddingDate,
      motif_color: form.motifColor || null,
      downpayment: down,
      status: down > 0 ? 'confirmed' : 'pending',
      notes: form.notes.trim() || null,
    }]);
    setSaving(false);

    if (error) { alert('Error: ' + error.message); return; }

    const cancelled = down > 0 ? await cancelCompetingPending(form.weddingDate) : 0;
    await logActivity('wedding_reserved', `${form.name.trim()} reserved the ${pkg.name} for ${form.weddingDate}${down > 0 ? ` (downpayment ${peso(down)})` : ' (awaiting downpayment)'}`);
    notifyCancelled(cancelled);

    setShowForm(false);
    setDate(fromKey(form.weddingDate));
    fetchReservations();
  };

  /* ---------- PAYMENTS AND STATUS ---------- */
  const handlePay = async (r) => {
    const amount = Number(payInputs[r.id]);
    if (!amount || amount <= 0) return alert('Enter a valid amount.');

    const newDown = r.downpayment + amount;
    if (newDown > r.packagePrice) return alert('The payment is more than the balance.');

    const wasPending = r.status === 'pending';
    if (wasPending) {
      if (newDown < MIN_DOWNPAYMENT) return alert(`The minimum downpayment is ${peso(MIN_DOWNPAYMENT)}.`);
      if (slotTakers(r.weddingDate).length >= MAX_WEDDINGS_PER_DAY) {
        return alert('No slots left on this date.');
      }
    }
    if (!window.confirm(`Confirm payment of ${peso(amount)} from ${r.name}?`)) return;

    const { error } = await supabase
      .from('wedding_reservations')
      .update({ downpayment: newDown, status: wasPending ? 'confirmed' : r.status })
      .eq('id', r.id);
    if (error) { alert('Error: ' + error.message); return; }

    const cancelled = wasPending ? await cancelCompetingPending(r.weddingDate) : 0;
    await logActivity('wedding_payment', `${peso(amount)} from ${r.name} for the ${r.packageName}`);
    notifyCancelled(cancelled);
    setPayInputs(prev => ({ ...prev, [r.id]: '' }));
    fetchReservations();
  };

  const handleStatus = async (r, status) => {
    const label = status === 'completed' ? 'mark this wedding as completed' : 'cancel this reservation';
    if (!window.confirm(`Do you want to ${label}?`)) return;

    const { error } = await supabase
      .from('wedding_reservations')
      .update({ status, cancel_reason: status === 'cancelled' ? 'Cancelled by the shop.' : null })
      .eq('id', r.id);
    if (error) { alert('Error: ' + error.message); return; }

    await logActivity('wedding_updated', `${r.name}'s wedding reservation marked as ${status}`);
    fetchReservations();
  };

  const formPkg = PACKAGES.find(p => p.key === form.packageKey);

  return (
    <>
      <Header />
      <div className="wa-page">

        {/* TOP BAR */}
        <div className="wa-top">
          <div>
            <h1>Wedding Package Availability</h1>
            <p>Pick a date to see open slots, packages, and who is booked.</p>
          </div>
          <button className="wa-btn wa-gold" onClick={() => openForm()}>
            <Plus size={17} /> New Reservation
          </button>
        </div>

        {/* STATS */}
        <div className="wa-stats">
          <div className="wa-stat">
            <span className={`wa-stat-icon ${isFull ? 'red' : 'green'}`}><CalendarDays size={20} /></span>
            <div>
              <span>Slots left on this date</span>
              <h3>{slotsLeft} <small>of {MAX_WEDDINGS_PER_DAY}</small></h3>
            </div>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-icon gold"><Gem size={20} /></span>
            <div>
              <span>Booked on this date</span>
              <h3>{takenCount}</h3>
            </div>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-icon orange"><Wallet size={20} /></span>
            <div>
              <span>Awaiting downpayment</span>
              <h3>{totalPending}</h3>
            </div>
          </div>
        </div>

        <div className="wa-layout">

          {/* ===== LEFT: PACKAGES + RESERVATIONS OF THE DATE ===== */}
          <div className="wa-main">

            <section className="wa-card">
              <div className="wa-card-head">
                <h2><Crown size={18} /> Wedding Packages</h2>
                <span className="wa-hint">Tap a package to see everything included</span>
              </div>

              <div className="wa-pkg-grid">
                {PACKAGES.map(p => {
                  const n = forDate.filter(r => r.packageKey === p.key).length;
                  return (
                    <button
                      type="button"
                      key={p.key}
                      className={`wa-pkg ${p.bestSeller ? 'best' : ''}`}
                      onClick={() => setViewPkg(p)}
                    >
                      {p.bestSeller && <span className="wa-best"><Gem size={11} /> Best seller</span>}
                      <span className="wa-pkg-name">{p.name}</span>
                      <strong className="wa-pkg-price">{peso(p.price)}</strong>
                      <span className="wa-pkg-tag">{p.tagline}</span>
                      <span className="wa-pkg-chips">
                        {p.highlights.map(h => <span key={h}>{h}</span>)}
                      </span>
                      <span className={`wa-pkg-booked ${n > 0 ? 'on' : ''}`}>
                        {n > 0 ? `${n} on this date` : 'None on this date'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="wa-card">
              <div className="wa-card-head">
                <div>
                  <h2><CalendarDays size={18} /> {longDate(date)}</h2>
                  <span className="wa-hint">
                    {dateKey < todayKey ? 'Past date. ' : ''}
                    {isFull ? 'This date is full.' : `${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} left.`}
                  </span>
                </div>
                <span className={`wa-slot-badge ${isFull ? 'full' : 'open'}`}>
                  {isFull ? 'Full' : 'Open'}
                </span>
              </div>

              {forDate.length === 0 && cancelledForDate.length === 0 && (
                <div className="wa-empty">
                  <Sparkles size={26} />
                  <p>No wedding is reserved on this date.</p>
                  <button className="wa-btn wa-ghost" onClick={() => openForm()}>
                    <Plus size={15} /> Reserve this date
                  </button>
                </div>
              )}

              <div className="wa-res-list">
                {forDate.map(r => {
                  const balance = r.packagePrice - r.downpayment;
                  const active = r.status === 'pending' || r.status === 'confirmed';
                  return (
                    <div key={r.id} className={`wa-res ${r.status}`}>
                      <div className="wa-res-top">
                        <div>
                          <strong>{r.name}</strong>
                          <span><Phone size={12} /> {r.contact}</span>
                        </div>
                        <span className={`wa-badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      </div>

                      <div className="wa-res-meta">
                        <span><Gem size={12} /> {r.packageName} · {peso(r.packagePrice)}</span>
                        {r.motifColor && <span><Palette size={12} /> {r.motifColor}</span>}
                      </div>

                      <div className="wa-res-money">
                        <span>Paid <strong>{peso(r.downpayment)}</strong></span>
                        <span>Balance <strong className={balance > 0 ? 'owe' : 'paid'}>{balance > 0 ? peso(balance) : 'Fully paid'}</strong></span>
                      </div>

                      {r.notes && <p className="wa-res-notes">{r.notes}</p>}

                      {active && (
                        <div className="wa-res-actions">
                          <input
                            type="number"
                            min="0"
                            placeholder={r.status === 'pending' ? `Downpayment (min ${MIN_DOWNPAYMENT})` : 'Amount'}
                            value={payInputs[r.id] || ''}
                            onChange={(e) => setPayInputs(prev => ({ ...prev, [r.id]: e.target.value }))}
                          />
                          <button className="wa-btn wa-gold wa-sm" onClick={() => handlePay(r)}>
                            {r.status === 'pending' ? 'Confirm downpayment' : 'Add payment'}
                          </button>
                          {r.status === 'confirmed' && (
                            <button className="wa-btn wa-green wa-sm" onClick={() => handleStatus(r, 'completed')}>
                              <CheckCircle2 size={14} /> Complete
                            </button>
                          )}
                          <button className="wa-btn wa-danger wa-sm" onClick={() => handleStatus(r, 'cancelled')}>
                            <Ban size={14} /> Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {cancelledForDate.map(r => (
                  <div key={r.id} className="wa-res cancelled">
                    <div className="wa-res-top">
                      <div>
                        <strong>{r.name}</strong>
                        <span><Phone size={12} /> {r.contact}</span>
                      </div>
                      <span className="wa-badge cancelled">Cancelled</span>
                    </div>
                    <div className="wa-res-meta"><span><Gem size={12} /> {r.packageName}</span></div>
                    {r.cancelReason && <p className="wa-res-notes">{r.cancelReason}</p>}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ===== RIGHT: CALENDAR + UPCOMING ===== */}
          <aside className="wa-side">
            <section className="wa-card">
              <div className="wa-card-head">
                <h2><CalendarDays size={18} /> Schedule View</h2>
              </div>

              <Calendar
                className="wa-calendar"
                onChange={setDate}
                value={date}
                tileClassName={tileClass}
              />

              <div className="wa-legend">
                <span><i className="wa-dot booked" /> Booked</span>
                <span><i className="wa-dot full" /> Full</span>
                <span><i className="wa-dot pending" /> Awaiting downpayment</span>
              </div>
            </section>

            <section className="wa-card">
              <div className="wa-card-head">
                <h2>Upcoming Weddings</h2>
              </div>

              <div className="wa-search">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search name or package..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="wa-up-list">
                {upcoming.length === 0 && <p className="wa-up-empty">No upcoming weddings.</p>}
                {upcoming.map(r => (
                  <button
                    type="button"
                    key={r.id}
                    className="wa-up"
                    onClick={() => setDate(fromKey(r.weddingDate))}
                  >
                    <span className="wa-up-date">
                      <strong>{fromKey(r.weddingDate).getDate()}</strong>
                      {fromKey(r.weddingDate).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className="wa-up-info">
                      <strong>{r.name}</strong>
                      <span>{r.packageName}</span>
                    </span>
                    <span className={`wa-dot ${r.status === 'pending' ? 'pending' : 'booked'}`} />
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>

        {/* ===== PACKAGE DETAILS MODAL ===== */}
        {viewPkg && (
          <div className="wa-overlay" onClick={() => setViewPkg(null)}>
            <div className="wa-modal" onClick={(e) => e.stopPropagation()}>
              <button className="wa-close" onClick={() => setViewPkg(null)} aria-label="Close"><X size={16} /></button>

              <div className="wa-modal-head">
                {viewPkg.bestSeller && <span className="wa-best"><Gem size={11} /> Best seller</span>}
                <h2>{viewPkg.name}</h2>
                <strong>{peso(viewPkg.price)}</strong>
                <p>{viewPkg.tagline}</p>
              </div>

              <div className="wa-modal-body">
                <div className="wa-two">
                  <div className="wa-box">
                    <h4><Crown size={14} /> Package inclusions</h4>
                    <ul>{viewPkg.inclusions.map(i => <li key={i}>{i}</li>)}</ul>
                  </div>
                  <div className="wa-box pink">
                    <h4><Gift size={14} /> With freebies</h4>
                    <ul>{viewPkg.freebies.map(i => <li key={i}>{i}</li>)}</ul>
                  </div>
                </div>

                {viewPkg.note && (
                  <p className="wa-note"><Info size={14} /> {viewPkg.note}</p>
                )}

                <div className="wa-box">
                  <h4><Palette size={14} /> Available motif colors</h4>
                  <div className="wa-swatches">
                    {MOTIF_COLORS.map(c => (
                      <span key={c.name} className="wa-swatch">
                        <i style={{ background: c.hex }} />
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  className="wa-btn wa-gold wa-block"
                  onClick={() => openForm(viewPkg.key)}
                >
                  <Plus size={16} /> Reserve {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== NEW RESERVATION MODAL ===== */}
        {showForm && (
          <div className="wa-overlay" onClick={() => setShowForm(false)}>
            <div className="wa-modal wa-form-modal" onClick={(e) => e.stopPropagation()}>
              <button className="wa-close" onClick={() => setShowForm(false)} aria-label="Close"><X size={16} /></button>

              <div className="wa-modal-head">
                <h2>New Wedding Reservation</h2>
                <p>Leave the downpayment empty to keep it as a hold. The first downpayment gets the date.</p>
              </div>

              <form className="wa-form" onSubmit={handleCreate}>
                <div className="wa-row">
                  <div className="wa-field">
                    <label>Full name</label>
                    <input type="text" required value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="wa-field">
                    <label>Contact number</label>
                    <input type="tel" required value={form.contact}
                      onChange={(e) => setForm({ ...form, contact: e.target.value })} />
                  </div>
                </div>

                <div className="wa-field">
                  <label>Email <span>(optional)</span></label>
                  <input type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>

                <div className="wa-row">
                  <div className="wa-field">
                    <label>Package</label>
                    <select value={form.packageKey}
                      onChange={(e) => setForm({ ...form, packageKey: e.target.value })}>
                      {PACKAGES.map(p => <option key={p.key} value={p.key}>{p.name} ({peso(p.price)})</option>)}
                    </select>
                  </div>
                  <div className="wa-field">
                    <label>Wedding date</label>
                    <input type="date" required value={form.weddingDate}
                      onChange={(e) => setForm({ ...form, weddingDate: e.target.value })} />
                  </div>
                </div>

                <div className="wa-row">
                  <div className="wa-field">
                    <label>Motif color <span>(optional)</span></label>
                    <select value={form.motifColor}
                      onChange={(e) => setForm({ ...form, motifColor: e.target.value })}>
                      <option value="">Not decided yet</option>
                      {MOTIF_COLORS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="wa-field">
                    <label>Downpayment <span>(min {peso(MIN_DOWNPAYMENT)})</span></label>
                    <input type="number" min="0" placeholder="0 = hold only" value={form.downpayment}
                      onChange={(e) => setForm({ ...form, downpayment: e.target.value })} />
                  </div>
                </div>

                <div className="wa-field">
                  <label>Notes <span>(optional)</span></label>
                  <textarea rows="2" value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>

                <div className="wa-form-total">
                  <span>{formPkg.name}</span>
                  <strong>{peso(formPkg.price)}</strong>
                </div>

                <button type="submit" className="wa-btn wa-gold wa-block" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Reservation'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Availability;