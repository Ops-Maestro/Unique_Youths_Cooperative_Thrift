// unique-youths-admin/src/robots.txt.js
const fs = require('fs');
const path = require('path');

const SITE_URL = process.env.VITE_SITE_URL || 'https://unique-youths-cooperative-thrift-admin.onrender.com';

const robotsContent = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`;

// Write to public folder
fs.writeFileSync(
  path.join(__dirname, '../public/robots.txt'),
  robotsContent
);

console.log('✅ robots.txt generated with SITE_URL:', SITE_URL);
