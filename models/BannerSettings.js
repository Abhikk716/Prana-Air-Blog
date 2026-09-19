const mongoose = require('mongoose');

const BannerSettingsSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['global', 'category', 'story'],
      required: true,
    },
    name: {
      type: String,
      trim: true
    },
    categories: {
      type: [String],
      default: []
    },
    targetPosts: {
      type: [String], // Post IDs or slugs targeted by campaign
      default: []
    },
    promotion: {
      imageUrl: { type: String, default: '' },
      imageAlt: { type: String, default: '' }, // For SEO
      text: { type: String, default: '' },
      link: { type: String, default: '' },
      placement: { type: String, enum: ['sidebar', 'post_top', 'post_bottom', 'story'], default: 'sidebar' },
      endDate: { type: Date, default: null },
      isActive: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true,
  }
);

// Prevent mongoose caching old schema in Next.js dev
if (mongoose.models.BannerSettings) {
  delete mongoose.models.BannerSettings;
}
module.exports = mongoose.model('BannerSettings', BannerSettingsSchema);
