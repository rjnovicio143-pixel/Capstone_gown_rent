import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import {
  Search, X, Crown, Gift, CalendarDays, Plus, Gem, Phone, Palette,
  CheckCircle2, Ban, Wallet, Sparkles, Info, Pencil, Trash2, Shirt
} from 'lucide-react';
import Header from '../components/Header';
import '../styles/Availability.css';

/* ---------- SETTINGS (confirm these with the shop owner) ---------- */
const MAX_WEDDINGS_PER_DAY = 2;  // how many weddings the shop can handle on one date
const MIN_DOWNPAYMENT = 1000;    // "as low as ₱1,000" from the poster
const CANCEL_REASON = 'The date was taken by a customer who paid the downpayment first.';

/* ---------- DEFAULT WEDDING PACKAGES (from the shop posters) ----------
   These are only used to fill an empty "wedding_packages" table (button on the page).
   After that, packages are edited on the page itself. */
const PARENTS_NOTE = "Barong set for father; formal attire for mother.";
const PRENUP_NOTE = 'If unused, prenup attire may be converted to additional entourage attire.';

const DEFAULT_PACKAGES = [
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
const longDate = (d) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const lines = (t) => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
const toText = (arr) => (arr || []).join('\n');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  bridalGownId: row.bridal_gown_id ? String(row.bridal_gown_id) : '',
  groomAttireId: row.groom_attire_id ? String(row.groom_attire_id) : '',
});

const mapPackage = (row) => ({
  id: row.id,
  key: row.key,
  name: row.name,
  price: Number(row.price) || 0,
  tagline: row.tagline || '',
  bestSeller: !!row.best_seller,
  highlights: row.highlights || [],
  inclusions: row.inclusions || [],
  freebies: row.freebies || [],
  note: row.note || '',
  bridalIds: (row.bridal_gown_ids || []).map(String),
  groomIds: (row.groom_attire_ids || []).map(String),
  sortOrder: row.sort_order || 0,
});

const packageToRow = (p, order) => ({
  key: p.key,
  name: p.name,
  price: p.price,
  tagline: p.tagline || '',
  best_seller: !!p.bestSeller,
  highlights: p.highlights || [],
  inclusions: p.inclusions || [],
  freebies: p.freebies || [],
  note: p.note || '',
  bridal_gown_ids: p.bridalIds || [],
  groom_attire_ids: p.groomIds || [],
  sort_order: order,
});

const blankPackage = () => ({
  id: null, key: '', name: '', price: '', tagline: '', bestSeller: false,
  highlightsText: '', inclusionsText: '', freebiesText: '', note: '',
  bridalIds: [], groomIds: [],
});

const draftFromPackage = (p) => ({
  id: p.id, key: p.key, name: p.name, price: String(p.price), tagline: p.tagline,
  bestSeller: p.bestSeller,
  highlightsText: toText(p.highlights), inclusionsText: toText(p.inclusions),
  freebiesText: toText(p.freebies), note: p.note,
  bridalIds: [...p.bridalIds], groomIds: [...p.groomIds],
});

const emptyForm = (dateKey, packageKey) => ({
  name: '', contact: '', email: '',
  packageKey: packageKey || '', weddingDate: dateKey,
  motifColor: '', downpayment: '', notes: '',
  bridalGownId: '', groomAttireId: '',
});

