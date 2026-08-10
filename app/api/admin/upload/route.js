import { put } from '@vercel/blob';
import { cookies } from 'next/headers';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import fs from 'fs';

export async function POST(request) {
  // 1. Authorize session
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');
  if (!session || session.value !== 'authenticated') {
    return Response.json({ success: false, error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    const data = await request.formData();
    const file = data.get('file');

    if (!file) {
      return Response.json({ success: false, error: 'No file uploaded.' }, { status: 400 });
    }

    const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    // If Vercel Blob token exists, use it
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`uploads/content/${cleanName}`, file, {
        access: 'public',
        addRandomSuffix: true
      });
      console.log(`Saved uploaded image to Vercel Blob: ${blob.url}`);
      return Response.json({ success: true, url: blob.url });
    } else {
      // Fallback to local upload
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      const uploadDir = join(process.cwd(), 'public', 'uploads', 'content');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileName = `${uniqueSuffix}-${cleanName}`;
      const filePath = join(uploadDir, fileName);
      
      await writeFile(filePath, buffer);
      
      const url = `/uploads/content/${fileName}`;
      console.log(`Saved uploaded image locally: ${url}`);
      return Response.json({ success: true, url });
    }
  } catch (error) {
    console.error('File upload api error:', error);
    return Response.json({ success: false, error: 'Failed to upload image. If in production, make sure BLOB_READ_WRITE_TOKEN is set.' }, { status: 500 });
  }
}
