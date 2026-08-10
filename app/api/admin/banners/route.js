import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import BannerSettings from '../../../../models/BannerSettings';

// GET all banner settings (global and category)
export async function GET(req) {
  try {
    await connectDB();
    const banners = await BannerSettings.find({});
    return NextResponse.json({ success: true, banners });
  } catch (error) {
    console.error('Error fetching banners:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch banners' }, { status: 500 });
  }
}

// POST to create or update a banner setting
export async function POST(req) {
  try {
    await connectDB();
    const data = await req.json();
    const { _id, type, name, categories, promotion } = data;

    if (!type || (type === 'category' && (!categories || categories.length === 0))) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    let banner;
    if (_id) {
      banner = await BannerSettings.findById(_id);
      if (banner) {
        banner.name = name;
        banner.categories = categories;
        banner.promotion = promotion;
        await banner.save();
      }
    } else if (type === 'global') {
      banner = await BannerSettings.findOne({ type: 'global' });
      if (banner) {
        banner.promotion = promotion;
        await banner.save();
      } else {
        banner = await BannerSettings.create({ type, promotion });
      }
    } else {
      banner = await BannerSettings.create({ type, name, categories, promotion });
    }

    return NextResponse.json({ success: true, banner });
  } catch (error) {
    console.error('Error saving banner:', error);
    return NextResponse.json({ success: false, error: 'Failed to save banner' }, { status: 500 });
  }
}

// DELETE a custom banner
export async function DELETE(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Banner ID required' }, { status: 400 });
    }

    await BannerSettings.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting banner:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete banner' }, { status: 500 });
  }
}
