import { useState, useEffect } from 'react';
import {
  Search, PlusCircle, X, Upload, Package, AlertCircle,
  Trash2, Edit, Camera, Eye, EyeOff,
  Crown, Layers, ShoppingBag, Globe
} from 'lucide-react';
import '../styles/Inventory.css';
import Header from '../components/Header';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';

const GOWN_CATEGORIES = ['Wedding', 'Debut', 'Formal', 'Ball Gown', 'Others'];
const ACC_CATEGORIES = [
  'Crown', 'Hairdressed', 'Basket', 'Veil', 'Couple Cord', 'Pillow',
  'Suspender', 'Bowtie', 'Necktie', 'Vest',
  'Filipina Sleeve', 'Shawl / Alampay', 'Bolero', 'Kimono',
  'Necklace', 'Earrings', 'Gloves', 'Others',
];
const LOW_STOCK = 2; // pila na lang = "low stock"

const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const emptyGownForm = {
  name: '', price: '', stock: 1, size: '', category: 'Wedding',
  desc: '', image: null,
  petticoat_layer: null,
  included_accessories: [],
  is_posted: false,
};

const emptyAccForm = { name: '', category: 'Others', price: '', swap_fee: '', stock: 1 };
const emptyPettiForm = { layer: '', price: '', swap_fee: '' };

