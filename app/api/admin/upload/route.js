import { put } from '@vercel/blob';
import { cookies } from 'next/headers';

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

    // Use Vercel Blob instead of local filesystem
    const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    
    // Upload to Vercel Blob
    const blob = await put(`uploads/content/${cleanName}`, file, {
      access: 'public',
      addRandomSuffix: true // Vercel Blob automatically handles unique naming
    });

    console.log(`Saved uploaded image to Vercel Blob: ${blob.url}`);

    return Response.json({
      success: true,
      url: blob.url
    });
  } catch (error) {
    console.error('File upload api error:', error);
    return Response.json({ success: false, error: 'Failed to upload image. Make sure BLOB_READ_WRITE_TOKEN is set.' }, { status: 500 });
  }
}
