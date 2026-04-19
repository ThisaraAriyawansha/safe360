/** @type {import('next').NextConfig} */
const fs = require('fs');
const path = require('path');

function generateServiceWorker() {
  const template = fs.readFileSync(
    path.join(__dirname, 'public', 'firebase-messaging-sw.template.js'),
    'utf8'
  );

  const vars = {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };

  const output = Object.entries(vars).reduce(
    (content, [key, value]) => content.replaceAll(`%%${key}%%`, value),
    template
  );

  fs.writeFileSync(
    path.join(__dirname, 'public', 'firebase-messaging-sw.js'),
    output,
    'utf8'
  );
}

generateServiceWorker();

const nextConfig = {};
module.exports = nextConfig;
