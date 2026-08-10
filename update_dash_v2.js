const fs = require('fs');
const path = 'c:/Users/purelogic/.gemini/antigravity-ide/scratch/pranaair-test-blog/app/admin/dashboard/DashboardClient.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Update loadBannerToEdit and related state functions
const stateCodeOld = `  const loadBannerToEdit = (type, category = '', banners = bannerSettings) => {
    setActiveBannerTab(type === 'global' ? 'global' : category);
    const existing = banners.find(b => b.type === type && (type === 'global' || b.category === category));
    if (existing) {
      setEditingBanner(existing);
    } else {
      setEditingBanner({
        type,
        category,
        promotion: { imageUrl: '', text: '', link: '', endDate: '', isActive: false }
      });
    }
  };`;

const stateCodeNew = `  const loadBannerToEdit = (id, banners = bannerSettings) => {
    setActiveBannerTab(id);
    if (id === 'global') {
      const existing = banners.find(b => b.type === 'global');
      if (existing) {
        setEditingBanner(existing);
      } else {
        setEditingBanner({
          type: 'global',
          promotion: { imageUrl: '', text: '', link: '', endDate: '', isActive: false }
        });
      }
    } else if (id === 'new') {
      setEditingBanner({
        type: 'category',
        name: 'New Campaign',
        categories: [],
        promotion: { imageUrl: '', text: '', link: '', endDate: '', isActive: false }
      });
    } else {
      const existing = banners.find(b => b._id === id);
      if (existing) {
        setEditingBanner(existing);
      }
    }
  };

  const handleBannerDelete = async () => {
    if (!editingBanner._id || editingBanner.type === 'global') return;
    if (!confirm('Are you sure you want to delete this banner campaign?')) return;
    
    try {
      const res = await fetch('/api/admin/banners?id=' + editingBanner._id, { method: 'DELETE' });
      if (res.ok) {
        fetchBanners();
        setActiveBannerTab('global');
      } else {
        alert('Failed to delete banner');
      }
    } catch (err) {
      alert('Network error');
    }
  };

  const handleCategoryCheckbox = (cat) => {
    setEditingBanner(prev => {
      const currentCats = prev.categories || [];
      if (currentCats.includes(cat)) {
        return { ...prev, categories: currentCats.filter(c => c !== cat) };
      } else {
        return { ...prev, categories: [...currentCats, cat] };
      }
    });
  };`;

content = content.replace(stateCodeOld, stateCodeNew);
content = content.replace(`loadBannerToEdit('global', '', data.banners);`, `loadBannerToEdit('global', data.banners);`);

// 2. Update the UI block
// First, find the start of the banners tab UI
const uiStartIdx = content.indexOf(`{activeTab === 'banners' && (`);
const uiEndIdx = content.lastIndexOf(`</div>\n      )}\n    </div>\n  );\n}`);

const newUI = `{activeTab === 'banners' && (
        <div style={{ padding: '1rem 0' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => loadBannerToEdit('global')}
              style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: activeBannerTab === 'global' ? '#74b75c' : '#e5e7eb', color: activeBannerTab === 'global' ? 'white' : '#4b5563' }}
            >
              Global Banner
            </button>
            {bannerSettings.filter(b => b.type === 'category').map((banner) => (
              <button
                key={banner._id}
                onClick={() => loadBannerToEdit(banner._id)}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: activeBannerTab === banner._id ? '#74b75c' : '#e5e7eb', color: activeBannerTab === banner._id ? 'white' : '#4b5563' }}
              >
                {banner.name || 'Unnamed Campaign'}
              </button>
            ))}
            <button
              onClick={() => loadBannerToEdit('new')}
              style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: '1px dashed #74b75c', cursor: 'pointer', backgroundColor: activeBannerTab === 'new' ? '#74b75c' : 'transparent', color: activeBannerTab === 'new' ? 'white' : '#74b75c' }}
            >
              + Create Campaign
            </button>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                {editingBanner.type === 'global' ? 'Global Banner Settings' : (editingBanner._id ? 'Edit Campaign' : 'New Campaign')}
              </h3>
              {editingBanner.type === 'category' && editingBanner._id && (
                 <button onClick={handleBannerDelete} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>Delete Campaign</button>
              )}
            </div>

            <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '600px' }}>
              {editingBanner.type === 'category' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Campaign Name</label>
                    <input
                      type="text"
                      value={editingBanner.name || ''}
                      onChange={e => setEditingBanner({ ...editingBanner, name: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                      placeholder="e.g. Summer Sale 2026"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Target Categories</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb', maxHeight: '200px', overflowY: 'auto' }}>
                      {categories.map((cat, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="checkbox" 
                            id={\`cat-\${i}\`}
                            checked={(editingBanner.categories || []).includes(cat)}
                            onChange={() => handleCategoryCheckbox(cat)}
                          />
                          <label htmlFor={\`cat-\${i}\`} style={{ fontSize: '0.9rem', color: '#4b5563' }}>{cat}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Image URL</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={editingBanner.promotion?.imageUrl || ''}
                    onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, imageUrl: e.target.value } })}
                    style={{ flexGrow: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    placeholder="https://..."
                  />
                  <button 
                    onClick={handleBannerImageUpload} 
                    style={{ padding: '0.75rem 1.25rem', background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#4b5563', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  >
                    Upload
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Promotion Text</label>
                <input
                  type="text"
                  value={editingBanner.promotion?.text || ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, text: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  placeholder="Get 20% off..."
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Destination Link</label>
                <input
                  type="text"
                  value={editingBanner.promotion?.link || ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, link: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  placeholder="https://..."
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>End Date</label>
                <input
                  type="date"
                  value={editingBanner.promotion?.endDate ? new Date(editingBanner.promotion.endDate).toISOString().split('T')[0] : ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, endDate: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editingBanner.promotion?.isActive || false}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, isActive: e.target.checked } })}
                  style={{ width: '1.25rem', height: '1.25rem' }}
                />
                <label htmlFor="isActive" style={{ fontWeight: 600, color: '#4b5563' }}>Enable this banner</label>
              </div>

              <button
                onClick={handleSaveBanner}
                style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: '#74b75c', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '1rem' }}
              >
                Save Banner
              </button>
            </div>
          </div>
        </div>`;

content = content.substring(0, uiStartIdx) + newUI + '\n      )}\n    </div>\n  );\n}\n';

fs.writeFileSync(path, content, 'utf8');
console.log('updated dashboard');
