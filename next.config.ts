import type { NextConfig } from 'next';
const securityHeaders=[
 {key:'X-Content-Type-Options',value:'nosniff'}, {key:'X-Frame-Options',value:'DENY'},
 {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
 {key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=()'},
];
const nextConfig:NextConfig={
 poweredByHeader:false,
 outputFileTracingRoot:process.cwd(),
 serverExternalPackages:['pg','@electric-sql/pglite'],
 async rewrites(){return [{source:'/admin',destination:'/admin.html'}];},
 async headers(){return [
  {source:'/:path*',headers:securityHeaders},
  {source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'}]},
  {source:'/admin/:path*',headers:[{key:'Cache-Control',value:'no-store'}]},
  ...['/index.html','/admin.html','/admin','/operator.html'].map(source=>({source,headers:[{key:'Cache-Control',value:'no-store'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"}]})),
  {source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache'}]},
 ];},
};
export default nextConfig;
