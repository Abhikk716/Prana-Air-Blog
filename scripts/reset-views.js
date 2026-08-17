const mongoose = require('mongoose');
const connectDB = require('../lib/db');
const Post = require('../models/post');
const DailyAnalytics = require('../models/DailyAnalytics');
require('dotenv').config({ path: '../.env' });

async function resetViews() {
  try {
    await connectDB();
    console.log('Connected to DB');
    
    const postUpdate = await Post.updateMany({}, {
      $set: {
        'analytics.views': 0,
        'analytics.viewsByLang': {},
        'views': 0,
        'viewsByLang': {}
      }
    });
    console.log(`Updated ${postUpdate.modifiedCount} posts`);

    const analyticsUpdate = await DailyAnalytics.updateMany({}, {
      $set: {
        views: 0,
        viewsByLang: {}
      }
    });
    console.log(`Updated ${analyticsUpdate.modifiedCount} daily analytics`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetViews();
