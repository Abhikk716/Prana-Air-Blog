import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
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

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure the folder exists
    const uploadFolder = join(process.cwd(), 'public/uploads/content');
    await mkdir(uploadFolder, { recursive: true });

    // Generate unique filename to avoid overwrites
    const timestamp = Date.now();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filename = `${timestamp}-${cleanName}`;
    
    const filePath = join(uploadFolder, filename);

    // Save image to local uploads folder
    await writeFile(filePath, buffer);
    console.log(`Saved uploaded image to: ${filePath}`);

    return Response.json({
      success: true,
      url: `/uploads/content/${filename}`
    });
  } catch (error) {
    console.error('File upload api error:', error);
    return Response.json({ success: false, error: 'Failed to upload image.' }, { status: 500 });
  }
}
