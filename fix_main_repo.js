const fs = require('fs');

// 1. Update the API in the dashboard repo
const apiPath = 'c:/Users/purelogic/.gemini/antigravity-ide/scratch/pranaair-test-blog/app/api/posts/[id]/route.js';
let apiContent = fs.readFileSync(apiPath, 'utf8');

if (!apiContent.includes('BannerSettings')) {
  apiContent = apiContent.replace(
    "import Post from '../../../../models/post';",
    "import Post from '../../../../models/post';\nimport BannerSettings from '../../../../models/BannerSettings';"
  );
}

const apiOldLogic = `    // Fix broken relative image paths from WordPress migration`;
const apiNewLogic = `    let promotions = [];
    if (post.promotion && post.promotion.isActive && post.promotion.endDate) {
      if (new Date(post.promotion.endDate) >= new Date()) {
        promotions.push(post.promotion);
      }
    }

    if (promotions.length === 0) {
      const banners = await BannerSettings.find({});
      if (post.categories && post.categories.length > 0) {
        for (const cat of post.categories) {
          const catBanners = banners.filter(b => b.type === 'category' && b.categories?.includes(cat) && b.promotion?.isActive);
          for (const catBanner of catBanners) {
            if (new Date(catBanner.promotion.endDate) >= new Date()) {
              if (!promotions.some(p => p.imageUrl === catBanner.promotion.imageUrl && p.text === catBanner.promotion.text)) {
                promotions.push(catBanner.promotion);
              }
            }
          }
        }
      }

      if (promotions.length === 0) {
        const globalBanner = banners.find(b => b.type === 'global' && b.promotion?.isActive);
        if (globalBanner && new Date(globalBanner.promotion.endDate) >= new Date()) {
          promotions.push(globalBanner.promotion);
        }
      }
    }
    post.promotions = promotions;

    // Fix broken relative image paths from WordPress migration`;

apiContent = apiContent.replace(apiOldLogic, apiNewLogic);
fs.writeFileSync(apiPath, apiContent, 'utf8');
console.log('API updated.');

// 2. Update the PromotionBanner component in the main repo
const bannerPath = 'c:/pranaair/src/app/[lang]/test-blog/components/PromotionBanner.js';
let bannerContent = fs.readFileSync(bannerPath, 'utf8');

const bannerOld = `export default function PromotionBanner({ promotion, slug }) {
  if (!promotion) return null;

  const handleBannerClick = () => {`;
const bannerNew = `export default function PromotionBanner({ promotion, promotions, slug }) {
  const items = promotions || (promotion ? [promotion] : []);
  if (items.length === 0) return null;

  const handleBannerClick = () => {`;

const bannerOldRender = `  return (
    <a
      href={promotion.link}
      target="_blank"
      rel="noopener noreferrer"
      className="promotion-banner-card"
      onClick={handleBannerClick}
    >
      {/* Subtle "Featured" Tag */}
      <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', backdropFilter: 'blur(4px)', zIndex: 2 }}>
        Featured
      </div>

      <div style={{ width: '100%', aspectRatio: '16/10', overflow: 'hidden' }}>
        <img src={promotion.imageUrl} alt="Promotion" />
      </div>

      <div style={{ padding: '1.25rem', background: '#ffffff', borderTop: '3px solid #74b75c' }}>
        <div style={{ color: '#1f2937', fontWeight: 800, fontSize: '1.05rem', lineHeight: '1.4', marginBottom: '0.75rem' }}>
          {promotion.text}
        </div>
        <div style={{ color: '#74b75c', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          Learn More <span style={{ fontSize: '1.1em' }}>&rarr;</span>
        </div>
      </div>
    </a>
  );`;
const bannerNewRender = `  return (
    <>
      {items.map((promo, idx) => (
        <a
          key={idx}
          href={promo.link}
          target="_blank"
          rel="noopener noreferrer"
          className="promotion-banner-card"
          onClick={handleBannerClick}
          style={{ marginBottom: '1.5rem', display: 'block' }}
        >
          {/* Subtle "Featured" Tag */}
          <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', backdropFilter: 'blur(4px)', zIndex: 2 }}>
            Featured
          </div>

          <div style={{ width: '100%', aspectRatio: '16/10', overflow: 'hidden' }}>
            <img src={promo.imageUrl} alt="Promotion" />
          </div>

          <div style={{ padding: '1.25rem', background: '#ffffff', borderTop: '3px solid #74b75c' }}>
            <div style={{ color: '#1f2937', fontWeight: 800, fontSize: '1.05rem', lineHeight: '1.4', marginBottom: '0.75rem' }}>
              {promo.text}
            </div>
            <div style={{ color: '#74b75c', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              Learn More <span style={{ fontSize: '1.1em' }}>&rarr;</span>
            </div>
          </div>
        </a>
      ))}
    </>
  );`;

bannerContent = bannerContent.replace(bannerOld, bannerNew).replace(bannerOldRender, bannerNewRender);
fs.writeFileSync(bannerPath, bannerContent, 'utf8');
console.log('PromotionBanner updated.');

// 3. Update the page.js in the main repo
const pagePath = 'c:/pranaair/src/app/[lang]/test-blog/[slug]/page.js';
let pageContent = fs.readFileSync(pagePath, 'utf8');

const pageOldLogic = `  let promotion = null;
  if (post.promotion && post.promotion.isActive && post.promotion.endDate) {
    if (new Date(post.promotion.endDate) >= new Date()) {
      promotion = { ...post.promotion };

      // Fix image URL for local proxy if needed
      if (promotion.imageUrl && !promotion.imageUrl.startsWith('http')) {
        const imgPath = promotion.imageUrl.startsWith('/') ? promotion.imageUrl : \`/\${promotion.imageUrl}\`;
        const cmsUrl = process.env.BLOG_API_URL || 'https://prana-air-blog.vercel.app';
        promotion.imageUrl = \`\${cmsUrl}\${imgPath}\`;
      }
    }
  }`;

const pageNewLogic = `  let promotions = post.promotions || [];
  
  // Fix image URLs for local proxy if needed
  promotions = promotions.map(promo => {
    let p = { ...promo };
    if (p.imageUrl && !p.imageUrl.startsWith('http')) {
      const imgPath = p.imageUrl.startsWith('/') ? p.imageUrl : \`/\${p.imageUrl}\`;
      const cmsUrl = process.env.BLOG_API_URL || 'https://prana-air-blog.vercel.app';
      p.imageUrl = \`\${cmsUrl}\${imgPath}\`;
    }
    return p;
  });`;

pageContent = pageContent.replace(pageOldLogic, pageNewLogic);

const pageOldRender = `<PromotionBanner promotion={promotion} slug={post.slug} />`;
const pageNewRender = `<PromotionBanner promotions={promotions} slug={post.slug} />`;
pageContent = pageContent.replace(pageOldRender, pageNewRender);

fs.writeFileSync(pagePath, pageContent, 'utf8');
console.log('Main repo page.js updated.');
