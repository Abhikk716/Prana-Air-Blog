const fs = require('fs');
const path = 'c:/Users/purelogic/.gemini/antigravity-ide/scratch/pranaair-test-blog/app/admin/editor/page.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Add existingCategories state
const stateOld = `  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [tags, setTags] = useState([]);`;
const stateNew = `  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [existingCategories, setExistingCategories] = useState([]);
  const [tags, setTags] = useState([]);`;

content = content.replace(stateOld, stateNew);

// 2. Fetch existingCategories on mount
const fetchOld = `    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/check-auth');
        if (!res.ok) {
          router.push('/admin/login');
        } else {
          setAuthChecked(true);
        }
      } catch (err) {
        console.error(err);
        router.push('/admin/login');
      }
    };
    checkAuth();
  }, [router]);`;

const fetchNew = `    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/check-auth');
        if (!res.ok) {
          router.push('/admin/login');
        } else {
          setAuthChecked(true);
          // Fetch existing categories for the dropdown
          fetch('/api/posts/meta')
            .then(r => r.json())
            .then(data => {
              if (data.success && data.data && data.data.categories) {
                setExistingCategories(data.data.categories.map(c => c.name));
              }
            })
            .catch(console.error);
        }
      } catch (err) {
        console.error(err);
        router.push('/admin/login');
      }
    };
    checkAuth();
  }, [router]);`;

content = content.replace(fetchOld, fetchNew);

// 3. Update the UI
const uiOld = `            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Categories</label>
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input-text"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', flexGrow: 1 }}
                  placeholder="e.g. Health"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem' }}>+</button>
              </form>
              <div className="tags-container">`;

const uiNew = `            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Categories</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <select 
                  className="input-text" 
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer' }}
                  onChange={(e) => {
                    if (e.target.value && !categories.includes(e.target.value)) {
                      setCategories([...categories, e.target.value]);
                    }
                    e.target.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select an existing category...</option>
                  {existingCategories.map((cat, i) => (
                    <option key={i} value={cat}>{cat}</option>
                  ))}
                </select>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>- OR CREATE NEW -</div>
                <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="input-text"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', flexGrow: 1 }}
                    placeholder="Type new category..."
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem' }}>+</button>
                </form>
              </div>
              <div className="tags-container">`;

content = content.replace(uiOld, uiNew);

fs.writeFileSync(path, content, 'utf8');
console.log('Categories dropdown added successfully.');