const Inventory = () => {
  const [activeTab, setActiveTab] = useState('gowns'); // 'gowns' | 'petticoats' | 'accessories'

  // Data
  const [gowns, setGowns]             = useState([]);
  const [petticoats, setPetticoats]   = useState([]);
  const [accessories, setAccessories] = useState([]);

  // Filters
  const [searchTerm, setSearchTerm]     = useState('');
  const [filterPosted, setFilterPosted] = useState('all'); // 'all' | 'posted' | 'draft'
  const [filterCategory, setFilterCategory] = useState('All'); // 'All' | Wedding | Debut | ...
  const [accSearch, setAccSearch]       = useState('');

  // Gown modal
  const [gownModalOpen, setGownModalOpen] = useState(false);
  const [editingGown, setEditingGown]     = useState(null);
  const [gownForm, setGownForm]           = useState(emptyGownForm);
  const [imageFile, setImageFile]         = useState(null);
  const [imagePreview, setImagePreview]   = useState(null);

  // Accessory modal
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [editingAcc, setEditingAcc]     = useState(null);
  const [accForm, setAccForm]           = useState(emptyAccForm);

  // Petticoat modal
  const [pettiModalOpen, setPettiModalOpen] = useState(false);
  const [editingPetti, setEditingPetti]     = useState(null);
  const [pettiForm, setPettiForm]           = useState(emptyPettiForm);

  const [loading, setLoading] = useState(false);

  // ── FETCH ──
  const fetchGowns = async () => {
    const { data, error } = await supabase
      .from('gowns').select('*').order('created_at', { ascending: false });
    if (!error) setGowns(data || []);
  };

  const fetchPetticoats = async () => {
    const { data, error } = await supabase
      .from('petticoats').select('*').order('layer', { ascending: true });
    if (!error) setPetticoats(data || []);
  };

  const fetchAccessories = async () => {
    const { data, error } = await supabase
      .from('accessories').select('*').order('category', { ascending: true });
    if (!error) setAccessories(data || []);
  };

  useEffect(() => {
    fetchGowns();
    fetchPetticoats();
    fetchAccessories();
  }, []);

  // ── HELPERS ──
  const accName = (id) => accessories.find(a => a.id === id)?.name || `#${id}`;
  const pettiByLayer = (layer) => petticoats.find(p => Number(p.layer) === Number(layer));

  // Total value of the items included in the gown package (gown form)
  const includedValue = () => {
    const petti = Number(pettiByLayer(gownForm.petticoat_layer)?.price || 0);
    const accs = (gownForm.included_accessories || []).reduce(
      (s, id) => s + Number(accessories.find(a => a.id === id)?.price || 0), 0
    );
    return petti + accs;
  };

  // ── IMAGE ──
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageFile(file);
    setImagePreview(url);
    setGownForm(prev => ({ ...prev, image: url }));
  };

  const uploadImage = async (file) => {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('Gown images').upload(fileName, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('Gown images').getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  // ── GOWN MODAL ──
  const openAddGown = () => {
    setEditingGown(null);
    setGownForm(emptyGownForm);
    setImageFile(null);
    setImagePreview(null);
    setGownModalOpen(true);
  };

  const openEditGown = (gown) => {
    setEditingGown(gown);
    setGownForm({
      name: gown.name || '',
      price: gown.price || '',
      stock: gown.stock ?? 1,
      size: gown.size || '',
      category: gown.category || 'Wedding',
      desc: gown.desc || '',
      image: gown.image || null,
      petticoat_layer: gown.petticoat_layer ?? null,
      included_accessories: gown.included_accessories || [],
      is_posted: gown.is_posted || false,
    });
    setImageFile(null);
    setImagePreview(gown.image || null);
    setGownModalOpen(true);
  };

  const closeGownModal = () => {
    setGownModalOpen(false);
    setEditingGown(null);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSaveGown = async () => {
    if (!gownForm.name.trim()) return alert('Please enter a gown name.');
    if (!gownForm.price)       return alert('Please enter a price.');
    // Photo is required only when the gown is going public
    if (gownForm.is_posted && !imagePreview) {
      return alert('Please upload a photo before posting this gown to the public catalog.');
    }
    setLoading(true);
    try {
      let imageUrl = editingGown?.image || '';
      // Only upload when posting, so unused photos don't pile up in storage
      if (gownForm.is_posted && imageFile) imageUrl = await uploadImage(imageFile);

      const payload = {
        name: gownForm.name.trim(),
        price: Number(gownForm.price),
        stock: Number(gownForm.stock),
        size: gownForm.size,
        category: gownForm.category,
        desc: gownForm.desc,
        image: imageUrl,
        petticoat_layer: gownForm.petticoat_layer,
        included_accessories: gownForm.included_accessories,
        is_posted: gownForm.is_posted,
        status: Number(gownForm.stock) > 0 ? 'Available' : 'Out of Stock',
        type: 'gown',
      };

      if (editingGown) {
        const { error } = await supabase.from('gowns').update(payload).eq('id', editingGown.id);
        if (error) throw error;
        await logActivity('gown_edited', `Updated gown: ${gownForm.name}`);
      } else {
        const { error } = await supabase.from('gowns').insert([payload]);
        if (error) throw error;
        await logActivity('gown_added', `Added gown: ${gownForm.name}`);
      }

      fetchGowns();
      closeGownModal();
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePost = async (gown) => {
    const next = !gown.is_posted;
    if (next && (!gown.price || gown.price <= 0)) {
      return alert('Please set a price before posting this gown.');
    }
    // No photo yet -> open the editor with Publish already ON so the photo can be added
    if (next && !gown.image) {
      alert('Add a photo first before posting this gown.');
      openEditGown(gown);
      setGownForm(p => ({ ...p, is_posted: true }));
      return;
    }
    const { error } = await supabase.from('gowns').update({ is_posted: next }).eq('id', gown.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('gown_edited', `${next ? 'Posted' : 'Unpublished'} gown: ${gown.name}`);
    fetchGowns();
  };

  const handleDeleteGown = async (gown) => {
    const { count, error: countErr } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('gown_id', gown.id)
      .not('return_status', 'in', '("returned","cancelled")');
    if (countErr) console.error(countErr);

    if (count > 0) {
      alert(`Cannot delete "${gown.name}" — it still has ${plural(count, 'active booking')}.`);
      return;
    }
    if (!window.confirm(`Delete "${gown.name}"? This cannot be undone.`)) return;

    const { error } = await supabase.from('gowns').delete().eq('id', gown.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('gown_deleted', `Deleted gown: ${gown.name}`);
    fetchGowns();
  };

  // ── PETTICOATS CRUD ──
  const openAddPetti = () => {
    setEditingPetti(null);
    // Suggest the next layer number
    const nextLayer = petticoats.length ? Math.max(...petticoats.map(p => Number(p.layer))) + 1 : 1;
    setPettiForm({ layer: nextLayer, price: '', swap_fee: '' });
    setPettiModalOpen(true);
  };

  const openEditPetti = (p) => {
    setEditingPetti(p);
    setPettiForm({ layer: p.layer, price: p.price ?? '', swap_fee: p.swap_fee ?? '' });
    setPettiModalOpen(true);
  };

  const handleSavePetti = async () => {
    const layerNum = Number(pettiForm.layer);
    if (!layerNum || layerNum < 1) return alert('Enter a valid layer number (1 or higher).');
    if (petticoats.some(p => Number(p.layer) === layerNum && p.id !== editingPetti?.id)) {
      return alert(`Layer ${layerNum} already exists.`);
    }
    setLoading(true);
    try {
      const payload = {
        layer: layerNum,
        price: Number(pettiForm.price) || 0,
        swap_fee: Number(pettiForm.swap_fee) || 0,
      };
      if (editingPetti) {
        const { error } = await supabase.from('petticoats').update(payload).eq('id', editingPetti.id);
        if (error) throw error;
        // If the layer number changed, keep gowns that use it in sync
        if (Number(editingPetti.layer) !== layerNum) {
          await supabase.from('gowns').update({ petticoat_layer: layerNum }).eq('petticoat_layer', editingPetti.layer);
          fetchGowns();
        }
        await logActivity('petticoat_edited', `Updated petticoat Layer ${layerNum}`);
      } else {
        const { error } = await supabase.from('petticoats').insert([payload]);
        if (error) throw error;
        await logActivity('petticoat_added', `Added petticoat Layer ${layerNum}`);
      }
      fetchPetticoats();
      setPettiModalOpen(false);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePetti = async (p) => {
    const used = gowns.filter(g => Number(g.petticoat_layer) === Number(p.layer)).length;
    if (used > 0) {
      alert(`Cannot delete Layer ${p.layer} — it is used by ${plural(used, 'gown')}. Change the package of those gowns first.`);
      return;
    }
    if (!window.confirm(`Delete Layer ${p.layer}?`)) return;
    const { error } = await supabase.from('petticoats').delete().eq('id', p.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('petticoat_deleted', `Deleted petticoat Layer ${p.layer}`);
    fetchPetticoats();
  };

  // ── ACCESSORIES CRUD ──
  const openAddAcc = () => {
    setEditingAcc(null);
    setAccForm(emptyAccForm);
    setAccModalOpen(true);
  };

  const openEditAcc = (acc) => {
    setEditingAcc(acc);
    setAccForm({
      name: acc.name,
      category: acc.category || 'Others',
      price: acc.price ?? '',
      swap_fee: acc.swap_fee ?? '',
      stock: acc.stock ?? 0,
    });
    setAccModalOpen(true);
  };

  const handleSaveAcc = async () => {
    if (!accForm.name.trim()) return alert('Please enter a name.');
    setLoading(true);
    try {
      const payload = {
        name: accForm.name.trim(),
        category: accForm.category,
        price: Number(accForm.price) || 0,
        swap_fee: Number(accForm.swap_fee) || 0,
        stock: Math.max(0, Number(accForm.stock) || 0),
      };
      if (editingAcc) {
        const { error } = await supabase.from('accessories').update(payload).eq('id', editingAcc.id);
        if (error) throw error;
        await logActivity('accessory_edited', `Updated accessory: ${payload.name}`);
      } else {
        const { error } = await supabase.from('accessories').insert([payload]);
        if (error) throw error;
        await logActivity('accessory_added', `Added accessory: ${payload.name}`);
      }
      fetchAccessories();
      setAccModalOpen(false);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAcc = async (acc) => {
    const used = gowns.filter(g => (g.included_accessories || []).includes(acc.id)).length;
    if (used > 0) {
      alert(`Cannot delete "${acc.name}" — it is included in the package of ${plural(used, 'gown')}. Remove it from those gowns first.`);
      return;
    }
    if (!window.confirm(`Delete "${acc.name}"?`)) return;
    const { error } = await supabase.from('accessories').delete().eq('id', acc.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('accessory_deleted', `Deleted accessory: ${acc.name}`);
    fetchAccessories();
  };

  // Quick +/- sa stock gikan mismo sa list
  const adjustAccStock = async (acc, delta) => {
    const next = Math.max(0, Number(acc.stock || 0) + delta);
    if (next === Number(acc.stock || 0)) return;
    const { error } = await supabase.from('accessories').update({ stock: next }).eq('id', acc.id);
    if (error) { alert('Error: ' + error.message); return; }
    setAccessories(prev => prev.map(a => a.id === acc.id ? { ...a, stock: next } : a));
  };

  // ── ACCESSORY CHECKBOX in gown form ──
  const toggleAccInForm = (accId) => {
    setGownForm(prev => {
      const list = prev.included_accessories || [];
      return {
        ...prev,
        included_accessories: list.includes(accId)
          ? list.filter(id => id !== accId)
          : [...list, accId],
      };
    });
  };

  // ── FILTERED ──
  const filteredGowns = gowns.filter(g => {
    const matchSearch = g.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPosted =
      filterPosted === 'all'    ? true :
      filterPosted === 'posted' ? g.is_posted :
                                  !g.is_posted;
    const matchCategory = filterCategory === 'All' ? true : g.category === filterCategory;
    return matchSearch && matchPosted && matchCategory;
  });

  // Ihap sa gowns kada category (para sa tabs)
  const categoryCount = (cat) =>
    cat === 'All' ? gowns.length : gowns.filter(g => g.category === cat).length;

  const filteredAccs = accessories.filter(a =>
    a.name?.toLowerCase().includes(accSearch.toLowerCase()) ||
    a.category?.toLowerCase().includes(accSearch.toLowerCase())
  );

  // ── STATS ──
  const totalGowns  = gowns.length;
  const postedCount = gowns.filter(g => g.is_posted).length;
  const draftCount  = gowns.filter(g => !g.is_posted).length;
  const outCount    = gowns.filter(g => (g.stock || 0) === 0).length;

  return (
    <div className="inv-wrapper">
      <Header />
      <div className="inv-container">

        {/* ── STATS ── */}
        <div className="inv-stats">
          <div className="inv-stat-card">
            <ShoppingBag className="inv-stat-icon blue" />
            <div><span>Total Gowns</span><h3>{totalGowns}</h3></div>
          </div>
          <div className="inv-stat-card">
            <Globe className="inv-stat-icon green" />
            <div><span>Posted</span><h3>{postedCount}</h3></div>
          </div>
          <div className="inv-stat-card">
            <Package className="inv-stat-icon gray" />
            <div><span>Draft</span><h3>{draftCount}</h3></div>
          </div>
          <div className="inv-stat-card">
            <AlertCircle className="inv-stat-icon red" />
            <div><span>Out of Stock</span><h3>{outCount}</h3></div>
          </div>
          <div className="inv-stat-card">
            <Layers className="inv-stat-icon purple" />
            <div><span>Petticoats</span><h3>{petticoats.length}</h3></div>
          </div>
          <div className="inv-stat-card">
            <Crown className="inv-stat-icon gold" />
            <div><span>Accessories</span><h3>{accessories.length}</h3></div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="inv-tabs">
          <button className={`inv-tab ${activeTab === 'gowns' ? 'active' : ''}`} onClick={() => setActiveTab('gowns')}>
            👗 Gowns
          </button>
          <button className={`inv-tab ${activeTab === 'petticoats' ? 'active' : ''}`} onClick={() => setActiveTab('petticoats')}>
            🩱 Petticoats
          </button>
          <button className={`inv-tab ${activeTab === 'accessories' ? 'active' : ''}`} onClick={() => setActiveTab('accessories')}>
            👑 Accessories
          </button>
        </div>

        {/* ════════ TAB: GOWNS ════════ */}
        {activeTab === 'gowns' && (
          <>
            <div className="inv-toolbar">
              <div className="inv-search">
                <Search size={16} />
                <input placeholder="Search gowns..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>

              <div className="inv-filter-pills">
                {['all', 'posted', 'draft'].map(f => (
                  <button key={f} className={`inv-pill ${filterPosted === f ? 'active' : ''}`} onClick={() => setFilterPosted(f)}>
                    {f === 'all' ? 'All' : f === 'posted' ? '🌐 Posted' : '📝 Draft'}
                  </button>
                ))}
              </div>

              <button className="inv-add-btn" onClick={openAddGown}>
                <PlusCircle size={18} /> Add Gown
              </button>
            </div>

            {/* Category tabs */}
            <div className="inv-cat-tabs" role="tablist" aria-label="Gown categories">
              {['All', ...GOWN_CATEGORIES].map(cat => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={filterCategory === cat}
                  className={`inv-cat-tab ${filterCategory === cat ? 'active' : ''}`}
                  onClick={() => setFilterCategory(cat)}
                >
                  {cat}
                  <span className="inv-cat-count">{categoryCount(cat)}</span>
                </button>
              ))}
            </div>

            <div className="inv-grid">
              {filteredGowns.length === 0 ? (
                <div className="inv-empty">
                  {filterCategory === 'All' ? 'No gowns found.' : `No ${filterCategory} gowns found.`}
                </div>
              ) : filteredGowns.map(gown => {
                const petti = gown.petticoat_layer ? pettiByLayer(gown.petticoat_layer) : null;
                return (
                  <div key={gown.id} className="inv-card">
                    <div className={`inv-post-badge ${gown.is_posted ? 'posted' : 'draft'}`}>
                      {gown.is_posted ? '🌐 Posted' : '📝 Draft'}
                    </div>

                    <div className="inv-card-img">
                      {gown.image ? <img src={gown.image} alt={gown.name} /> : <div className="inv-no-img">👗</div>}
                      <span className={`inv-stock-tag ${gown.stock > 0 ? 'in' : 'out'}`}>{gown.stock || 0} left</span>
                    </div>

                    <div className="inv-card-body">
                      <span className="inv-card-cat">{gown.category}</span>
                      <h3 className="inv-card-name">{gown.name}</h3>
                      <p className="inv-card-price">{peso(gown.price)}</p>

                      <div className="inv-chips">
                        {gown.petticoat_layer && (
                          <span className="inv-chip chip-petticoat">
                            <Layers size={11} /> Layer {gown.petticoat_layer}
                            {petti && Number(petti.price) > 0 && <em> · {peso(petti.price)}</em>}
                          </span>
                        )}
                        {(gown.included_accessories || []).map(id => (
                          <span key={id} className="inv-chip chip-acc">
                            <Crown size={11} /> {accName(id)}
                          </span>
                        ))}
                        {!gown.petticoat_layer && (gown.included_accessories || []).length === 0 && (
                          <span className="inv-chip chip-none">Gown only</span>
                        )}
                      </div>
                    </div>

                    <div className="inv-card-actions">
                      <button className="inv-act-btn edit" onClick={() => openEditGown(gown)}>
                        <Edit size={14} /> Edit
                      </button>
                      <button className={`inv-act-btn ${gown.is_posted ? 'unpost' : 'post'}`} onClick={() => handleTogglePost(gown)}>
                        {gown.is_posted ? <><EyeOff size={14} /> Unpost</> : <><Eye size={14} /> Post</>}
                      </button>
                      <button className="inv-act-btn del" onClick={() => handleDeleteGown(gown)} aria-label="Delete gown">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ════════ TAB: PETTICOATS ════════ */}
        {activeTab === 'petticoats' && (
          <>
            <div className="inv-toolbar">
              <p className="inv-tab-note">
                Petticoat layers. These appear in the gown package and in Customers (New Rental / Swap).
              </p>
              <button className="inv-add-btn" onClick={openAddPetti}>
                <PlusCircle size={18} /> Add Layer
              </button>
            </div>

            <div className="acc-list">
              {petticoats.length === 0 ? (
                <div className="inv-empty">No petticoat layers yet. Click "Add Layer".</div>
              ) : petticoats.map(p => {
                const used = gowns.filter(g => Number(g.petticoat_layer) === Number(p.layer)).length;
                return (
                  <div key={p.id} className="acc-row">
                    <div className="acc-row-info">
                      <span className="acc-icon">🩱</span>
                      <div>
                        <p className="acc-name">Layer {p.layer}</p>
                        <span className="acc-cat">Used by {plural(used, 'gown')}</span>
                      </div>
                    </div>
                    <div className="acc-row-meta">
                      <span className="inv-price-tag">{Number(p.price) > 0 ? peso(p.price) : 'Free'}</span>
                      {Number(p.swap_fee) > 0 && <span className="inv-swap-tag">Swap +{peso(p.swap_fee)}</span>}
                    </div>
                    <div className="acc-row-actions">
                      <button className="inv-act-btn edit" onClick={() => openEditPetti(p)}>
                        <Edit size={14} /> Edit
                      </button>
                      <button className="inv-act-btn del" onClick={() => handleDeletePetti(p)} aria-label="Delete layer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ════════ TAB: ACCESSORIES ════════ */}
        {activeTab === 'accessories' && (
          <>
            <div className="inv-toolbar">
              <div className="inv-search">
                <Search size={16} />
                <input placeholder="Search accessories..." value={accSearch} onChange={e => setAccSearch(e.target.value)} />
              </div>
              <button className="inv-add-btn" onClick={openAddAcc}>
                <PlusCircle size={18} /> Add Accessory
              </button>
            </div>

            <div className="acc-list">
              {filteredAccs.length === 0 ? (
                <div className="inv-empty">No accessories found.</div>
              ) : filteredAccs.map(acc => {
                const used = gowns.filter(g => (g.included_accessories || []).includes(acc.id)).length;
                const stock = Number(acc.stock || 0);
                const stockClass = stock === 0 ? 'out' : stock <= LOW_STOCK ? 'low' : 'in';
                return (
                  <div key={acc.id} className="acc-row">
                    <div className="acc-row-info">
                      <span className="acc-icon">👑</span>
                      <div>
                        <p className="acc-name">{acc.name}</p>
                        <span className="acc-cat">{acc.category} · Used by {plural(used, 'gown')}</span>
                      </div>
                    </div>

                    {/* Stock: dali ra i-adjust gamit ang − / + */}
                    <div className="acc-stock">
                      <button type="button" className="acc-stock-btn" onClick={() => adjustAccStock(acc, -1)} aria-label="Decrease stock">−</button>
                      <span className={`acc-stock-pill ${stockClass}`}>
                        {stock === 0 ? 'Out' : `${stock} pcs`}
                      </span>
                      <button type="button" className="acc-stock-btn" onClick={() => adjustAccStock(acc, 1)} aria-label="Increase stock">+</button>
                    </div>

                    <div className="acc-row-meta">
                      <span className="inv-price-tag">{Number(acc.price) > 0 ? peso(acc.price) : 'Free'}</span>
                      {Number(acc.swap_fee) > 0 && <span className="inv-swap-tag">Swap +{peso(acc.swap_fee)}</span>}
                    </div>
                    <div className="acc-row-actions">
                      <button className="inv-act-btn edit" onClick={() => openEditAcc(acc)}>
                        <Edit size={14} /> Edit
                      </button>
                      <button className="inv-act-btn del" onClick={() => handleDeleteAcc(acc)} aria-label="Delete accessory">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ════════ GOWN MODAL ════════ */}
        {gownModalOpen && (
          <div className="inv-overlay" onClick={closeGownModal}>
            <div className="inv-modal" onClick={e => e.stopPropagation()}>
              <div className="inv-modal-header">
                <h2>{editingGown ? 'Edit Gown Package' : 'Add New Gown Package'}</h2>
                <button className="inv-modal-close" onClick={closeGownModal} aria-label="Close"><X size={16} /></button>
              </div>

              <div className="inv-modal-body">

                {/* Basic */}
                <div className="inv-form-section">
                  <h4 className="inv-section-title">📝 Basic Info</h4>

                  <div className="inv-field">
                    <label>Gown Name</label>
                    <input type="text" placeholder="e.g. Mermaid Wedding Gown" value={gownForm.name}
                      onChange={e => setGownForm(p => ({ ...p, name: e.target.value }))} />
                  </div>

                  <div className="inv-row-3">
                    <div className="inv-field">
                      <label>Price (₱)</label>
                      <input type="number" placeholder="0" value={gownForm.price}
                        onChange={e => setGownForm(p => ({ ...p, price: e.target.value }))} />
                    </div>
                    <div className="inv-field">
                      <label>Stock</label>
                      <input type="number" min="0" value={gownForm.stock}
                        onChange={e => setGownForm(p => ({ ...p, stock: e.target.value }))} />
                    </div>
                    <div className="inv-field">
                      <label>Size</label>
                      <input type="text" placeholder="S / M / L / XL" value={gownForm.size}
                        onChange={e => setGownForm(p => ({ ...p, size: e.target.value }))} />
                    </div>
                  </div>

                  <div className="inv-field">
                    <label>Category</label>
                    <select value={gownForm.category} onChange={e => setGownForm(p => ({ ...p, category: e.target.value }))}>
                      {GOWN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="inv-field">
                    <label>Description</label>
                    <textarea rows="3" placeholder="Describe the gown, style, occasion..." value={gownForm.desc}
                      onChange={e => setGownForm(p => ({ ...p, desc: e.target.value }))} />
                  </div>
                </div>

                {/* Petticoat (from the petticoats table) */}
                <div className="inv-form-section">
                  <h4 className="inv-section-title">🩱 Petticoat Included</h4>
                  <div className="inv-petticoat-btns">
                    <button
                      type="button"
                      className={`inv-layer-btn ${gownForm.petticoat_layer === null ? 'active' : ''}`}
                      onClick={() => setGownForm(p => ({ ...p, petticoat_layer: null }))}
                    >
                      None
                    </button>
                    {petticoats.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`inv-layer-btn ${Number(gownForm.petticoat_layer) === Number(p.layer) ? 'active' : ''}`}
                        onClick={() => setGownForm(prev => ({ ...prev, petticoat_layer: Number(p.layer) }))}
                      >
                        Layer {p.layer}
                        <span>{Number(p.price) > 0 ? peso(p.price) : 'Free'}</span>
                      </button>
                    ))}
                  </div>
                  {petticoats.length === 0 && (
                    <p className="inv-no-acc-msg">No layers yet — add some in the Petticoats tab first.</p>
                  )}
                </div>

                {/* Accessories (from the accessories table) */}
                <div className="inv-form-section">
                  <h4 className="inv-section-title">👑 Accessories Included</h4>
                  {accessories.length === 0 ? (
                    <p className="inv-no-acc-msg">No accessories yet — add some in the Accessories tab first.</p>
                  ) : (
                    <div className="inv-acc-checks">
                      {accessories.map(acc => {
                        const stock = Number(acc.stock || 0);
                        return (
                          <label key={acc.id} className="inv-check-label">
                            <input
                              type="checkbox"
                              checked={(gownForm.included_accessories || []).includes(acc.id)}
                              onChange={() => toggleAccInForm(acc.id)}
                            />
                            <span className="inv-check-text">
                              <span className="inv-check-name">{acc.name}</span>
                              <span className="inv-check-cat">
                                {acc.category} ·{' '}
                                <span className={stock === 0 ? 'inv-check-out' : ''}>
                                  {stock === 0 ? 'Out of stock' : `${stock} pcs`}
                                </span>
                              </span>
                            </span>
                            <span className="inv-check-price">{Number(acc.price) > 0 ? peso(acc.price) : 'Free'}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Package summary */}
                <div className="inv-package-note">
                  <div><span>Gown</span><strong>{peso(gownForm.price)}</strong></div>
                  <div><span>Included in package (value)</span><strong>{peso(includedValue())}</strong></div>
                  <p>
                    {gownForm.petticoat_layer ? `Layer ${gownForm.petticoat_layer}` : 'No petticoat'}
                    {' + '}
                    {plural((gownForm.included_accessories || []).length, 'accessory').replace('accessorys', 'accessories')}
                  </p>
                </div>

                {/* Post toggle  +  photo (photo only appears when Publish is ON) */}
                <div className="inv-form-section inv-post-section">
                  <div className="inv-post-toggle-row">
                    <div>
                      <h4 className="inv-section-title">🌐 Publish to Customer Catalog</h4>
                      <p className="inv-post-desc">
                        {gownForm.is_posted
                          ? 'Visible to customers in the catalog. A photo is required.'
                          : 'Draft — not visible to customers yet. No photo needed.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`inv-toggle ${gownForm.is_posted ? 'on' : 'off'}`}
                      onClick={() => setGownForm(p => ({ ...p, is_posted: !p.is_posted }))}
                      aria-label="Toggle publish"
                    >
                      <span className="inv-toggle-knob" />
                    </button>
                  </div>

                  {gownForm.is_posted && (
                    <div className="inv-post-photo">
                      <label className={`inv-upload ${!imagePreview ? 'required' : ''}`}>
                        {imagePreview ? (
                          <>
                            <img src={imagePreview} alt="preview" className="inv-upload-preview" />
                            <div className="inv-upload-overlay"><Camera size={20} /> Change Photo</div>
                          </>
                        ) : (
                          <div className="inv-upload-placeholder">
                            <Upload size={24} />
                            <span>Upload Gown Photo (required to post)</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" onChange={handleImageChange} hidden />
                      </label>
                    </div>
                  )}
                </div>

                <button className="inv-save-btn" onClick={handleSaveGown} disabled={loading}>
                  {loading ? 'Saving...' : editingGown ? 'Save Changes' : 'Add to Inventory'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════ PETTICOAT MODAL ════════ */}
        {pettiModalOpen && (
          <div className="inv-overlay" onClick={() => setPettiModalOpen(false)}>
            <div className="inv-modal inv-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="inv-modal-header">
                <h2>{editingPetti ? `Edit Layer ${editingPetti.layer}` : 'Add Petticoat Layer'}</h2>
                <button className="inv-modal-close" onClick={() => setPettiModalOpen(false)} aria-label="Close"><X size={16} /></button>
              </div>
              <div className="inv-modal-body">
                <div className="inv-field">
                  <label>Layer Number</label>
                  <input type="number" min="1" value={pettiForm.layer}
                    onChange={e => setPettiForm(p => ({ ...p, layer: e.target.value }))} />
                </div>
                <div className="inv-row-2">
                  <div className="inv-field">
                    <label>Price (₱)</label>
                    <input type="number" min="0" placeholder="0 = Free" value={pettiForm.price}
                      onChange={e => setPettiForm(p => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div className="inv-field">
                    <label>Swap Fee (₱)</label>
                    <input type="number" min="0" placeholder="0" value={pettiForm.swap_fee}
                      onChange={e => setPettiForm(p => ({ ...p, swap_fee: e.target.value }))} />
                  </div>
                </div>
                <button className="inv-save-btn" onClick={handleSavePetti} disabled={loading}>
                  {loading ? 'Saving...' : editingPetti ? 'Save Changes' : 'Add Layer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════ ACCESSORY MODAL ════════ */}
        {accModalOpen && (
          <div className="inv-overlay" onClick={() => setAccModalOpen(false)}>
            <div className="inv-modal inv-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="inv-modal-header">
                <h2>{editingAcc ? 'Edit Accessory' : 'Add Accessory'}</h2>
                <button className="inv-modal-close" onClick={() => setAccModalOpen(false)} aria-label="Close"><X size={16} /></button>
              </div>
              <div className="inv-modal-body">
                <div className="inv-field">
                  <label>Name</label>
                  <input type="text" placeholder="e.g. Bowtie - Black, Fil Blue, Crown Gold" value={accForm.name}
                    onChange={e => setAccForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="inv-row-2">
                  <div className="inv-field">
                    <label>Category</label>
                    <select value={accForm.category} onChange={e => setAccForm(p => ({ ...p, category: e.target.value }))}>
                      {ACC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Stock (pcs)</label>
                    <input type="number" min="0" placeholder="0" value={accForm.stock}
                      onChange={e => setAccForm(p => ({ ...p, stock: e.target.value }))} />
                  </div>
                </div>
                <div className="inv-row-2">
                  <div className="inv-field">
                    <label>Price (₱)</label>
                    <input type="number" min="0" placeholder="0 = Free" value={accForm.price}
                      onChange={e => setAccForm(p => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div className="inv-field">
                    <label>Swap Fee (₱)</label>
                    <input type="number" min="0" placeholder="0" value={accForm.swap_fee}
                      onChange={e => setAccForm(p => ({ ...p, swap_fee: e.target.value }))} />
                  </div>
                </div>
                <button className="inv-save-btn" onClick={handleSaveAcc} disabled={loading}>
                  {loading ? 'Saving...' : editingAcc ? 'Save Changes' : 'Add Accessory'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Inventory;