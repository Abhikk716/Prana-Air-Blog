import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import Settings from '../../../models/Settings';

export async function GET() {
  try {
    await connectDB();
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Settings GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { anthropicApiKey } = await req.json();
    await connectDB();
    
    let settings = await Settings.findOne();
    if (settings) {
      settings.anthropicApiKey = anthropicApiKey;
      await settings.save();
    } else {
      settings = await Settings.create({ anthropicApiKey });
    }
    
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Settings POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}
