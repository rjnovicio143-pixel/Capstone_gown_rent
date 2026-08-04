import { useState, useEffect } from 'react';
import { Search, PlusCircle, X, Upload, Package, CheckCircle, AlertCircle, Trash2, Edit, Camera } from 'lucide-react';
import '../styles/Inventory.css';
import Header from '../components/Header';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';

const Inventory = () => {
  const [gowns, setGowns] = useState([]);
  const [selectedGown, setSelectedGown] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("All");
  const [categories, setCategories] = useState(['Wedding', 'Debut', 'Formal', 'Accessories']);
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const [newGown, setNewGown] = useState({
    name: '', price: '', category: 'Wedding', stock: 1, desc: '', image: null, size: ''
  });

  // --- FETCH DATA FROM SUPABASE ---
  useEffect(() => {
    fetchGowns();
  }, []);

  const fetchGowns = async () => {
    const { data, error } = await supabase
      .from('gowns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching gowns:", error);
    } else {
      setGowns(data);
      const uniqueCats = [...new Set(data.map(g => g.category))];
      setCategories([...new Set(['Wedding', 'Debut', 'Formal', 'Accessories', ...uniqueCats])]);
    }
  };

  const handleImageChange = (e, isEdit = false) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const imgUrl = URL.createObjectURL(file);
      if (isEdit) setSelectedGown({ ...selectedGown, image: imgUrl });
      else setNewGown({ ...newGown, image: imgUrl });
    }
  };

  const uploadToSupabase = async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('Gown images')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('Gown images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  const resetAddForm = () => {
    setNewGown({ name: '', price: '', category: 'Wedding', stock: 1, desc: '', image: null, size: '' });
    setImageFile(null);
    setIsAddingNewCat(false);
    setNewCatInput("");
  };

  const handleSave = async () => {
    if (!newGown.name || !newGown.price) return alert("Palihug butangi og ngalan ug presyo!");
    setLoading(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        imageUrl = await uploadToSupabase(imageFile);
      }

      const finalCategory = isAddingNewCat ? newCatInput : newGown.category;

      const { error } = await supabase.from('gowns').insert([{
        name: newGown.name,
        price: Number(newGown.price),
        stock: Number(newGown.stock),
        category: finalCategory,
        desc: newGown.desc,
        size: newGown.size,
        image: imageUrl,
        status: Number(newGown.stock) > 0 ? "Available" : "Out of Stock"
      }]);

      if (error) throw error;

      await logActivity('gown_added', `Added gown: ${newGown.name} (${finalCategory})`);

      fetchGowns();
      setIsAddModalOpen(false);
      resetAddForm();
    } catch (error) {
      console.error("Error saving gown:", error);
      alert("Naay sayop sa pag-save: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Sigurado ka nga gusto nimo i-delete kini?")) {
      const gownToDelete = gowns.find(g => g.id === id);
      await supabase.from('gowns').delete().eq('id', id);
      await logActivity('gown_deleted', `Deleted gown: ${gownToDelete?.name || id}`);
      fetchGowns();
      setSelectedGown(null);
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      let currentImageUrl = selectedGown.image;

      if (imageFile) {
        currentImageUrl = await uploadToSupabase(imageFile);
      }

      const { error } = await supabase
        .from('gowns')
        .update({
          name: selectedGown.name,
          price: Number(selectedGown.price),
          stock: Number(selectedGown.stock),
          desc: selectedGown.desc,
          size: selectedGown.size,
          image: currentImageUrl,
          status: Number(selectedGown.stock) > 0 ? "Available" : "Out of Stock",
        })
        .eq('id', selectedGown.id);

      if (error) throw error;

      await logActivity('gown_edited', `Edited gown: ${selectedGown.name}`);

      fetchGowns();
      setIsEditMode(false);
      setSelectedGown(null);
      setImageFile(null);
      alert("Gown updated successfully!");
    } catch (error) {
      console.error(error);
      alert("Error updating gown: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const closeDetailsModal = () => {
    if (loading) return;
    setSelectedGown(null);
    setIsEditMode(false);
    setImageFile(null);
  };

  const filteredGowns = gowns.filter(gown => {
    const matchesSearch = gown.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === "All" || gown.category === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="inventory-page-wrapper">
      <Header />
      <div className="inventory-container">
        {/* --- SUMMARY --- */}
        <div className="inventory-summary">
          <div className="stat-card">
            <Package className="stat-icon blue" />
            <div><span>Total Items</span><h3>{gowns.length}</h3></div>
          </div>
          <div className="stat-card">
            <CheckCircle className="stat-icon green" />
            <div><span>Available</span><h3>{gowns.filter(g => g.stock > 0).length}</h3></div>
          </div>
          <div className="stat-card">
            <AlertCircle className="stat-icon red" />
            <div><span>Out of Stock</span><h3>{gowns.filter(g => (g.stock || 0) === 0).length}</h3></div>
          </div>
        </div>

        {/* --- SEARCH + ADD --- */}
        <header className="inventory-header">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search gowns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="add-btn" onClick={() => setIsAddModalOpen(true)}>
            <PlusCircle size={18} /> Add New Item
          </button>
        </header>

        {/* --- FILTER TAGS --- */}
        <div className="filter-tags">
          <span className={`tag ${filter === "All" ? 'active' : ''}`} onClick={() => setFilter("All")}>All</span>
          {categories.map(tag => (
            <span key={tag} className={`tag ${filter === tag ? 'active' : ''}`} onClick={() => setFilter(tag)}>{tag}</span>
          ))}
        </div>

        {/* --- GRID --- */}
        <div className="gown-grid">
          {filteredGowns.map((gown) => (
            <div key={gown.id} className="gown-card" onClick={() => { setSelectedGown(gown); setIsEditMode(false); }}>
              <div className="image-box">
                <span className="category-badge">{gown.category}</span>
                <span className={`stock-indicator ${gown.stock > 0 ? 'in' : 'out'}`}>{gown.stock || 0} left</span>
                {gown.image ? <img src={gown.image} alt={gown.name} className="gown-img-preview" /> : <div className="no-img">👗</div>}
              </div>
              <div className="gown-info">
                <h3>{gown.name}</h3>
                <div className="gown-info-row">
                  <p className="price">₱{gown.price?.toLocaleString()}</p>
                  <span className="size-tag">Size: {gown.size || 'N/A'}</span>
                </div>
                <p className={`status ${gown.stock > 0 ? 'available' : 'rented-out'}`}>
                  {gown.stock > 0 ? 'Available' : 'Out of Stock'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* --- ADD MODAL --- */}
        {isAddModalOpen && (
          <div className="modal-overlay" onClick={() => { if (!loading) setIsAddModalOpen(false); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-simple">
                <h2>Insert New Gown</h2>
                <button className="close-btn" onClick={() => setIsAddModalOpen(false)}><X size={18} /></button>
              </div>
              <div className="add-form-body">
                <label className="upload-container">
                  {newGown.image
                    ? <img src={newGown.image} className="preview-upload" alt="preview" />
                    : <div className="upload-placeholder"><Upload /><span>Select Photo</span></div>}
                  <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, false)} hidden />
                </label>

                <input
                  type="text"
                  placeholder="Gown Name"
                  value={newGown.name}
                  onChange={(e) => setNewGown({ ...newGown, name: e.target.value })}
                />

                <div className="input-group">
                  <input
                    type="number"
                    placeholder="Price (₱)"
                    value={newGown.price}
                    onChange={(e) => setNewGown({ ...newGown, price: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="Stocks"
                    value={newGown.stock}
                    onChange={(e) => setNewGown({ ...newGown, stock: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Size (e.g. S, M, L)"
                    value={newGown.size}
                    onChange={(e) => setNewGown({ ...newGown, size: e.target.value })}
                  />
                </div>

                <div className="category-field-wrapper">
                  {!isAddingNewCat ? (
                    <select
                      className="category-select"
                      value={newGown.category}
                      onChange={(e) => e.target.value === "ADD_NEW" ? setIsAddingNewCat(true) : setNewGown({ ...newGown, category: e.target.value })}
                    >
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      <option value="ADD_NEW">+ Add New Category</option>
                    </select>
                  ) : (
                    <div className="new-category-row">
                      <input
                        type="text"
                        placeholder="New category..."
                        value={newCatInput}
                        onChange={(e) => setNewCatInput(e.target.value)}
                        autoFocus
                      />
                      <button type="button" onClick={() => setIsAddingNewCat(false)}>Back</button>
                    </div>
                  )}
                </div>

                <textarea
                  placeholder="Description"
                  value={newGown.desc}
                  onChange={(e) => setNewGown({ ...newGown, desc: e.target.value })}
                />

                <button className="save-btn" onClick={handleSave} disabled={loading}>
                  {loading ? "Saving..." : "Save to Inventory"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- DETAILS & EDIT MODAL --- */}
        {selectedGown && (
          <div className="modal-overlay" onClick={closeDetailsModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="close-modal" onClick={closeDetailsModal}><X size={18} /></button>

              <div className="modal-body">
                <div className="modal-image">
                  {isEditMode ? (
                    <label className="edit-upload-label">
                      {selectedGown.image ? <img src={selectedGown.image} className="full-img" alt={selectedGown.name} /> : <div className="no-img">👗</div>}
                      <div className="edit-image-overlay"><Camera size={24} /><span>Change Photo</span></div>
                      <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, true)} hidden />
                    </label>
                  ) : (
                    selectedGown.image ? <img src={selectedGown.image} className="full-img" alt={selectedGown.name} /> : <div className="no-img">👗</div>
                  )}
                </div>

                <div className="modal-info">
                  {isEditMode ? (
                    <div className="edit-form">
                      <label>Gown Name</label>
                      <input type="text" value={selectedGown.name} onChange={(e) => setSelectedGown({ ...selectedGown, name: e.target.value })} />

                      <label>Price (₱)</label>
                      <input type="number" value={selectedGown.price} onChange={(e) => setSelectedGown({ ...selectedGown, price: e.target.value })} />

                      <label>Stocks</label>
                      <input type="number" value={selectedGown.stock} onChange={(e) => setSelectedGown({ ...selectedGown, stock: e.target.value })} />

                      <label>Size</label>
                      <input type="text" value={selectedGown.size} onChange={(e) => setSelectedGown({ ...selectedGown, size: e.target.value })} />

                      <label>Description</label>
                      <textarea value={selectedGown.desc} onChange={(e) => setSelectedGown({ ...selectedGown, desc: e.target.value })} />

                      <button className="update-btn" onClick={handleUpdate} disabled={loading}>
                        {loading ? "Updating..." : "Save Changes"}
                      </button>
                      <button className="cancel-btn" onClick={() => setIsEditMode(false)} disabled={loading}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="modal-info-top">
                        <span className="modal-category">{selectedGown.category}</span>
                        <span className="size-badge">Size: {selectedGown.size || 'N/A'}</span>
                      </div>
                      <h2>{selectedGown.name}</h2>
                      <p className="modal-desc">{selectedGown.desc}</p>
                      <h3 className="modal-price">₱{selectedGown.price?.toLocaleString()}</h3>
                      <div className="modal-actions">
                        <button className="edit-action-btn" onClick={() => setIsEditMode(true)}><Edit size={16} /> Edit</button>
                        <button className="delete-action-btn" onClick={() => handleDelete(selectedGown.id)}><Trash2 size={16} /> Delete</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;