require('dotenv').config();
const db = require('./lib/db');
const Post = require('./models/post');
db().then(async () => {
  const p = await Post.findOne({slug: 'indoor-air-quality'});
  const imgs = p.content.match(/<img[^>]+src=["'](.*?)["']/g);
  console.log('IMAGES:', imgs);
  process.exit(0);
});