/* ---------- SMALL COMPONENTS ---------- */
// Checklist of inventory items (used by the package editor)
const PickGrid = ({ items, selected, onToggle, icon, emptyText }) => {
  const [q, setQ] = useState('');
  const shown = items.filter(g => g.name?.toLowerCase().includes(q.trim().toLowerCase()));

  if (items.length === 0) return <p className="wa-pick-empty">{emptyText}</p>;

  return (
    <div className="wa-pick">
      {items.length > 6 && (
        <input
          className="wa-pick-search"
          type="text"
          placeholder="Search..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className="wa-pick-grid">
        {shown.map(g => {
          const on = selected.includes(String(g.id));
          return (
            <label key={g.id} className={`wa-pick-item ${on ? 'on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => onToggle(String(g.id))} />
              {g.image
                ? <img src={g.image} alt="" />
                : <span className="wa-pick-ph">{icon}</span>}
              <span className="wa-pick-name">
                {g.name}
                <small>{peso(g.price)} · {Number(g.stock ?? 0)} left</small>
              </span>
            </label>
          );
        })}
        {shown.length === 0 && <p className="wa-pick-empty">No match.</p>}
      </div>
    </div>
  );
};

// Read-only thumbnails (package details)
const Gallery = ({ items, icon, emptyText }) => {
  if (items.length === 0) return <p className="wa-pick-empty">{emptyText}</p>;
  return (
    <div className="wa-gal">
      {items.map(g => (
        <div key={g.id} className="wa-gal-item">
          {g.image ? <img src={g.image} alt="" /> : <span className="wa-pick-ph">{icon}</span>}
          <span>{g.name}</span>
        </div>
      ))}
    </div>
  );
};

const Availability = () => {
  const [reservations, setReservations] = useState([]);
  const [packages, setPackages] = useState([]);
  const [pkgState, setPkgState] = useState('loading');   // 'loading' | 'ok' | 'missing'
  const [inventory, setInventory] = useState([]);        // gowns + suits from Inventory
  const [date, setDate] = useState(new Date());
  const [viewPkg, setViewPkg] = useState(null);          // package details modal
  const [pkgEditor, setPkgEditor] = useState(null);      // add / edit package modal
  const [showForm, setShowForm] = useState(false);       // new reservation modal
  const [form, setForm] = useState(emptyForm(toKey(new Date())));
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [payInputs, setPayInputs] = useState({});        // amount typed per reservation

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

  const fetchPackages = async () => {
    const { data, error } = await supabase
      .from('wedding_packages')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('price', { ascending: true });
    if (error) {
      console.error('Error fetching wedding packages:', error);
      setPkgState('missing');
      setPackages(DEFAULT_PACKAGES.map(p => ({ ...p, bridalIds: [], groomIds: [], bestSeller: !!p.bestSeller })));
      return;
    }
    setPkgState('ok');
    setPackages((data || []).map(mapPackage));
  };

  const fetchInventory = async () => {
    const { data, error } = await supabase
      .from('gowns')
      .select('id, name, price, stock, image, category, type')
      .order('name', { ascending: true });
    if (error) console.error('Error fetching inventory:', error);
    else setInventory(data || []);
  };

  useEffect(() => {
    fetchReservations();
    fetchPackages();
    fetchInventory();
  }, []);

  // Close the modals with Esc
  useEffect(() => {
    if (!viewPkg && !showForm && !pkgEditor) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setViewPkg(null); setShowForm(false); setPkgEditor(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewPkg, showForm, pkgEditor]);

  /* ---------- INVENTORY LINK ---------- */
  // Wedding gowns = Inventory items in the "Wedding" category (not suits). Groom attire = Inventory suits.
  const weddingGowns = useMemo(
    () => inventory.filter(g => g.type !== 'suit' && g.category === 'Wedding'),
    [inventory]
  );
  const suits = useMemo(() => inventory.filter(g => g.type === 'suit'), [inventory]);
  const itemById = useMemo(() => {
    const m = {};
    inventory.forEach(g => { m[String(g.id)] = g; });
    return m;
  }, [inventory]);

  // What a package allows. Nothing picked = everything in that group.
  const optionsFor = (ids, pool) => (ids && ids.length ? ids.map(id => itemById[id]).filter(Boolean) : pool);

  // How many confirmed/completed weddings already hold this item on that date
  const usedOnDate = (itemId, key) =>
    reservations.filter(r =>
      r.weddingDate === key &&
      (r.status === 'confirmed' || r.status === 'completed') &&
      (r.bridalGownId === String(itemId) || r.groomAttireId === String(itemId))
    ).length;

  const takenNote = (item, key) => {
    const cap = Number(item.stock ?? 1);
    if (cap <= 0) return 'out of stock';
    return usedOnDate(item.id, key) >= cap ? 'reserved on this date' : '';
  };

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

  /* ---------- PACKAGES (add / edit / delete) ---------- */
  const openEditor = (pkg) => {
    setViewPkg(null);
    setPkgEditor(pkg ? draftFromPackage(pkg) : blankPackage());
  };

  const toggleEditorId = (field, id) => {
    setPkgEditor(d => ({
      ...d,
      [field]: d[field].includes(id) ? d[field].filter(x => x !== id) : [...d[field], id],
    }));
  };

  const makeKey = (name) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'package';
    let key = base;
    let n = 2;
    while (packages.some(p => p.key === key)) { key = `${base}-${n}`; n += 1; }
    return key;
  };

  const savePackage = async (e) => {
    e.preventDefault();
    const d = pkgEditor;
    const price = Number(d.price);
    if (!d.name.trim()) return alert('Enter a package name.');
    if (!price || price <= 0) return alert('Enter a valid price.');

    const fields = {
      name: d.name.trim(),
      price,
      tagline: d.tagline.trim(),
      best_seller: d.bestSeller,
      highlights: lines(d.highlightsText),
      inclusions: lines(d.inclusionsText),
      freebies: lines(d.freebiesText),
      note: d.note.trim(),
      bridal_gown_ids: d.bridalIds,
      groom_attire_ids: d.groomIds,
    };

    setSaving(true);
    let error;
    if (d.id) {
      ({ error } = await supabase.from('wedding_packages').update(fields).eq('id', d.id));
    } else {
      const nextOrder = packages.length ? Math.max(...packages.map(p => p.sortOrder || 0)) + 1 : 1;
      ({ error } = await supabase.from('wedding_packages').insert([{ ...fields, key: makeKey(d.name), sort_order: nextOrder }]));
    }
    setSaving(false);
    if (error) { alert('Error: ' + error.message); return; }

    await logActivity(d.id ? 'wedding_package_updated' : 'wedding_package_added', `${d.id ? 'Updated' : 'Added'} wedding package: ${fields.name} (${peso(price)})`);
    setPkgEditor(null);
    fetchPackages();
  };

  const deletePackage = async (p) => {
    const active = reservations.filter(r => r.packageKey === p.key && (r.status === 'pending' || r.status === 'confirmed')).length;
    if (active > 0) {
      return alert(`Cannot delete "${p.name}" — ${plural(active, 'active reservation')} still use it.`);
    }
    if (!window.confirm(`Delete "${p.name}"? Past reservations keep their details.`)) return;

    const { error } = await supabase.from('wedding_packages').delete().eq('id', p.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('wedding_package_deleted', `Deleted wedding package: ${p.name}`);
    setPkgEditor(null);
    fetchPackages();
  };

  const loadDefaults = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('wedding_packages')
      .insert(DEFAULT_PACKAGES.map((p, i) => packageToRow({ ...p, bridalIds: [], groomIds: [] }, i + 1)));
    setSaving(false);
    if (error) { alert('Error: ' + error.message); return; }
    fetchPackages();
  };

  /* ---------- NEW RESERVATION ---------- */
  const openForm = (packageKey) => {
    if (packages.length === 0) return alert('Add a wedding package first.');
    const fallback = packages.find(p => p.bestSeller)?.key || packages[0].key;
    setForm(emptyForm(dateKey, packageKey || fallback));
    setViewPkg(null);
    setShowForm(true);
  };

  const formPkg = packages.find(p => p.key === form.packageKey);
  const bridalOptions = formPkg ? optionsFor(formPkg.bridalIds, weddingGowns) : [];
  const groomOptions = formPkg ? optionsFor(formPkg.groomIds, suits) : [];
  const pickedBridal = itemById[form.bridalGownId];
  const pickedGroom = itemById[form.groomAttireId];

  const changeFormPackage = (key) => {
    const next = packages.find(p => p.key === key);
    const nextBridal = next ? optionsFor(next.bridalIds, weddingGowns) : [];
    const nextGroom = next ? optionsFor(next.groomIds, suits) : [];
    setForm(f => ({
      ...f,
      packageKey: key,
      bridalGownId: nextBridal.some(g => String(g.id) === f.bridalGownId) ? f.bridalGownId : '',
      groomAttireId: nextGroom.some(g => String(g.id) === f.groomAttireId) ? f.groomAttireId : '',
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const pkg = formPkg;
    if (!pkg) return alert('Pick a package.');
    const down = Number(form.downpayment) || 0;

    if (down > 0) {
      if (down < MIN_DOWNPAYMENT) return alert(`The minimum downpayment is ${peso(MIN_DOWNPAYMENT)}.`);
      if (down > pkg.price) return alert('The downpayment cannot be more than the package price.');
      if (slotTakers(form.weddingDate).length >= MAX_WEDDINGS_PER_DAY) {
        return alert('No slots left on this date. Pick another date.');
      }
    }

    // Gown / attire already held by another wedding on that date
    const clash = [pickedBridal, pickedGroom].filter(Boolean).find(it => takenNote(it, form.weddingDate));
    if (clash) {
      return alert(`"${clash.name}" is ${takenNote(clash, form.weddingDate)}. Choose another one or pick another date.`);
    }

    setSaving(true);
    const row = {
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
    };
    // Only send the inventory links when chosen
    if (form.bridalGownId) row.bridal_gown_id = form.bridalGownId;
    if (form.groomAttireId) row.groom_attire_id = form.groomAttireId;

    const { error } = await supabase.from('wedding_reservations').insert([row]);
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
      // Soft warning if the chosen gown / attire was taken by another wedding meanwhile
      const clash = [itemById[r.bridalGownId], itemById[r.groomAttireId]]
        .filter(Boolean)
        .find(it => takenNote(it, r.weddingDate));
      if (clash && !window.confirm(`"${clash.name}" is ${takenNote(clash, r.weddingDate)}. Confirm the downpayment anyway?`)) return;
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

  const canEditPackages = pkgState === 'ok';

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

        {/* SETUP NOTICE (only if the wedding_packages table is not created yet) */}
        {pkgState === 'missing' && (
          <div className="wa-setup">
            <Info size={18} />
            <div>
              <strong>Package editing is not set up yet.</strong>
              <span>Run the SQL setup in Supabase to add and edit packages and link them to Inventory. The default packages are shown for now.</span>
            </div>
          </div>
        )}

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

              {canEditPackages && packages.length === 0 && (
                <div className="wa-empty">
                  <Sparkles size={26} />
                  <p>No packages yet.</p>
                  <button className="wa-btn wa-ghost" onClick={loadDefaults} disabled={saving}>
                    Load the 4 default packages
                  </button>
                </div>
              )}

              <div className="wa-pkg-grid">
                {packages.map(p => {
                  const n = forDate.filter(r => r.packageKey === p.key).length;
                  return (
                    <div key={p.key} className="wa-pkg-wrap">
                      <button
                        type="button"
                        className={`wa-pkg ${p.bestSeller ? 'best' : ''}`}
                        onClick={() => setViewPkg(p)}
                      >
                        {p.bestSeller && <span className="wa-best"><Gem size={11} /> Best seller</span>}
                        <span className="wa-pkg-name">{p.name}</span>
                        <strong className="wa-pkg-price">{peso(p.price)}</strong>
                        {p.tagline && <span className="wa-pkg-tag">{p.tagline}</span>}
                        {p.highlights.length > 0 && (
                          <span className="wa-pkg-chips">
                            {p.highlights.map(h => <span key={h}>{h}</span>)}
                          </span>
                        )}
                        <span className="wa-pkg-links">
                          <span><Sparkles size={11} /> {p.bridalIds.length ? plural(p.bridalIds.length, 'gown option') : 'Any wedding gown'}</span>
                          <span><Shirt size={11} /> {p.groomIds.length ? plural(p.groomIds.length, 'attire option') : 'Any groom attire'}</span>
                        </span>
                        <span className={`wa-pkg-booked ${n > 0 ? 'on' : ''}`}>
                          {n > 0 ? `${n} on this date` : 'None on this date'}
                        </span>
                      </button>
                      {canEditPackages && (
                        <button
                          type="button"
                          className="wa-pkg-edit"
                          onClick={() => openEditor(p)}
                          aria-label={`Edit ${p.name}`}
                          title="Edit package"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {canEditPackages && packages.length > 0 && (
                  <button type="button" className="wa-pkg wa-pkg-add" onClick={() => openEditor()}>
                    <Plus size={22} />
                    <span>Add package class</span>
                  </button>
                )}
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
                  const gown = itemById[r.bridalGownId];
                  const attire = itemById[r.groomAttireId];
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
                        {gown && <span><Sparkles size={12} /> {gown.name}</span>}
                        {attire && <span><Shirt size={12} /> {attire.name}</span>}
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
                {viewPkg.tagline && <p>{viewPkg.tagline}</p>}
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

                <div className="wa-two">
                  <div className="wa-box">
                    <h4><Sparkles size={14} /> Bridal gown options</h4>
                    <Gallery
                      items={optionsFor(viewPkg.bridalIds, weddingGowns)}
                      icon="👗"
                      emptyText="No wedding gowns in Inventory yet."
                    />
                  </div>
                  <div className="wa-box">
                    <h4><Shirt size={14} /> Groom's attire options</h4>
                    <Gallery
                      items={optionsFor(viewPkg.groomIds, suits)}
                      icon="🤵"
                      emptyText="No men's attire in Inventory yet."
                    />
                  </div>
                </div>

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

                {canEditPackages && (
                  <button className="wa-btn wa-ghost wa-block" onClick={() => openEditor(viewPkg)}>
                    <Pencil size={15} /> Edit this package
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== ADD / EDIT PACKAGE MODAL ===== */}
        {pkgEditor && (
          <div className="wa-overlay" onClick={() => setPkgEditor(null)}>
            <div className="wa-modal wa-editor-modal" onClick={(e) => e.stopPropagation()}>
              <button className="wa-close" onClick={() => setPkgEditor(null)} aria-label="Close"><X size={16} /></button>

              <div className="wa-modal-head">
                <h2>{pkgEditor.id ? 'Edit Package' : 'New Package Class'}</h2>
                <p>Changes show on this page right away. Past reservations keep the price they were booked at.</p>
              </div>

              <form className="wa-form" onSubmit={savePackage}>
                <div className="wa-row">
                  <div className="wa-field">
                    <label>Package name</label>
                    <input type="text" required placeholder="e.g. Gold Package" value={pkgEditor.name}
                      onChange={(e) => setPkgEditor({ ...pkgEditor, name: e.target.value })} />
                  </div>
                  <div className="wa-field">
                    <label>Price (₱)</label>
                    <input type="number" min="1" required value={pkgEditor.price}
                      onChange={(e) => setPkgEditor({ ...pkgEditor, price: e.target.value })} />
                  </div>
                </div>

                <div className="wa-field">
                  <label>Tagline <span>(optional)</span></label>
                  <input type="text" value={pkgEditor.tagline}
                    onChange={(e) => setPkgEditor({ ...pkgEditor, tagline: e.target.value })} />
                </div>

                <label className="wa-check-row">
                  <input type="checkbox" checked={pkgEditor.bestSeller}
                    onChange={(e) => setPkgEditor({ ...pkgEditor, bestSeller: e.target.checked })} />
                  <span>Mark as "Best seller"</span>
                </label>

                <div className="wa-field">
                  <label>Highlights <span>(one per line, shown as small tags)</span></label>
                  <textarea rows="3" placeholder={'5 Bridesmaids\n5 Groomsmen'} value={pkgEditor.highlightsText}
                    onChange={(e) => setPkgEditor({ ...pkgEditor, highlightsText: e.target.value })} />
                </div>

                <div className="wa-row">
                  <div className="wa-field">
                    <label>Package inclusions <span>(one per line)</span></label>
                    <textarea rows="7" value={pkgEditor.inclusionsText}
                      onChange={(e) => setPkgEditor({ ...pkgEditor, inclusionsText: e.target.value })} />
                  </div>
                  <div className="wa-field">
                    <label>Freebies <span>(one per line)</span></label>
                    <textarea rows="7" value={pkgEditor.freebiesText}
                      onChange={(e) => setPkgEditor({ ...pkgEditor, freebiesText: e.target.value })} />
                  </div>
                </div>

                <div className="wa-field">
                  <label>Note <span>(optional)</span></label>
                  <textarea rows="2" value={pkgEditor.note}
                    onChange={(e) => setPkgEditor({ ...pkgEditor, note: e.target.value })} />
                </div>

                <div className="wa-box">
                  <h4>
                    <Sparkles size={14} /> Bridal gown options
                    <small>{pkgEditor.bridalIds.length} selected</small>
                  </h4>
                  <PickGrid
                    items={weddingGowns}
                    selected={pkgEditor.bridalIds}
                    onToggle={(id) => toggleEditorId('bridalIds', id)}
                    icon="👗"
                    emptyText='No gowns in the "Wedding" category yet. Add them in Inventory.'
                  />
                  <p className="wa-pick-hint">From Inventory › Wedding. Pick none to allow every wedding gown.</p>
                </div>

                <div className="wa-box">
                  <h4>
                    <Shirt size={14} /> Groom's attire options
                    <small>{pkgEditor.groomIds.length} selected</small>
                  </h4>
                  <PickGrid
                    items={suits}
                    selected={pkgEditor.groomIds}
                    onToggle={(id) => toggleEditorId('groomIds', id)}
                    icon="🤵"
                    emptyText="No men's attire in Inventory yet. Add one there (Item type: Men's Suit)."
                  />
                  <p className="wa-pick-hint">From Inventory › Men's Suit. Pick none to allow every suit.</p>
                </div>

                <div className="wa-editor-foot">
                  {pkgEditor.id && (
                    <button type="button" className="wa-btn wa-danger" onClick={() => deletePackage(pkgEditor)}>
                      <Trash2 size={15} /> Delete
                    </button>
                  )}
                  <button type="submit" className="wa-btn wa-gold" disabled={saving}>
                    {saving ? 'Saving...' : 'Save package'}
                  </button>
                </div>
              </form>
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
                    <select value={form.packageKey} onChange={(e) => changeFormPackage(e.target.value)}>
                      {packages.map(p => <option key={p.key} value={p.key}>{p.name} ({peso(p.price)})</option>)}
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
                    <label>Bridal gown <span>(from Inventory)</span></label>
                    <select value={form.bridalGownId}
                      onChange={(e) => setForm({ ...form, bridalGownId: e.target.value })}>
                      <option value="">Not chosen yet</option>
                      {bridalOptions.map(g => {
                        const t = takenNote(g, form.weddingDate);
                        return (
                          <option key={g.id} value={String(g.id)} disabled={!!t && String(g.id) !== form.bridalGownId}>
                            {g.name} · {peso(g.price)}{t ? ` (${t})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="wa-field">
                    <label>Groom's attire <span>(from Inventory)</span></label>
                    <select value={form.groomAttireId}
                      onChange={(e) => setForm({ ...form, groomAttireId: e.target.value })}>
                      <option value="">Not chosen yet</option>
                      {groomOptions.map(g => {
                        const t = takenNote(g, form.weddingDate);
                        return (
                          <option key={g.id} value={String(g.id)} disabled={!!t && String(g.id) !== form.groomAttireId}>
                            {g.name} · {peso(g.price)}{t ? ` (${t})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {(pickedBridal || pickedGroom) && (
                  <div className="wa-sel-prev">
                    {[pickedBridal, pickedGroom].filter(Boolean).map(g => (
                      <div key={g.id} className="wa-sel-item">
                        {g.image ? <img src={g.image} alt="" /> : <span className="wa-pick-ph">{g.type === 'suit' ? '🤵' : '👗'}</span>}
                        <span>
                          <strong>{g.name}</strong>
                          <small>{Number(g.stock ?? 0)} in stock{takenNote(g, form.weddingDate) ? ` · ${takenNote(g, form.weddingDate)}` : ''}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

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
                  <span>{formPkg?.name}</span>
                  <strong>{peso(formPkg?.price)}</strong>
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