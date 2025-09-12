# Prayer Request App

## Project Overview
- **Name**: Prayer Request App
- **Goal**: A secure, full-stack prayer request management system for church communities
- **Features**: Password-protected prayer submission, update suggestions, and admin approval workflow

## URLs
- **Production**: https://be3e1e1d.prayer-app.pages.dev
- **Alternative**: https://prayer-app.pages.dev
- **Login Page**: https://be3e1e1d.prayer-app.pages.dev/login
- **Admin Panel**: https://be3e1e1d.prayer-app.pages.dev/admin

## Data Architecture
- **Data Models**: Users, Prayer Requests, Suggested Updates, Sessions
- **Storage Services**: Cloudflare D1 SQLite Database
- **Data Flow**: 
  - Users authenticate with password-based sessions
  - Authenticated users can submit prayer requests
  - Users can suggest updates to existing prayers
  - Admins approve/reject suggested updates before they appear publicly

## Features Completed
✅ **Authentication System**
- Password-protected login with session management
- Secure cookie-based authentication
- Default admin account (username: admin, password: admin123)

✅ **Prayer Request Management**
- Submit new prayer requests with title, content, and requester name
- View all active prayer requests in responsive cards
- Track submission dates and requester information

✅ **Update Suggestion System**
- Touch/click any prayer request to suggest updates
- Interactive forms for suggesting prayer updates
- Real-time UI updates with JavaScript

✅ **Admin Panel**
- Dedicated admin interface at `/admin`
- Review pending suggested updates
- Approve or reject updates with optional admin notes
- Automatic timestamp tracking for review actions

✅ **Database Schema**
- Users table with admin role support
- Prayer requests with status tracking (active/answered/archived)
- Suggested updates with approval workflow
- Sessions table for secure authentication

✅ **Responsive UI**
- TailwindCSS styling with modern design
- FontAwesome icons for enhanced UX
- Mobile-friendly responsive layout
- Interactive forms with hover effects

## Current Functional Entry URIs

### Public Endpoints
- `GET /` → Main dashboard (redirects to `/login` if not authenticated)
- `GET /login` → Login page with credentials form
- `GET /logout` → Logout and clear session

### API Endpoints
- `POST /api/login` → Authenticate user and create session
- `POST /api/prayer-requests` → Submit new prayer request (requires auth)
- `POST /api/prayer-requests/:id/suggest-update` → Suggest update (requires auth, JSON body)

### Admin Endpoints (requires admin privileges)
- `GET /admin` → Admin panel for reviewing suggested updates
- `POST /api/admin/review-update` → Approve/reject suggested updates

## User Guide
1. **Access the App**: Visit the development URL
2. **Login**: Use default credentials (admin/admin123) or create additional users
3. **Submit Prayer**: Fill out the prayer request form on the dashboard
4. **Suggest Updates**: Click "Suggest Update" on any prayer card to share news
5. **Admin Review**: Admins can visit `/admin` to approve/reject suggested updates
6. **View Updates**: Approved updates appear on prayer request cards

## Default Login Credentials
- **Username**: admin
- **Password**: admin123
- **Role**: Administrator (can access admin panel)

## Database Configuration
- **Local Development**: Uses SQLite via Wrangler `--local` flag
- **Production**: Cloudflare D1 database (prayer-app-production)
- **Migrations**: Located in `/migrations/` directory
- **Seed Data**: Sample prayer requests and admin user in `seed.sql`

## Development Commands
```bash
# Start development server
npm run dev:sandbox

# Build for production
npm run build

# Database operations
npm run db:migrate:local    # Apply migrations locally
npm run db:seed            # Add sample data
npm run db:reset           # Reset and reseed database
npm run db:console:local   # Open database console

# Git operations
npm run git:status         # Check git status
npm run git:commit "msg"   # Add and commit with message
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ PRODUCTION DEPLOYED
- **Production URL**: https://be3e1e1d.prayer-app.pages.dev
- **Database**: Cloudflare D1 (Remote Production)
- **Tech Stack**: Hono + TypeScript + TailwindCSS + D1 Database
- **Authentication**: Secure session-based with bcrypt password hashing
- **Last Updated**: September 3, 2025

## Security Features
- Password hashing with bcrypt (12 rounds)
- Secure HTTP-only cookies for session management
- CSRF protection through form-based submissions
- Admin role separation for privileged operations
- Session expiration (24-hour lifetime)

## Features Not Yet Implemented
- User registration (currently admin creates users)
- Email notifications for prayer updates
- Prayer request categories/tags
- Search and filtering functionality
- Bulk prayer request management
- Prayer request status updates (answered/archived)
- User profile management
- Prayer request comments/discussion

## Recommended Next Steps
1. **Add user registration system** for church members
2. **Implement prayer categories** (healing, guidance, thanksgiving, etc.)
3. **Add email notifications** when updates are approved
4. **Create search/filter functionality** for prayer requests
5. **Add prayer request status management** (mark as answered)
6. **Implement bulk operations** for admin management
7. **Add prayer request analytics** and reporting
8. **Create mobile-optimized PWA** for better mobile experience
9. **Deploy to production** Cloudflare Pages
10. **Set up automated backups** for prayer data