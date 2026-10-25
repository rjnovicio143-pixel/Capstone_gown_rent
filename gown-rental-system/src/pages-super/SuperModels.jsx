import { useState, useEffect } from 'react';
import { Box, Upload, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Header from '../components/Header';
import '../styles/SuperAdmin.css';

const MODEL_BUCKET = 'gown-models';

const SuperModels = () => {
  const [gowns, setGowns] = useState([]);
  const [search, setSearch] = useState('');
  const [uploadingId, setUploadingId] = useState(null);

  const fetchGowns = async () => {
    const { data, error } = await supabase
      .from('gowns')
      .select('id, name, category, image, is_posted, model_path')
      .order('name', { ascending: true });
    if (error) console.error(error);
    else setGowns(data);
  };

  useEffect(() => { fetchGowns(); }, []);

  const handleUpload = async (gown, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!gown.is_posted) {
      alert('I-post una ang gown sa Inventory sa wala pa mag-upload og 3D.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.glb')) {
      alert('.glb file ra ang pwede.');
      return;
    }

    setUploadingId(gown.id);
    const fileName = `${gown.id}_${Date.now()}.glb`;

    const { error: upErr } = await supabase.storage
      .from(MODEL_BUCKET)
      .upload(fileName, file, { contentType: 'model/gltf-binary' });

    if (upErr) {
      alert('Napakyas ang upload: ' + upErr.message);
      setUploadingId(null);
      return;
    }

    const { error: dbErr } = await supabase
      .from('gowns')
      .update({ model_path: fileName })
      .eq('id', gown.id);

    if (dbErr) alert('Na-upload ang file pero napakyas ang pag-save: ' + dbErr.message);

    setUploadingId(null);
    fetchGowns();
  };

  const filtered = gowns.filter((g) =>
    g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Header />
      <div className="sa-page">
        <div className="sa-hero">
          <h1><Box size={22} /> 3D Models</h1>
          <p>Mag-upload og .glb para sa gowns nga naka-post na</p>
        </div>

        <div className="sa-card">
          <div className="sa-search">
            <Search size={14} className="sa-search-icon" />
            <input
              type="text"
              placeholder="Search gown or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="sa-list">
            {filtered.length === 0 && <p className="sa-msg">Walay gown nga nakit-an.</p>}
            {filtered.map((g) => (
              <div key={g.id} className="sa-row">
                <div className="sa-gown-info">
                  <div className="sa-thumb">
                    {g.image && <img src={g.image} alt={g.name} />}
                  </div>
                  <div>
                    <strong>{g.name}</strong>
                    <div className="sa-badges">
                      <span className={`sa-badge ${g.is_posted ? 'ok' : 'warn'}`}>
                        {g.is_posted ? 'Posted' : 'Wala pa na-post'}
                      </span>
                      <span className={`sa-badge ${g.model_path ? 'ok' : 'gray'}`}>
                        {g.model_path ? 'Naay 3D' : 'Walay 3D'}
                      </span>
                    </div>
                  </div>
                </div>

                <label
                  className={`sa-upload-btn ${(!g.is_posted || uploadingId === g.id) ? 'disabled' : ''}`}
                  title={!g.is_posted ? 'I-post una ang gown' : ''}
                >
                  <Upload size={14} />
                  {uploadingId === g.id ? 'Nag-upload...' : g.model_path ? 'Ilisan' : 'Upload'}
                  <input
                    type="file"
                    accept=".glb"
                    hidden
                    disabled={!g.is_posted || uploadingId === g.id}
                    onChange={(e) => handleUpload(g, e)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default SuperModels;