import { S3Client } from '@aws-sdk/client-s3';
import axios from 'axios';

// You should set APP_ENV in your .env file (staging or production)
const ENV = process.env.APP_ENV || 'staging';

interface R2Config {
  accountId: string;
  accessKey: string;
  secretKey: string;
  publicBucket: string;
  privateBucket: string;
  endpoint: string;
}

function getConfig(): R2Config {
  if (ENV === 'production') {
    return {
      accountId: process.env.PROD_R2_ACCOUNT_ID!,
      accessKey: process.env.PROD_R2_ACCESS_KEY_ID!,
      secretKey: process.env.PROD_R2_SECRET_ACCESS_KEY!,
      publicBucket: process.env.PROD_R2_PUBLIC_BUCKET!,
      privateBucket: process.env.PROD_R2_PRIVATE_BUCKET!,
      endpoint: `https://${process.env.PROD_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    };
  } else {
    // Default to Staging
    return {
      accountId: process.env.STAGING_R2_ACCOUNT_ID!,
      accessKey: process.env.STAGING_R2_ACCESS_KEY_ID!,
      secretKey: process.env.STAGING_R2_SECRET_ACCESS_KEY!,
      publicBucket: process.env.STAGING_R2_PUBLIC_BUCKET!,
      privateBucket: process.env.STAGING_R2_PRIVATE_BUCKET!,
      endpoint: `https://${process.env.STAGING_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    };
  }
}

export const r2Config = getConfig();

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: r2Config.endpoint,
  credentials: {
    accessKeyId: r2Config.accessKey,
    secretAccessKey: r2Config.secretKey,
  },
  maxAttempts: 3, // Retry failed requests automatically
});

export const getApiConfig = () => {
  if (ENV === 'production') {
    return {
      url: process.env.PRODUCTION_API_URL!,
      secret: process.env.PRODUCTION_ADMIN_SECRET!
    };
  }
  return {
    url: process.env.STAGING_API_URL || 'https://staging-api.opengpl.io/admin/publish',
    secret: process.env.STAGING_ADMIN_SECRET || 'your-staging-secret'
  };
};

export async function checkRemoteItem(slug: string, version: string) {
  const config = getApiConfig();
  try {
    const res = await axios.post(
      config.url.replace('/publish', '/check'), // Switch endpoint
      { slug, version },
      { headers: { 'x-admin-secret': config.secret } }
    );
    return res.data; 
    // Expected: { productExists: boolean, versionExists: boolean, product: { latestVersion: string, ... } }
  } catch (e) {
    console.error("Remote Check Failed:", e);
    return null; // Fail safe (assume strictly local if api fails)
  }
}