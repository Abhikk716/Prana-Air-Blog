const rawDomain = process.env.NEXT_PUBLIC_DOMAIN || '';
const cleanDomain = rawDomain.replace(/\/+$/, '').replace(/\/cms$/, '');

export const domainName = `${cleanDomain}/cms`;
