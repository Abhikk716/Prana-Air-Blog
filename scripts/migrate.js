require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const connectDB = require('../lib/db');
const Post = require('../models/post');

// Directory paths for storing uploaded assets
const PUBLIC_DIR = path.join(__dirname, '../public');
const FEATURED_DIR = path.join(PUBLIC_DIR, 'uploads/featured');
const CONTENT_DIR = path.join(PUBLIC_DIR, 'uploads/content');

// Helper to convert title to URL slug if not present
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start
    .replace(/-+$/, ''); // Trim - from end
}

// Download image helper that prevents duplicates and runs gracefully
async function downloadImage(url, destDir, webPrefix) {
  try {
    const parsedUrl = new URL(url);
    const filename = path.basename(parsedUrl.pathname);
    
    if (!filename || !filename.includes('.')) {
      // Invalid filename or extension
      return null;
    }
    
    const destPath = path.join(destDir, filename);

    // Ensure target folder exists
    await fs.mkdir(destDir, { recursive: true });

    // Check if the file was already downloaded previously
    try {
      await fs.access(destPath);
      console.log(`  [Cached] Image already exists: ${filename}`);
      return `${webPrefix}${filename}`;
    } catch {
      // File doesn't exist, proceed with download
    }

    console.log(`  [Downloading] image: ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  [Warning] Failed to download image (Status ${res.status}): ${url}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(destPath, buffer);
    console.log(`  [Saved] Image to: ${destPath}`);
    return `${webPrefix}${filename}`;
  } catch (error) {
    console.error(`  [Error] Failed to download image ${url}:`, error.message);
    return null;
  }
}

// Mock WordPress posts for demonstration if no endpoint is defined
const mockWpPosts = [
  {
    id: 101,
    title: { rendered: "How to Measure Air Quality Indoors" },
    slug: "how-to-measure-air-quality-indoors",
    content: {
      rendered: "<p>Indoor air quality (IAQ) is a critical factor for human health. We spend about 90% of our lives indoors.</p><img src=\"https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80\" alt=\"air quality\" /><h3>Use an Air Quality Monitor</h3><p>A professional air quality monitor measures PM2.5, PM10, CO2, TVOC, and formaldehyde.</p>"
    },
    excerpt: { rendered: "Learn how to measure indoor air quality using modern sensors and monitors." },
    date: "2026-05-10T10:00:00",
    _embedded: {
      term: [
        [{ name: "Air Quality" }, { name: "Health" }],
        [{ name: "Indoor Air" }]
      ],
      'wp:featuredmedia': [
        { source_url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80" }
      ]
    }
  },
  {
    id: 102,
    title: { rendered: "Understanding PM2.5 and PM10 Particles" },
    slug: "understanding-pm25-and-pm10-particles",
    content: {
      rendered: "<p>Particulate matter (PM) is a mixture of solid particles and liquid droplets. PM2.5 refers to particles under 2.5 micrometers.</p><img src=\"https://images.unsplash.com/photo-1532187863486-abf9d39d66e8?auto=format&fit=crop&w=800&q=80\" alt=\"pollution particles\" />"
    },
    excerpt: { rendered: "What is PM2.5 and PM10? Understanding these common air pollutants and their health impacts." },
    date: "2026-06-01T12:30:00",
    _embedded: {
      term: [
        [{ name: "Pollution" }],
        [{ name: "PM2.5" }, { name: "PM10" }]
      ],
      'wp:featuredmedia': [
        { source_url: "https://images.unsplash.com/photo-1532187863486-abf9d39d66e8?auto=format&fit=crop&w=800&q=80" }
      ]
    }
  }
];

function extractSlugFromCanonical(canonicalUrl) {
  if (!canonicalUrl) return null;
  try {
    const parsed = new URL(canonicalUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const slugPart = parts[parts.length - 1];
    if (slugPart && slugPart !== 'blog') {
      return slugPart;
    }
  } catch (e) {
    console.error('  Error parsing canonical URL:', canonicalUrl, e.message);
  }
  return null;
}

async function migrate() {
  try {
    console.log('Connecting to database...');
    await connectDB();

    const wpApiUrl = process.env.WP_API_URL;
    const languages = ['en', 'hi', 'es', 'de', 'fr', 'ru', 'ja'];
    let totalImported = 0;

    console.log('Ensuring upload folders exist...');
    await fs.mkdir(FEATURED_DIR, { recursive: true });
    await fs.mkdir(CONTENT_DIR, { recursive: true });

    if (wpApiUrl) {
      console.log(`Starting migration from WordPress REST API: ${wpApiUrl}`);

      for (const lang of languages) {
        console.log(`\n==============================================`);
        console.log(`Processing language: "${lang.toUpperCase()}"`);
        console.log(`==============================================`);

        let page = 1;
        const perPage = 20;
        let hasMore = true;

        while (hasMore) {
          console.log(`\n--- Fetching Page ${page} (lang: ${lang}) ---`);
          const res = await fetch(`${wpApiUrl}/posts?_embed&page=${page}&per_page=${perPage}&lang=${lang}`);

          if (!res.ok) {
            if (res.status === 400) {
              console.log(`Reached the end of posts list for language: ${lang}`);
            } else {
              console.error(`Error fetching from WordPress REST API (Status ${res.status}): ${res.statusText}`);
            }
            hasMore = false;
            break;
          }

          const posts = await res.json();
          if (!posts || posts.length === 0) {
            console.log(`No posts returned for language: ${lang}`);
            hasMore = false;
            break;
          }

          console.log(`Found ${posts.length} posts on Page ${page} (lang: ${lang}). Processing...`);

          for (const wpPost of posts) {
            const title = wpPost.title?.rendered || 'Untitled Post';
            const slug = wpPost.slug || slugify(title);
            let content = wpPost.content?.rendered || '';

            console.log(`\nMigrating post: "${title}" (slug: ${slug}, lang: ${lang})`);

            // 1. Clean HTML from excerpt
            const rawExcerpt = wpPost.excerpt?.rendered || '';
            const excerpt = rawExcerpt.replace(/<[^>]*>/g, '').trim();

            // 2. Extract tags & categories
            let categories = [];
            let tags = [];
            if (wpPost._embedded && wpPost._embedded.term) {
              const categoryTerms = wpPost._embedded.term[0] || [];
              const tagTerms = wpPost._embedded.term[1] || [];
              categories = categoryTerms.map(t => t.name);
              tags = tagTerms.map(t => t.name);
            }

            // 3. Download & replace featured image
            let localFeaturedImage = '';
            if (wpPost._embedded && wpPost._embedded['wp:featuredmedia']) {
              const media = wpPost._embedded['wp:featuredmedia'][0];
              const wpFeaturedUrl = media?.source_url;
              if (wpFeaturedUrl) {
                console.log(`  Processing featured image...`);
                const downloaded = await downloadImage(wpFeaturedUrl, FEATURED_DIR, '/uploads/featured/');
                if (downloaded) localFeaturedImage = downloaded;
              }
            }

            // 4. Download & replace inline post body images
            console.log(`  Processing inline images...`);
            const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/g;
            let match;
            const inlineImageUrls = [];

            while ((match = imgRegex.exec(content)) !== null) {
              const imageUrl = match[1];
              if (!inlineImageUrls.includes(imageUrl)) {
                inlineImageUrls.push(imageUrl);
              }
            }

            let updatedContent = content;
            for (const imgUrl of inlineImageUrls) {
              const localPath = await downloadImage(imgUrl, CONTENT_DIR, '/uploads/content/');
              if (localPath) {
                updatedContent = updatedContent.split(imgUrl).join(localPath);
              }
            }

            const postData = {
              title,
              slug,
              content: updatedContent,
              excerpt: excerpt || title,
              featuredImage: localFeaturedImage,
              categories,
              tags,
              status: 'published',
              publishedAt: wpPost.date ? new Date(wpPost.date) : new Date(),
              seo: {
                title: wpPost.yoast_head_json?.title || title,
                description: wpPost.yoast_head_json?.description || excerpt.substring(0, 160),
                keywords: [...categories, ...tags]
              }
            };

            if (lang === 'en') {
              // Master english post
              const existing = await Post.findOne({ slug });
              if (existing) {
                console.log(`  English post already exists. Updating details in MongoDB...`);
                await Post.findOneAndUpdate({ slug }, postData);
              } else {
                console.log(`  Creating new English post document in MongoDB...`);
                await Post.create(postData);
              }
            } else {
              // Translation post - Link back to English post
              const canonicalUrl = wpPost.yoast_head_json?.canonical;
              const parentSlug = extractSlugFromCanonical(canonicalUrl) || slug;

              console.log(`  Linking translation to English parent post with slug: "${parentSlug}"`);
              const parentPost = await Post.findOne({ slug: parentSlug });

              if (parentPost) {
                if (!parentPost.translations) {
                  parentPost.translations = new Map();
                }

                parentPost.translations.set(lang, {
                  title,
                  content: updatedContent,
                  excerpt: excerpt || title,
                  seo: {
                    title: wpPost.yoast_head_json?.title || title,
                    description: wpPost.yoast_head_json?.description || excerpt.substring(0, 160),
                    keywords: [...categories, ...tags]
                  }
                });

                parentPost.markModified('translations');
                await parentPost.save();
                console.log(`  Successfully saved translation under lang: "${lang}"`);
              } else {
                console.warn(`  [Warning] Parent English post not found for slug: "${parentSlug}". Skipping translation.`);
              }
            }

            totalImported++;
          }

          page++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } else {
      console.log('No WP_API_URL defined in environment variables. Using mock WordPress posts for demo run...');

      // Mock translations for the first mock post
      const mockTranslations = {
        hi: {
          title: "घर के अंदर हवा की गुणवत्ता कैसे मापें",
          content: "<p>इनडोर वायु गुणवत्ता (IAQ) मानव स्वास्थ्य के लिए एक महत्वपूर्ण कारक है। हम अपने जीवन का लगभग 90% हिस्सा घर के अंदर बिताते हैं।</p><h3>वायु गुणवत्ता मॉनिटर का उपयोग करें</h3><p>एक पेशेवर वायु गुणवत्ता मॉनिटर PM2.5, PM10, CO2, TVOC और फॉर्मलाडेहाइड को मापता है।</p>",
          excerpt: "जानें कि आधुनिक सेंसर और मॉनिटर का उपयोग करके इनडोर वायु गुणवत्ता को कैसे मापा जाए।"
        },
        es: {
          title: "Cómo medir la calidad del aire en interiores",
          content: "<p>La calidad del aire interior (IAQ) es un factor crítico para la salud humana. Pasamos alrededor del 90% de nuestras vidas en interiores.</p><h3>Utilice un monitor de calidad del aire</h3><p>Un monitor de calidad del aire profesional mide PM2.5, PM10, CO2, TVOC y formaldehído.</p>",
          excerpt: "Aprenda a medir la calidad del aire interior utilizando sensores y monitores modernos."
        }
      };

      for (const wpPost of mockWpPosts) {
        const title = wpPost.title.rendered;
        const slug = wpPost.slug;
        let content = wpPost.content.rendered;

        console.log(`Migrating mock post: "${title}"`);

        const excerpt = wpPost.excerpt.rendered.replace(/<[^>]*>/g, '').trim();
        const categories = wpPost._embedded.term[0].map(t => t.name);
        const tags = wpPost._embedded.term[1].map(t => t.name);

        let localFeaturedImage = '';
        const wpFeaturedUrl = wpPost._embedded['wp:featuredmedia'][0].source_url;
        const downloadedFeatured = await downloadImage(wpFeaturedUrl, FEATURED_DIR, '/uploads/featured/');
        if (downloadedFeatured) localFeaturedImage = downloadedFeatured;

        const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/g;
        let match;
        let updatedContent = content;
        while ((match = imgRegex.exec(content)) !== null) {
          const imgUrl = match[1];
          const localPath = await downloadImage(imgUrl, CONTENT_DIR, '/uploads/content/');
          if (localPath) {
            updatedContent = updatedContent.split(imgUrl).join(localPath);
          }
        }

        const postData = {
          title,
          slug,
          content: updatedContent,
          excerpt,
          featuredImage: localFeaturedImage,
          categories,
          tags,
          status: 'published',
          publishedAt: new Date(wpPost.date),
          seo: {
            title,
            description: excerpt.substring(0, 160),
            keywords: [...categories, ...tags]
          },
          translations: slug === 'how-to-measure-air-quality-indoors' ? mockTranslations : {}
        };

        const existing = await Post.findOne({ slug });
        if (existing) {
          await Post.findOneAndUpdate({ slug }, postData);
          console.log(`  Mock post updated.`);
        } else {
          await Post.create(postData);
          console.log(`  Mock post created.`);
        }
        totalImported++;
      }
    }

    console.log(`\nMigration completed successfully! Total processed: ${totalImported} posts.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed with critical error:', error);
    process.exit(1);
  }
}

migrate();

