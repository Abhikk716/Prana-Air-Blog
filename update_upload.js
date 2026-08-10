const fs = require('fs');
const path = 'c:/Users/purelogic/.gemini/antigravity-ide/scratch/pranaair-test-blog/app/admin/dashboard/DashboardClient.js';
let content = fs.readFileSync(path, 'utf8');

const uploadFunction = `  const handleBannerImageUpload = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.onchange = async () => {
      const file = input.files[0];
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
          const data = await res.json();
          if (res.ok) {
            setEditingBanner(prev => ({
              ...prev,
              promotion: {
                ...prev.promotion,
                imageUrl: data.url
              }
            }));
          } else {
            alert(data.error || 'Upload failed.');
          }
        } catch (err) {
          alert('Network error during upload.');
        }
      }
    };
    input.click();
  };

  const handleSaveBanner = async () => {`;

content = content.replace("  const handleSaveBanner = async () => {", uploadFunction);

const oldUI = `              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Image URL</label>
                <input
                  type="text"
                  value={editingBanner.promotion?.imageUrl || ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, imageUrl: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  placeholder="https://..."
                />
              </div>`;

const newUI = `              <div>
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
              </div>`;

content = content.replace(oldUI, newUI);

fs.writeFileSync(path, content, 'utf8');
console.log('Added upload button');
