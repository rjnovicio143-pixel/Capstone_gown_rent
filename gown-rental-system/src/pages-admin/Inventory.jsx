import { useState, useEffect } from 'react';
import { Search, PlusCircle, X, Upload, Package, CheckCircle, AlertCircle, Trash2, Edit, Tag, Camera, Ruler } from 'lucide-react'; 
import '../styles/Inventory.css';
import Header from '../components/Header';
import { db } from '../firebase'; 
import { supabase } from '../supabaseClient'; 
import { collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";

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

  useEffect(() => {
    const q = query(collection(db, "gowns"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const gownData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGowns(gownData);
      const uniqueCats = [...new Set(gownData.map(g => g.category))];
      setCategories([...new Set(['Wedding', 'Debut', 'Formal', 'Accessories', ...uniqueCats])]);
    });
    return () => unsubscribe();
  }, []);

  const handleImageChange = (e, isEdit = false) => {
    const file = e.target.files[0];
    if (file) { 
      setImageFile(file);
      const imgUrl = URL.createObjectURL(file);
      if(isEdit) setSelectedGown({...selectedGown, image: imgUrl});
      else setNewGown({ ...newGown, image: imgUrl }); 
    }
  };

  // --- REUSABLE UPLOAD FUNCTION ---
  const uploadToSupabase = async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('Gown images') 
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('Gown images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!newGown.name || !newGown.price) return alert("Palihug butangi og ngalan ug presyo!");
    setLoading(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        imageUrl = await uploadToSupabase(imageFile);
      }

      let finalCategory = isAddingNewCat ? newCatInput : newGown.category;
      await addDoc(collection(db, "gowns"), {
        name: newGown.name,
        price: Number(newGown.price),
        stock: Number(newGown.stock),
        category: finalCategory,
        desc: newGown.desc,
        size: newGown.size, // Gi-save ang size
        image: imageUrl, 
        status: Number(newGown.stock) > 0 ? "Available" : "Out of Stock",
        createdAt: serverTimestamp()
      });

      setIsAddModalOpen(false);
      setNewGown({ name: '', price: '', category: 'Wedding', stock: 1, desc: '', image: null, size: '' });
      setImageFile(null);
      setIsAddingNewCat(false);
      setNewCatInput("");
    } catch (error) { 
      console.error("Error saving gown:", error); 
      alert("Naay sayop sa pag-save.");
    } finally { 
      setLoading(false); 
    }
  };

  const handleDelete = async (id) => {
    if(window.confirm("Sigurado ka nga gusto nimo i-delete kini?")) {
      await deleteDoc(doc(db, "gowns", id));
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

      const gownRef = doc(db, "gowns", selectedGown.id);
      await updateDoc(gownRef, {
        name: selectedGown.name,
        price: Number(selectedGown.price),
        stock: Number(selectedGown.stock),
        desc: selectedGown.desc,
        size: selectedGown.size, // Gi-update ang size
        image: currentImageUrl, 
        status: Number(selectedGown.stock) > 0 ? "Available" : "Out of Stock",
      });

      setIsEditMode(false);
      setSelectedGown(null);
      setImageFile(null);
      alert("Gown updated successfully!");
    } catch (error) { 
      console.error(error); 
      alert("Error updating gown.");
    } finally {
      setLoading(false);
    }
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
        <div className="inventory-summary">
          <div className="stat-card">
            <Package className="stat-icon blue" />
            <div><span>Total Items</span> <h3>{gowns.length}</h3></div>
          </div>
          <div className="stat-card">
            <CheckCircle className="stat-icon green" />
            <div><span>Available</span> <h3>{gowns.filter(g => g.stock > 0).length}</h3></div>
          </div>
          <div className="stat-card">
            <AlertCircle className="stat-icon red" />
            <div><span>Out of Stock</span> <h3>{gowns.filter(g => (g.stock || 0) === 0).length}</h3></div>
          </div>
        </div>

        <header className="inventory-header">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder="Search gowns..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <button className="add-btn" onClick={() => setIsAddModalOpen(true)}>
            <PlusCircle size={18} /> Add New Item
          </button>
        </header>

        <div className="filter-tags">
          <span className={`tag ${filter === "All" ? 'active' : ''}`} onClick={() => setFilter("All")}>All</span>
          {categories.map(tag => (
            <span key={tag} className={`tag ${filter === tag ? 'active' : ''}`} onClick={() => setFilter(tag)}>{tag}</span>
          ))}
        </div>

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header-simple">
                  <h2>Insert New Gown</h2>
                  <button className="close-btn" onClick={() => setIsAddModalOpen(false)}><X /></button>
              </div>
              <div className="add-form-body">
                <label className="upload-container">
                  {newGown.image ? <img src={newGown.image} className="preview-upload" /> : <div className="upload-placeholder"><Upload /><span>Select Photo</span></div>}
                  <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, false)} hidden />
                </label>
                <input type="text" placeholder="Gown Name" value={newGown.name} onChange={(e) => setNewGown({...newGown, name: e.target.value})} />
                <div className="input-group">
                  <input type="number" placeholder="Price (₱)" value={newGown.price} onChange={(e) => setNewGown({...newGown, price: e.target.value})} />
                  <input type="number" placeholder="Stocks" value={newGown.stock} onChange={(e) => setNewGown({...newGown, stock: e.target.value})} />
                  <input type="text" placeholder="Size (e.g. S, M, L)" value={newGown.size} onChange={(e) => setNewGown({...newGown, size: e.target.value})} />
                </div>
                <div className="category-field-wrapper" style={{ marginBottom: '15px' }}>
                  {!isAddingNewCat ? (
                    <select 
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#2a2a2a', color: 'white', border: '1px solid #444' }}
                      value={newGown.category} 
                      onChange={(e) => e.target.value === "ADD_NEW" ? setIsAddingNewCat(true) : setNewGown({...newGown, category: e.target.value})}
                    >
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      <option value="ADD_NEW">+ Add New Category</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" placeholder="New category..." style={{ flex: 1, border: '1px solid #ffd900' }} value={newCatInput} onChange={(e) => setNewCatInput(e.target.value)} autoFocus />
                      <button type="button" onClick={() => setIsAddingNewCat(false)}>Back</button>
                    </div>
                  )}
                </div>
                <textarea placeholder="Description" value={newGown.desc} onChange={(e) => setNewGown({...newGown, desc: e.target.value})} />
                <button className="save-btn" onClick={handleSave} disabled={loading}>
                  {loading ? "Saving..." : "Save to Inventory"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- DETAILS & EDIT MODAL --- */}
        {selectedGown && (
          <div className="modal-overlay" onClick={() => { if(!loading) setSelectedGown(null); setIsEditMode(false); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="close-modal" onClick={() => setSelectedGown(null)}><X /></button>
              <div className="modal-body">
                <div className="modal-image">
                  {isEditMode ? (
                    <label className="edit-upload-label">
                      {selectedGown.image ? <img src={selectedGown.image} className="full-img" /> : <div className="no-img">👗</div>}
                      <div className="edit-image-overlay"><Camera size={24} /> <span>Change Photo</span></div>
                      <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, true)} hidden />
                    </label>
                  ) : (
                    selectedGown.image ? <img src={selectedGown.image} className="full-img" /> : <div className="no-img">👗</div>
                  )}
                </div>
                <div className="modal-info">
                  {isEditMode ? (
                    <div className="edit-form">
                      <label>Gown Name</label>
                      <input type="text" value={selectedGown.name} onChange={(e) => setSelectedGown({...selectedGown, name: e.target.value})} />
                      <label>Price (₱)</label>
                      <input type="number" value={selectedGown.price} onChange={(e) => setSelectedGown({...selectedGown, price: e.target.value})} />
                      <label>Stocks</label>
                      <input type="number" value={selectedGown.stock} onChange={(e) => setSelectedGown({...selectedGown, stock: e.target.value})} />
                      <label>Size</label>
                      <input type="text" value={selectedGown.size} onChange={(e) => setSelectedGown({...selectedGown, size: e.target.value})} />
                      <label>Description</label>
                      <textarea value={selectedGown.desc} onChange={(e) => setSelectedGown({...selectedGown, desc: e.target.value})} />
                      <button className="update-btn" onClick={handleUpdate} disabled={loading}>
                         {loading ? "Updating..." : "Save Changes"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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