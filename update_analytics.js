const fs = require('fs');
const path = 'c:/Users/purelogic/.gemini/antigravity-ide/scratch/pranaair-test-blog/app/admin/dashboard/DashboardClient.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Change useEffect for banners to run on mount
const oldBannerEffect = `  useEffect(() => {
    if (activeTab === 'banners') {
      fetchBanners();
    }
  }, [activeTab]);`;

const newBannerEffect = `  useEffect(() => {
    fetchBanners();
  }, []);`;

content = content.replace(oldBannerEffect, newBannerEffect);

// 2. Update useMemo to include bannerSettings and calculate campaign stats
const useMemoStartOld = `  const { metrics, langChartData, categoryChartData, timeChartData, topPosts } = useMemo(() => {`;
const useMemoStartNew = `  const { metrics, langChartData, categoryChartData, timeChartData, topPosts, campaignPerformance } = useMemo(() => {`;

content = content.replace(useMemoStartOld, useMemoStartNew);

const depsOld = `  }, [posts, dailyData, analyticsTimeFilter, analyticsCategoryFilter]);`;
const depsNew = `  }, [posts, dailyData, analyticsTimeFilter, analyticsCategoryFilter, bannerSettings]);`;

content = content.replace(depsOld, depsNew);

// Now, insert the campaign stats calculation logic inside useMemo
// Find where timeViewsMap etc are initialized
const initOld = `    const timeViewsMap = {};
    const postViewsMap = {};`;

const initNew = `    const timeViewsMap = {};
    const postViewsMap = {};

    const campaignStats = {};
    if (bannerSettings && bannerSettings.length > 0) {
      bannerSettings.forEach(b => {
        const id = b.type === 'global' ? 'global' : b._id;
        campaignStats[id] = {
          name: b.type === 'global' ? 'Global Banner' : (b.name || 'Unnamed Campaign'),
          views: 0,
          clicks: 0
        };
      });
    }

    const getBannerForPost = (post) => {
      if (post.promotion && post.promotion.isActive && new Date(post.promotion.endDate) >= new Date()) {
        return null; // Post specific
      }
      if (post.categories && post.categories.length > 0) {
        for (const cat of post.categories) {
          const catBanner = bannerSettings.find(b => b.type === 'category' && b.categories?.includes(cat) && b.promotion?.isActive);
          if (catBanner && new Date(catBanner.promotion.endDate) >= new Date()) {
            return catBanner._id;
          }
        }
      }
      const global = bannerSettings.find(b => b.type === 'global' && b.promotion?.isActive);
      if (global && new Date(global.promotion.endDate) >= new Date()) {
        return 'global';
      }
      return null;
    };`;

content = content.replace(initOld, initNew);

// Inject into "if (analyticsTimeFilter === 'all')" loop
const allTimeLoopOld = `        if (post.categories) {
          post.categories.forEach(cat => {
            catViews[cat] = (catViews[cat] || 0) + v;
          });
        }

        postViewsMap[post._id] = { post, views: v, clicks: c };`;

const allTimeLoopNew = `        if (post.categories) {
          post.categories.forEach(cat => {
            catViews[cat] = (catViews[cat] || 0) + v;
          });
        }

        const bannerId = getBannerForPost(post);
        if (bannerId && campaignStats[bannerId]) {
          campaignStats[bannerId].views += v;
          campaignStats[bannerId].clicks += c;
        }

        postViewsMap[post._id] = { post, views: v, clicks: c };`;

content = content.replace(allTimeLoopOld, allTimeLoopNew);

// Inject into dailyData loop
const dailyDataLoopOld = `        if (post.categories) {
          post.categories.forEach(cat => {
            catViews[cat] = (catViews[cat] || 0) + (d.views || 0);
          });
        }`;

const dailyDataLoopNew = `        if (post.categories) {
          post.categories.forEach(cat => {
            catViews[cat] = (catViews[cat] || 0) + (d.views || 0);
          });
        }

        const bannerId = getBannerForPost(post);
        if (bannerId && campaignStats[bannerId]) {
          campaignStats[bannerId].views += (d.views || 0);
          campaignStats[bannerId].clicks += (d.promotionClicks || 0);
        }`;

content = content.replace(dailyDataLoopOld, dailyDataLoopNew);

// Compute topPosts and return
const returnOld = `    const topPosts = Object.values(postViewsMap)
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    return {
      metrics: { totalViews, totalClicks, totalCTR, publishedCount },
      langChartData,
      categoryChartData,
      timeChartData,
      topPosts
    };`;

const returnNew = `    const topPosts = Object.values(postViewsMap)
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    const campaignPerformance = Object.values(campaignStats)
      .filter(c => c.views > 0 || c.clicks > 0)
      .sort((a, b) => b.views - a.views);

    return {
      metrics: { totalViews, totalClicks, totalCTR, publishedCount },
      langChartData,
      categoryChartData,
      timeChartData,
      topPosts,
      campaignPerformance
    };`;

content = content.replace(returnOld, returnNew);

// Now render the new table in UI. We find "Top Performing Posts" and inject before it.
const uiOld = `              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>Top Performing Posts</h3>`;

const uiNew = `              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>Campaign Performance</h3>
              <div className="dashboard-table-container" style={{ marginBottom: '3rem' }}>
                <table className="dashboard-table">
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Campaign Name</th>
                      <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Total Views</th>
                      <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Banner Clicks</th>
                      <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignPerformance.length > 0 ? campaignPerformance.map((campaign, i) => {
                      const ctr = campaign.views > 0 ? ((campaign.clicks / campaign.views) * 100).toFixed(1) : '0.0';
                      const isHighCTR = parseFloat(ctr) > 5.0;
                      
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937' }}>{campaign.name}</td>
                          <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>{campaign.views.toLocaleString()}</td>
                          <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>{campaign.clicks.toLocaleString()}</td>
                          <td style={{ padding: '1rem', color: isHighCTR ? '#15803d' : '#4b5563', fontWeight: isHighCTR ? 700 : 500, backgroundColor: isHighCTR ? 'rgba(34, 197, 94, 0.1)' : 'transparent' }}>
                            {ctr}%
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No campaign data available for this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>Top Performing Posts</h3>`;

content = content.replace(uiOld, uiNew);

fs.writeFileSync(path, content, 'utf8');
console.log('Added campaign performance table');
