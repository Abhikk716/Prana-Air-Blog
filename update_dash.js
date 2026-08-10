const fs = require('fs');

const path = 'c:/Users/purelogic/.gemini/antigravity-ide/scratch/pranaair-test-blog/app/admin/dashboard/DashboardClient.js';
let content = fs.readFileSync(path, 'utf8');

const stateCode = `  const [bannerSettings, setBannerSettings] = useState([]);
  const [loadingBanners, setLoadingBanners] = useState(false);
  const [editingBanner, setEditingBanner] = useState({
    type: 'global',
    category: '',
    promotion: { imageUrl: '', text: '', link: '', endDate: '', isActive: false }
  });

  const [activeBannerTab, setActiveBannerTab] = useState('global');

  useEffect(() => {
    if (activeTab === 'banners') {
      fetchBanners();
    }
  }, [activeTab]);

  const fetchBanners = async () => {
    setLoadingBanners(true);
    try {
      const res = await fetch('/api/admin/banners');
      const data = await res.json();
      if (data.success) {
        setBannerSettings(data.banners);
        loadBannerToEdit('global', '', data.banners);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBanners(false);
    }
  };

  const handleSaveBanner = async () => {
    try {
      const res = await fetch('/api/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingBanner)
      });
      const data = await res.json();
      if (data.success) {
        alert('Banner saved successfully');
        fetchBanners();
      } else {
        alert(data.error || 'Failed to save banner');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const loadBannerToEdit = (type, category = '', banners = bannerSettings) => {
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
  };
`;

content = content.replace('  const [customStartDate, setCustomStartDate] = useState(\'\');', stateCode + '\n  const [customStartDate, setCustomStartDate] = useState(\'\');');

const jsxCode = `
      {activeTab === 'banners' && (
        <div style={{ padding: '1rem 0' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => loadBannerToEdit('global', '')}
              style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: activeBannerTab === 'global' ? '#74b75c' : '#e5e7eb', color: activeBannerTab === 'global' ? 'white' : '#4b5563' }}
            >
              Global Banner
            </button>
            {categories.map((cat, i) => (
              <button
                key={i}
                onClick={() => loadBannerToEdit('category', cat)}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: activeBannerTab === cat ? '#74b75c' : '#e5e7eb', color: activeBannerTab === cat ? 'white' : '#4b5563' }}
              >
                {cat} Banner
              </button>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '1.5rem' }}>
              {editingBanner.type === 'global' ? 'Global Banner Settings' : \`\${editingBanner.category} Banner Settings\`}
            </h3>

            <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '600px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Image URL</label>
                <input
                  type="text"
                  value={editingBanner.promotion?.imageUrl || ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, imageUrl: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  placeholder="https://..."
                />
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
        </div>
      )}
`;

content = content.replace('    </div>\n  );\n}\n', jsxCode + '    </div>\n  );\n}\n');

fs.writeFileSync(path, content, 'utf8');
console.log('updated');
