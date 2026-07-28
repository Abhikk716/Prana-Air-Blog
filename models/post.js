const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a title for the blog post.'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Please provide a slug for the blog post.'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Content is required.'],
    },
    excerpt: {
      type: String,
      trim: true,
    },
    featuredImage: {
      type: String, // URL to local upload or S3
      default: '',
    },
    author: {
      type: String,
      default: 'Admin',
      trim: true,
    },
    categories: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    seo: {
      title: {
        type: String,
        trim: true,
      },
      description: {
        type: String,
        trim: true,
      },
      keywords: {
        type: [String],
        default: [],
      },
    },
    promotion: {
      imageUrl: { type: String, default: '' },
      text: { type: String, default: '' },
      link: { type: String, default: '' },
      endDate: { type: Date, default: null },
      isActive: { type: Boolean, default: false }
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    translations: {
      type: Map,
      of: {
        title: {
          type: String,
          trim: true,
        },
        content: {
          type: String,
        },
        excerpt: {
          type: String,
          trim: true,
        },
        seo: {
          title: {
            type: String,
            trim: true,
          },
          description: {
            type: String,
            trim: true,
          },
          keywords: {
            type: [String],
            default: [],
          },
        },
      },
      default: {},
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Add index on slug for fast queries
PostSchema.index({ slug: 1 });

// Prevent mongoose caching old schema in Next.js dev
if (mongoose.models.Post) {
  delete mongoose.models.Post;
}
module.exports = mongoose.model('Post', PostSchema);
