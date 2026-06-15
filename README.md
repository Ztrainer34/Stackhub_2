# StackHub - Marketing Tools Knowledge Platform

**StackHub** is a comprehensive platform for marketers to share, discover, and compare marketing tools through structured content like playbooks, tool combos, and detailed comparisons. The platform enables users to create rich, collaborative content while building a knowledge base of marketing strategies and tool insights.

## 🏗️ Architecture Overview

StackHub follows a modern full-stack architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Pages & UI    │  │  State Mgmt     │  │   Data Layer    │  │
│  │  - User Pages   │  │  - React Query  │  │  - API Client   │  │
│  │  - Tool Pages   │  │  - Local State  │  │  - Hooks        │  │
│  │  - Search       │  │  - Form State   │  │  - Validation   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                      HTTP/JSON API
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Go)                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   HTTP Router   │  │  Business Logic │  │   Data Access   │  │
│  │  - Chi Router   │  │  - Handlers     │  │  - SQLC         │  │
│  │  - Middleware   │  │  - Validation   │  │  - Queries      │  │
│  │  - CORS         │  │  - Auth         │  │  - Migrations   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                        Database Layer
                                │
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Core Tables   │  │   Relations     │  │   Extensions    │  │
│  │  - Users        │  │  - Post Tools   │  │  - Full Text    │  │
│  │  - Posts        │  │  - Stars        │  │  - UUID         │  │
│  │  - Tools        │  │  - Categories   │  │  - Trigrams     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🖥️ Frontend Architecture

### Technology Stack
- **Framework**: Next.js 15.1.6 with App Router
- **Runtime**: React 19.1.0
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: TanStack Query (React Query) for server state
- **Forms**: React Hook Form with Zod validation
- **Rich Text**: Lexical editor for content creation
- **Authentication**: Supabase Auth integration
- **Type Safety**: TypeScript throughout

### Frontend Structure
- **App Router**: Next.js 13+ routing with dynamic routes for users and content
- **Components**: Reusable UI components built with shadcn/ui and Tailwind CSS
- **Data Layer**: React Query hooks for server state management
- **Editor**: Lexical-based rich text editor with custom plugins
- **Authentication**: Supabase integration with secure session management

### Key Features
- **Server-Side Rendering**: Pre-rendered pages for better SEO and performance
- **Client-Side Hydration**: Interactive components with React Query caching
- **Type-Safe API**: Full TypeScript integration with backend contracts
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Rich Content Creation**: Lexical editor with image uploads and formatting
- **Real-time Search**: Full-text search with pagination and filtering
- **User Authentication**: Secure session management with Supabase

## 🔧 Backend Architecture

### Technology Stack
- **Language**: Go 1.23.5
- **HTTP Router**: Chi router with middleware support
- **Database**: PostgreSQL with pgx/v5 driver
- **Query Builder**: SQLC for type-safe SQL queries
- **Authentication**: JWT tokens with custom middleware
- **File Storage**: AWS S3 for media uploads
- **CORS**: Cross-origin resource sharing configured

### Backend Structure
- **HTTP Server**: Chi-based router with middleware for authentication and CORS
- **Database Layer**: SQLC-generated type-safe database access
- **Migration System**: Custom database migration and schema management
- **Business Logic**: Clean separation of concerns with structured handlers

### API Design
- **RESTful Architecture**: Resource-based URLs with HTTP methods
- **JSON Communication**: All requests/responses in JSON format
- **Pagination Support**: Cursor-based pagination for large datasets
- **Error Handling**: Structured error responses with HTTP status codes
- **Authentication**: JWT middleware for protected routes
- **CORS Support**: Cross-origin requests for development/production

### API Patterns
- **RESTful Resources**: User profiles, posts, tools, and search endpoints
- **Pagination**: Consistent pagination across all list endpoints
- **Authentication**: JWT-protected routes for user-specific actions
- **Search**: Full-text search with faceted filtering capabilities
- **Social Features**: Star/unstar posts, user profiles, and content discovery

## 🗄️ Database Design

