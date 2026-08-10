const mongoose = require('mongoose');

const BannerSettingsSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['global', 'category'],
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
    promotion: {
      imageUrl: { type: String, default: '' },
      text: { type: String, default: '' },
      link: { type: String, default: '' },
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
