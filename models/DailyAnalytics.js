const mongoose = require('mongoose');

const DailyAnalyticsSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    viewsByLang: {
      type: Map,
      of: Number,
      default: {},
    },
    promotionClicks: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

DailyAnalyticsSchema.index({ postId: 1, date: 1 }, { unique: true });
DailyAnalyticsSchema.index({ date: 1 });

if (mongoose.models.DailyAnalytics) {
  delete mongoose.models.DailyAnalytics;
}
module.exports = mongoose.model('DailyAnalytics', DailyAnalyticsSchema);