### Core Entities
- **Users & Profiles**: User authentication and profile management
- **Posts**: Content items (playbooks, combos, comparisons) with rich text support
- **Tools**: Marketing tools with categories and metadata
- **Social Features**: User interactions like stars, comments, and follows

### Key Relationships
- **Many-to-Many**: Posts can reference multiple tools, tools can belong to multiple categories
- **One-to-Many**: Users can create multiple posts, posts can have multiple comments
- **Social Graph**: Users can star posts and follow other users

### Technical Features
- **Full-Text Search**: PostgreSQL-powered search across all content types
- **Performance**: Optimized indexes and efficient query patterns
- **Data Integrity**: Foreign key constraints and cascading deletes
- **Scalability**: UUID-based primary keys and proper normalization

## 🚀 Deployment & Development

### Development Setup
The project uses a monorepo structure with separate frontend and backend applications. Both can be started simultaneously using the provided start script, or individually for focused development.

### Configuration
- **Backend**: Requires PostgreSQL database connection and JWT configuration
- **Frontend**: Uses Supabase for authentication and API communication
- **File Storage**: AWS S3 integration for media uploads

### Database Management
- **Schema Generation**: SQLC for type-safe Go code generation from SQL
- **Migrations**: Custom migration system for schema updates
- **Development Data**: Bulk import tools for test data and categories

## 🎯 Key Features

### Content Creation
- **Rich Text Editor**: Lexical-based editor with plugins
- **Image Uploads**: AWS S3 integration for media storage
- **Tool Integration**: Link posts to marketing tools
- **Content Types**: Playbooks, combos, and comparisons
- **Draft System**: Save and edit content before publishing

### Search & Discovery
- **Full-Text Search**: PostgreSQL-powered search across all content
- **Faceted Search**: Filter by content type, tools, and categories
- **Pagination**: Efficient large dataset handling
- **Autocomplete**: Real-time suggestions for tools and content

### User Experience
- **Responsive Design**: Works on desktop and mobile
- **User Profiles**: Personal pages with content tabs
- **Social Features**: Star posts, follow users, comment
- **Authentication**: Secure login with Supabase Auth
- **Type Safety**: End-to-end TypeScript for reliability

### Performance
- **Server-Side Rendering**: Fast initial page loads
- **Client-Side Caching**: React Query for optimal data fetching
- **Database Optimization**: Indexes and efficient queries
- **CDN Integration**: Fast media delivery via AWS S3

## 📊 Data Flow

### Content Creation Flow
1. User creates content in rich text editor
2. Content saved as binary (rich text) + plain text (search)
3. Tool associations created via many-to-many relationships
4. Full-text search vectors updated via database triggers
5. Content published and indexed for search

### Search Flow
1. User enters search query
2. Frontend sends request with filters and pagination
3. Backend performs full-text search with PostgreSQL
4. Results returned with facet counts and metadata
5. Frontend displays results with infinite scroll/pagination

### User Profile Flow
1. User profile page loads with SSR
2. Tabs switch between different content types
3. Client-side pagination for large datasets
4. React Query caches results for performance
5. Real-time updates for starred content

## 🔒 Security

- **Authentication**: JWT tokens with secure HTTP-only cookies
- **Authorization**: Role-based access control
- **Input Validation**: Zod schemas for type safety
- **SQL Injection Prevention**: SQLC parameterized queries
- **CORS Configuration**: Restricted cross-origin access
- **File Upload Security**: S3 presigned URLs and type validation

## 🔄 Future Enhancements

- **Real-time Collaboration**: WebSocket integration for live editing
- **Advanced Analytics**: User engagement and content performance metrics
- **API Rate Limiting**: Protect against abuse and ensure fair usage
- **Caching Layer**: Redis for improved performance
- **Mobile App**: React Native or Flutter mobile application
- **Content Moderation**: AI-powered content filtering and review
- **Integration APIs**: Third-party tool integrations and webhooks

---

This architecture provides a scalable, maintainable foundation for a content-driven marketing platform with rich user interactions and powerful search capabilities.