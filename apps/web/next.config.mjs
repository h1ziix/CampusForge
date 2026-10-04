/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@campusforge/shared'],
  serverExternalPackages: [
    '@campusforge/db',
    '@prisma/client',
    'bcryptjs',
    '@aws-sdk/client-s3',
    'bullmq',
    'ioredis',
  ],
};

export default nextConfig;
