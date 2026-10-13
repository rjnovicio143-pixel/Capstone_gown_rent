import { useState, useEffect } from 'react';
import {
  Search, PlusCircle, X, Upload, Package, CheckCircle,
  AlertCircle, Trash2, Edit, Camera, Eye, EyeOff,
  Crown, Layers, ShoppingBag, Globe
} from 'lucide-react';
import '../styles/Inventory.css';
import Header from '../components/Header';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';

const PETTICOAT_LAYERS = [
  { value: null, label: 'None' },
  { value: 1,    label: 'Layer 1' },
  { value: 2,    label: 'Layer 2' },
  { value: 3,    label: 'Layer 3' },
];

const GOWN_CATEGORIES = ['Wedding', 'Debut', 'Formal', 'Ball Gown', 'Others'];

const emptyGownForm = {
  name: '', price: '', stock: 1, size: '', category: 'Wedding',
  desc: '', image: null,
  petticoat_layer: null,
  included_accessories: [],
  is_posted: false,
};

const Inventory = () => {
  const [activeTab, setActiveTab]         = useState('gowns');

  // Gowns
  const [gowns, setGowns]                 = useState([]);
  const [searchTerm, setSearchTerm]       = useState('');
  const [filterPosted, setFilterPosted]   = useState('all'); // 'all' | 'posted' | 'draft'

  // Accessories catalog
  const [accessories, setAccessories]     = useState([]);
  const [accSearch, setAccSearch]         = useState('');

  // Gown modal
  const [gownModalOpen, setGownModalOpen] = useState(false);
  const [editingGown, setEditingGown]     = useState(null);   // null = add mode
  const [gownForm, setGownForm]           = useState(emptyGownForm);
  const [imageFile, setImageFile]         = useState(null);
  const [imagePreview, setImagePreview]   = useState(null);

  // Accessory modal
  const [accModalOpen, setAccModalOpen]   = useState(false);
  const [editingAcc, setEditingAcc]       = useState(null);
  const [accForm, setAccForm]             = useState({ name: '', category: 'Others' });

  const [loading, setLoading]             = useState(false);

  // ── FETCH ──
  const fetchGowns = async () => {
    const { data, error } = await supabase
      .from('gowns')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setGowns(data || []);
  };

  const fetchAccessories = async () => {
    const { data, error } = await supabase
      .from('accessories')
      .select('*')
      .order('category', { ascending: true });
    if (!error) setAccessories(data || []);
  };

  useEffect(() => {
    fetchGowns();
    fetchAccessories();
  }, []);

  // ── IMAGE HELPERS ──
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setGownForm(prev => ({ ...prev, image: URL.createObjectURL(file) }));
  };

  const uploadImage = async (file) => {
    const ext      = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('Gown images').upload(fileName, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('Gown images').getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  // ── OPEN MODALS ──
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
      name:                    gown.name        || '',
      price:                   gown.price       || '',
      stock:                   gown.stock       ?? 1,
      size:                    gown.size        || '',
      category:                gown.category    || 'Wedding',
      desc:                    gown.desc        || '',
      image:                   gown.image       || null,
      petticoat_layer:         gown.petticoat_layer ?? null,
      included_accessories:    gown.included_accessories || [],
      is_posted:               gown.is_posted   || false,
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

  // ── SAVE GOWN (add or update) ──
  const handleSaveGown = async () => {
    if (!gownForm.name.trim())    return alert('Palihug butangi og ngalan ang gown.');
    if (!gownForm.price)          return alert('Palihug butangi og presyo.');
    setLoading(true);
    try {
      let imageUrl = editingGown?.image || '';
      if (imageFile) imageUrl = await uploadImage(imageFile);

      const payload = {
        name:                 gownForm.name.trim(),
        price:                Number(gownForm.price),
        stock:                Number(gownForm.stock),
        size:                 gownForm.size,
        category:             gownForm.category,
        desc:                 gownForm.desc,
        image:                imageUrl,
        petticoat_layer:      gownForm.petticoat_layer,
        included_accessories: gownForm.included_accessories,
        is_posted:            gownForm.is_posted,
        status:               Number(gownForm.stock) > 0 ? 'Available' : 'Out of Stock',
        type:                 'gown',
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
      alert('Naay sayop: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── TOGGLE POST ──
  const handleTogglePost = async (gown) => {
    const next = !gown.is_posted;

    // Must have price & image before posting
    if (next && (!gown.price || gown.price <= 0)) {
      return alert('Palihug set-an og presyo ang gown bago i-post.');
    }

    const { error } = await supabase
      .from('gowns')
      .update({ is_posted: next })
      .eq('id', gown.id);

    if (error) { alert('Naay sayop: ' + error.message); return; }

    await logActivity('gown_edited', `${next ? 'Posted' : 'Unpublished'} gown: ${gown.name}`);
    fetchGowns();
  };

  // ── DELETE GOWN (with active-booking protection) ──
  const handleDeleteGown = async (gown) => {
    // Check if gown has active bookings
    const { count, error: countErr } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('gown_id', gown.id)
      .not('return_status', 'in', '("returned","cancelled")');

    if (countErr) { console.error(countErr); }

    if (count > 0) {
      alert(`Dili ma-delete ang "${gown.name}" — naa pa kini ${count} ka aktibo nga booking/rental.`);
      return;
    }

    if (!window.confirm(`Delete "${gown.name}"? Dili na kini ma-undo.`)) return;

    const { error } = await supabase.from('gowns').delete().eq('id', gown.id);
    if (error) { alert('Naay sayop: ' + error.message); return; }

    await logActivity('gown_deleted', `Deleted gown: ${gown.name}`);
    fetchGowns();
  };

  // ── ACCESSORIES CRUD ──
  const openAddAcc = () => {
    setEditingAcc(null);
    setAccForm({ name: '', category: 'Others' });
    setAccModalOpen(true);
  };

  const openEditAcc = (acc) => {
    setEditingAcc(acc);
    setAccForm({ name: acc.name, category: acc.category });
    setAccModalOpen(true);
  };

  const handleSaveAcc = async () => {
    if (!accForm.name.trim()) return alert('Palihug butangi og ngalan.');
    setLoading(true);
    try {
      if (editingAcc) {
        const { error } = await supabase
          .from('accessories')
          .update({ name: accForm.name.trim(), category: accForm.category })
          .eq('id', editingAcc.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('accessories')
          .insert([{ name: accForm.name.trim(), category: accForm.category }]);
        if (error) throw error;
      }
      fetchAccessories();
      setAccModalOpen(false);
    } catch (err) {
      alert('Naay sayop: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAcc = async (acc) => {
    if (!window.confirm(`Delete "${acc.name}"?`)) return;
    await supabase.from('accessories').delete().eq('id', acc.id);
    fetchAccessories();
  };

  // ── ACCESSORY CHECKBOX TOGGLE in gown form ──
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

  // Helper: get accessory name from id
  const accName = (id) => accessories.find(a => a.id === id)?.name || `#${id}`;

  // ── FILTERED DATA ──
  const filteredGowns = gowns.filter(g => {
    const matchSearch = g.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPosted =
      filterPosted === 'all'    ? true :
      filterPosted === 'posted' ? g.is_posted :
                                  !g.is_posted;
    return matchSearch && matchPosted;
  });

  const filteredAccs = accessories.filter(a =>
    a.name?.toLowerCase().includes(accSearch.toLowerCase())
  );

  // ── STATS ──
  const totalGowns   = gowns.length;
  const postedCount  = gowns.filter(g => g.is_posted).length;
  const draftCount   = gowns.filter(g => !g.is_posted).length;
  const outCount     = gowns.filter(g => (g.stock || 0) === 0).length;

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
            <Crown className="inv-stat-icon gold" />
            <div><span>Accessories</span><h3>{accessories.length}</h3></div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="inv-tabs">
          <button
            className={`inv-tab ${activeTab === 'gowns' ? 'active' : ''}`}
            onClick={() => setActiveTab('gowns')}
          >
            👗 Gowns
          </button>
          <button
            className={`inv-tab ${activeTab === 'accessories' ? 'active' : ''}`}
            onClick={() => setActiveTab('accessories')}
          >
            👑 Accessories
          </button>
        </div>

        {/* ════════════════════════════════
            TAB: GOWNS
        ════════════════════════════════ */}
        {activeTab === 'gowns' && (
          <>
            {/* Toolbar */}
            <div className="inv-toolbar">
              <div className="inv-search">
                <Search size={16} />
                <input
                  placeholder="Search gowns..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="inv-filter-pills">
                {['all', 'posted', 'draft'].map(f => (
                  <button
                    key={f}
                    className={`inv-pill ${filterPosted === f ? 'active' : ''}`}
                    onClick={() => setFilterPosted(f)}
                  >
                    {f === 'all' ? 'All' : f === 'posted' ? '🌐 Posted' : '📝 Draft'}
                  </button>
                ))}
              </div>

              <button className="inv-add-btn" onClick={openAddGown}>
                <PlusCircle size={18} /> Add Gown
              </button>
            </div>

            {/* Grid */}
            <div className="inv-grid">
              {filteredGowns.length === 0 ? (
                <div className="inv-empty">No gowns found.</div>
              ) : filteredGowns.map(gown => (
                <div key={gown.id} className="inv-card">
                  {/* Status badge */}
                  <div className={`inv-post-badge ${gown.is_posted ? 'posted' : 'draft'}`}>
                    {gown.is_posted ? '🌐 Posted' : '📝 Draft'}
                  </div>

                  {/* Image */}
                  <div className="inv-card-img">
                    {gown.image
                      ? <img src={gown.image} alt={gown.name} />
                      : <div className="inv-no-img">👗</div>
                    }
                    <span className={`inv-stock-tag ${gown.stock > 0 ? 'in' : 'out'}`}>
                      {gown.stock || 0} left
                    </span>
                  </div>

                  {/* Info */}
                  <div className="inv-card-body">
                    <span className="inv-card-cat">{gown.category}</span>
                    <h3 className="inv-card-name">{gown.name}</h3>
                    <p className="inv-card-price">₱{Number(gown.price).toLocaleString()}</p>

                    {/* Included items chips */}
                    <div className="inv-chips">
                      {gown.petticoat_layer && (
                        <span className="inv-chip chip-petticoat">
                          <Layers size={11} /> Layer {gown.petticoat_layer}
                        </span>
                      )}
                      {(gown.included_accessories || []).map(id => (
                        <span key={id} className="inv-chip chip-acc">
                          <Crown size={11} /> {accName(id)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="inv-card-actions">
                    <button className="inv-act-btn edit" onClick={() => openEditGown(gown)}>
                      <Edit size={14} /> Edit
                    </button>
                    <button
                      className={`inv-act-btn ${gown.is_posted ? 'unpost' : 'post'}`}
                      onClick={() => handleTogglePost(gown)}
                    >
                      {gown.is_posted
                        ? <><EyeOff size={14} /> Unpost</>
                        : <><Eye size={14} /> Post</>
                      }
                    </button>
                    <button className="inv-act-btn del" onClick={() => handleDeleteGown(gown)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ════════════════════════════════
            TAB: ACCESSORIES
        ════════════════════════════════ */}
        {activeTab === 'accessories' && (
          <>
            <div className="inv-toolbar">
              <div className="inv-search">
                <Search size={16} />
                <input
                  placeholder="Search accessories..."
                  value={accSearch}
                  onChange={e => setAccSearch(e.target.value)}
                />
              </div>
              <button className="inv-add-btn" onClick={openAddAcc}>
                <PlusCircle size={18} /> Add Accessory
              </button>
            </div>

            <div className="acc-list">
              {filteredAccs.length === 0 ? (
                <div className="inv-empty">No accessories found.</div>
              ) : filteredAccs.map(acc => (
                <div key={acc.id} className="acc-row">
                  <div className="acc-row-info">
                    <span className="acc-icon">👑</span>
                    <div>
                      <p className="acc-name">{acc.name}</p>
                      <span className="acc-cat">{acc.category}</span>
                    </div>
                  </div>
                  <div className="acc-row-actions">
                    <button className="inv-act-btn edit" onClick={() => openEditAcc(acc)}>
                      <Edit size={14} /> Edit
                    </button>
                    <button className="inv-act-btn del" onClick={() => handleDeleteAcc(acc)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ════════════════════════════════
            GOWN MODAL (Add / Edit)
        ════════════════════════════════ */}
        {gownModalOpen && (
          <div className="inv-overlay" onClick={closeGownModal}>
            <div className="inv-modal" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="inv-modal-header">
                <h2>{editingGown ? 'Edit Gown Package' : 'Add New Gown Package'}</h2>
                <button className="inv-modal-close" onClick={closeGownModal}>
                  <X size={16} />
                </button>
              </div>

              <div className="inv-modal-body">

                {/* Image upload */}
                <label className="inv-upload">
                  {imagePreview
                    ? <>
                        <img src={imagePreview} alt="preview" className="inv-upload-preview" />
                        <div className="inv-upload-overlay"><Camera size={20} /> Change Photo</div>
                      </>
                    : <div className="inv-upload-placeholder">
                        <Upload size={24} />
                        <span>Upload Gown Photo</span>
                      </div>
                  }
                  <input type="file" accept="image/*" onChange={handleImageChange} hidden />
                </label>

                {/* Basic fields */}
                <div className="inv-form-section">
                  <h4 className="inv-section-title">📝 Basic Info</h4>

                  <div className="inv-field">
                    <label>Gown Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Mermaid Wedding Gown"
                      value={gownForm.name}
                      onChange={e => setGownForm(p => ({ ...p, name: e.target.value }))}
                    />
                  </div>

                  <div className="inv-row-3">
                    <div className="inv-field">
                      <label>Price (₱)</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={gownForm.price}
                        onChange={e => setGownForm(p => ({ ...p, price: e.target.value }))}
                      />
                    </div>
                    <div className="inv-field">
                      <label>Stock</label>
                      <input
                        type="number"
                        min="0"
                        value={gownForm.stock}
                        onChange={e => setGownForm(p => ({ ...p, stock: e.target.value }))}
                      />
                    </div>
                    <div className="inv-field">
                      <label>Size</label>
                      <input
                        type="text"
                        placeholder="S / M / L / XL"
                        value={gownForm.size}
                        onChange={e => setGownForm(p => ({ ...p, size: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="inv-field">
                    <label>Category</label>
                    <select
                      value={gownForm.category}
                      onChange={e => setGownForm(p => ({ ...p, category: e.target.value }))}
                    >
                      {GOWN_CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="inv-field">
                    <label>Description</label>
                    <textarea
                      rows="3"
                      placeholder="Describe the gown, style, occasion..."
                      value={gownForm.desc}
                      onChange={e => setGownForm(p => ({ ...p, desc: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Petticoat */}
                <div className="inv-form-section">
                  <h4 className="inv-section-title">🩱 Petticoat Included</h4>
                  <div className="inv-petticoat-btns">
                    {PETTICOAT_LAYERS.map(opt => (
                      <button
                        key={opt.label}
                        type="button"
                        className={`inv-layer-btn ${gownForm.petticoat_layer === opt.value ? 'active' : ''}`}
                        onClick={() => setGownForm(p => ({ ...p, petticoat_layer: opt.value }))}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accessories */}
                <div className="inv-form-section">
                  <h4 className="inv-section-title">👑 Accessories Included</h4>
                  {accessories.length === 0 ? (
                    <p className="inv-no-acc-msg">
                      No accessories yet — add some in the Accessories tab first.
                    </p>
                  ) : (
                    <div className="inv-acc-checks">
                      {accessories.map(acc => (
                        <label key={acc.id} className="inv-check-label">
                          <input
                            type="checkbox"
                            checked={(gownForm.included_accessories || []).includes(acc.id)}
                            onChange={() => toggleAccInForm(acc.id)}
                          />
                          <span className="inv-check-text">
                            <span className="inv-check-name">{acc.name}</span>
                            <span className="inv-check-cat">{acc.category}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Post toggle */}
                <div className="inv-form-section inv-post-section">
                  <div className="inv-post-toggle-row">
                    <div>
                      <h4 className="inv-section-title" style={{ marginBottom: 2 }}>
                        🌐 Publish to Customer Catalog
                      </h4>
                      <p className="inv-post-desc">
                        {gownForm.is_posted
                          ? 'Visible na sa customers — makita na nila sa catalog.'
                          : 'Draft pa — dili pa makita sa customers.'
                        }
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`inv-toggle ${gownForm.is_posted ? 'on' : 'off'}`}
                      onClick={() => setGownForm(p => ({ ...p, is_posted: !p.is_posted }))}
                    >
                      <span className="inv-toggle-knob" />
                    </button>
                  </div>
                </div>

                {/* Save */}
                <button className="inv-save-btn" onClick={handleSaveGown} disabled={loading}>
                  {loading
                    ? 'Saving...'
                    : editingGown ? 'Save Changes' : 'Add to Inventory'
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            ACCESSORY MODAL (Add / Edit)
        ════════════════════════════════ */}
        {accModalOpen && (
          <div className="inv-overlay" onClick={() => setAccModalOpen(false)}>
            <div className="inv-modal inv-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="inv-modal-header">
                <h2>{editingAcc ? 'Edit Accessory' : 'Add Accessory'}</h2>
                <button className="inv-modal-close" onClick={() => setAccModalOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="inv-modal-body">
                <div className="inv-field">
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Crown Gold"
                    value={accForm.name}
                    onChange={e => setAccForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="inv-field">
                  <label>Category</label>
                  <select
                    value={accForm.category}
                    onChange={e => setAccForm(p => ({ ...p, category: e.target.value }))}
                  >
                    {['Crown', 'Necklace', 'Earrings', 'Gloves', 'Veil', 'Others'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
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