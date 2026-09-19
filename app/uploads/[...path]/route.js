import { NextResponse } from 'next/server';
import { stat, readFile } from 'fs/promises';
import { join } from 'path';

const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
};

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams?.path || [];
    const relativePath = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;

    if (!relativePath) {
      return new NextResponse('File path not provided', { status: 400 });
    }

    // Security: Prevent directory traversal
    if (relativePath.includes('..') || relativePath.startsWith('/')) {
      return new NextResponse('Invalid file path', { status: 400 });
    }

    // Candidate directories where uploads may be stored
    const candidateDirs = [
      process.env.UPLOAD_DIR,
      '/var/www/cms.pranaair.com/html/upload', // Production
      '/var/www/dev.pranaair.com/html/cms.pranaair.com/uploads', // Dev Server
      join(process.cwd(), 'public', 'uploads'), // Local fallback
    ].filter(Boolean);

    const fileName = relativePath.split('/').pop();

    for (const baseDir of candidateDirs) {
      const pathsToTry = [
        join(baseDir, relativePath),
        join(baseDir, 'content', fileName),
        join(baseDir, fileName),
      ];

      for (const fullPath of pathsToTry) {
        try {
          const stats = await stat(fullPath);
          if (stats.isFile()) {
            const fileBuffer = await readFile(fullPath);
            const ext = relativePath.split('.').pop()?.toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            return new NextResponse(fileBuffer, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Content-Length': stats.size.toString(),
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
        } catch (err) {
          // File does not exist or cannot be accessed, continue to next path
          continue;
        }
      }
    }

    if (process.env.NODE_ENV === 'development') { return NextResponse.redirect("https://dev.pranaair.com/cms/uploads/$relativePath"); }
    return new NextResponse('Image not found', { status: 404 });
  } catch (error) {
    console.error('Error serving upload image:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
