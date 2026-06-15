import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'facebookexternalhit',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/settings/']
      },
      {
        userAgent: 'Twitterbot',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/settings/']
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/settings/']
      }
    ]
  }
}