import { put } from '@vercel/blob';
import { writeFile, access, mkdir } from 'fs/promises';
import { join } from 'path';
import { isAdminAuthenticated } from '../../../../lib/adminAuth';

export async function POST(request) {
  // 1. Authorize session
  if (!(await isAdminAuthenticated())) {
    return Response.json({ success: false, error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    const data = await request.formData();
    const file = data.get('file');

    if (!file) {
      return Response.json({ success: false, error: 'No file uploaded.' }, { status: 400 });
    }

    // 2. Automated Year & Month detection (like WordPress convention)
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // 3. Clean and sanitize the filename
    const originalName = file.name || 'image';
    const cleanName = originalName
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .toLowerCase();
    
    // Add unique timestamp prefix to prevent accidental overwrites
    const uniquePrefix = Date.now();
    const fileName = `${uniquePrefix}-${cleanName}`;

    // 4. Handle Vercel Blob if configured
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blobPath = `uploads/${year}/${month}/${fileName}`;
      const blob = await put(blobPath, file, {
        access: 'public',
        addRandomSuffix: false
      });
      console.log(`Saved uploaded image to Vercel Blob: ${blob.url}`);
      return Response.json({ success: true, url: blob.url });
    }

    // 5. Server Disk Upload with Environment Condition
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Helper to check if a directory exists asynchronously
    const dirExists = async (dir) => {
      try {
        await access(dir);
        return true;
      } catch {
        return false;
      }
    };

    let baseDir;
    if (process.env.UPLOAD_DIR) {
      baseDir = process.env.UPLOAD_DIR;
    } else if (await dirExists('/var/www/cms.pranaair.com/html/uploads')) {
      // Production server
      baseDir = '/var/www/cms.pranaair.com/html/uploads';
    } else if (await dirExists('/var/www/dev.pranaair.com/html/cms.pranaair.com/uploads')) {
      // Dev server
      baseDir = '/var/www/dev.pranaair.com/html/cms.pranaair.com/uploads';
    } else {
      // Local fallback only if the server paths do not exist
      baseDir = join(process.cwd(), 'public', 'uploads');
    }

    // Target folder structure: <baseDir>/<YYYY>/<MM> (e.g. /var/www/.../2026/09)
    const targetDir = join(/*turbopackIgnore: true*/ baseDir, year, month);

    // Auto-create year and month folders if they don't exist
    if (!(await dirExists(targetDir))) {
      await mkdir(/*turbopackIgnore: true*/ targetDir, { recursive: true });
    }

    const filePath = join(/*turbopackIgnore: true*/ targetDir, fileName);
    await writeFile(filePath, buffer);

    // URL path structure: /uploads/YYYY/MM/filename.ext
    const url = `/uploads/${year}/${month}/${fileName}`;
    console.log(`[Upload] Image saved to ${filePath} -> Served at URL: ${url}`);

    return Response.json({ success: true, url });
  } catch (error) {
    console.error('File upload api error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Failed to upload image.'
    }, { status: 500 });
  }
}
