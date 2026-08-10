const fs = require('fs');
const path = 'c:/Users/purelogic/.gemini/antigravity-ide/scratch/pranaair-test-blog/app/test-blog/[slug]/page.js';
let content = fs.readFileSync(path, 'utf8');

const oldLogic = `  let promotion = null;
  if (rawPost.promotion && rawPost.promotion.isActive && rawPost.promotion.endDate) {
    if (new Date(rawPost.promotion.endDate) >= new Date()) {
      promotion = rawPost.promotion;
    }
  }

  if (!promotion) {
    const banners = await BannerSettings.find({});
    
    // Check Category Banners First
    if (rawPost.categories && rawPost.categories.length > 0) {
      for (const cat of rawPost.categories) {
        const catBanner = banners.find(b => b.type === 'category' && b.categories?.includes(cat) && b.promotion?.isActive);
        if (catBanner && new Date(catBanner.promotion.endDate) >= new Date()) {
          promotion = catBanner.promotion;
          break;
        }
      }
    }

    // Check Global Banner if still no promotion
    if (!promotion) {
      const globalBanner = banners.find(b => b.type === 'global' && b.promotion?.isActive);
      if (globalBanner && new Date(globalBanner.promotion.endDate) >= new Date()) {
        promotion = globalBanner.promotion;
      }
    }
  }`;

const newLogic = `  let promotions = [];
  if (rawPost.promotion && rawPost.promotion.isActive && rawPost.promotion.endDate) {
    if (new Date(rawPost.promotion.endDate) >= new Date()) {
      promotions.push(rawPost.promotion);
    }
  }

  if (promotions.length === 0) {
    const banners = await BannerSettings.find({});
    
    // Check Category Banners First
    if (rawPost.categories && rawPost.categories.length > 0) {
      for (const cat of rawPost.categories) {
        const catBanners = banners.filter(b => b.type === 'category' && b.categories?.includes(cat) && b.promotion?.isActive);
        for (const catBanner of catBanners) {
          if (new Date(catBanner.promotion.endDate) >= new Date()) {
            // Avoid duplicates
            if (!promotions.some(p => p.imageUrl === catBanner.promotion.imageUrl && p.text === catBanner.promotion.text)) {
              promotions.push(catBanner.promotion);
            }
          }
        }
      }
    }

    // Check Global Banner if still no promotion
    if (promotions.length === 0) {
      const globalBanner = banners.find(b => b.type === 'global' && b.promotion?.isActive);
      if (globalBanner && new Date(globalBanner.promotion.endDate) >= new Date()) {
        promotions.push(globalBanner.promotion);
      }
    }
  }`;

content = content.replace(oldLogic, newLogic);

const oldUI = `              {promotion && (
                <a
                  href={promotion.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="promotion-banner-card"
                >
                  {/* Subtle "Featured" Tag */}
                  <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', backdropFilter: 'blur(4px)', zIndex: 2 }}>
                    Featured
                  </div>

                  <div style={{ width: '100%', aspectRatio: '16/10', overflow: 'hidden' }}>
                    <img src={promotion.imageUrl} alt="Promotion" />
                  </div>

                  <div style={{ padding: '1.25rem', background: '#ffffff', borderTop: '3px solid #74b75c' }}>
                    <div style={{ color: '#1f2937', fontWeight: 800, fontSize: '1.05rem', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                      {promotion.text}
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#74b75c', fontSize: '0.85rem', fontWeight: 700 }}>
                      Learn More
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                    </div>
                  </div>
                </a>
              )}`;

const newUI = `              {promotions.length > 0 && promotions.map((promo, idx) => (
                <a
                  key={idx}
                  href={promo.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="promotion-banner-card"
                  style={{ marginBottom: '1.5rem', display: 'block' }}
                >
                  {/* Subtle "Featured" Tag */}
                  <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', backdropFilter: 'blur(4px)', zIndex: 2 }}>
                    Featured
                  </div>

                  <div style={{ width: '100%', aspectRatio: '16/10', overflow: 'hidden' }}>
                    <img src={promo.imageUrl} alt="Promotion" />
                  </div>

                  <div style={{ padding: '1.25rem', background: '#ffffff', borderTop: '3px solid #74b75c' }}>
                    <div style={{ color: '#1f2937', fontWeight: 800, fontSize: '1.05rem', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                      {promo.text}
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#74b75c', fontSize: '0.85rem', fontWeight: 700 }}>
                      Learn More
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                    </div>
                  </div>
                </a>
              ))}`;

content = content.replace(oldUI, newUI);

fs.writeFileSync(path, content, 'utf8');
console.log('Multiple banners support added');
