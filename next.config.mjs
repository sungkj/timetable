import withPWA from "@ducanh2912/next-pwa";

const withPWAConfig = withPWA({
  dest: "public", // Service Worker 파일이 생성될 위치
  disable: process.env.NODE_ENV === "development", // 개발 모드에서는 PWA 캐싱 비활성화 (선택 사항)
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 기존의 next 설정들
};

export default withPWAConfig(nextConfig);