# Prayer Request App

## Project Overview
- **Name**: Prayer Request App
- **Goal**: A secure, full-stack prayer request management system for church communities
- **Features**: Password-protected prayer submission, update suggestions, and admin approval workflow

## URLs
- **Production**: https://e0b1f20f.prayer-app.pages.dev
- **Alternative**: https://prayer-app.pages.dev  
- **Public Display**: https://e0b1f20f.prayer-app.pages.dev/display
- **Submit Prayer (Guest)**: https://e0b1f20f.prayer-app.pages.dev/request-prayer
- **Login Page**: https://e0b1f20f.prayer-app.pages.dev/login
- **Admin Panel**: https://e0b1f20f.prayer-app.pages.dev/admin
- **User Management**: https://e0b1f20f.prayer-app.pages.dev/manage-users
- **GitHub Repository**: https://github.com/BCSSaints/byne-prayer-barometer

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

✅ **User Management System (NEW)**
- Comprehensive user management panel for super admins at `/manage-users`
- Role-based permissions (Super Admin, Admin, Moderator, Member)
- Create, activate, and deactivate user accounts
- Real-time user statistics and activity tracking
- Email and full name support for better user profiles

✅ **Prayer Request Categories with Color Coding (UPDATED)**
- 8 pre-configured categories: Praise Report, Hospital Need, Health Need, Prayer Need, Long-Term Need, College Student, Military, Ministry Partner
- **Full color coding system implemented**: Each category has distinct colors and icons
- Colored left borders on prayer cards matching category colors
- Colored category badges with white text for high contrast
- Category-specific FontAwesome icons (heart, hospital, praying-hands, etc.)
- Enhanced dropdown menus showing category colors
- Filter prayers by category with real-time counts and visual indicators

✅ **Import/Export System (NEW)**
- CSV import functionality for bulk prayer requests
- Professional export with printable reports
- Download prayer data as CSV for external use
- Import validation with error reporting

✅ **Enhanced Admin Controls (NEW)**
- Delete prayer requests with confirmation
- Sort all requests and updates by most recent first
- Admin import/export access from dashboard
- Comprehensive prayer management tools

✅ **Prayer Activity Tracking (NEW)**
- Admin dashboard shows when prayers were last updated
- Visual indicators for recently updated vs. created prayers
- Activity tracking page with complete prayer history
- Stale prayer detection (prayers over 30 days without updates)
- Statistics dashboard with prayer counts and activity metrics

✅ **BYNE CHURCH Branding**
- Custom church logo integration in header
- Matching blue color scheme from church branding
- Professional typography matching church identity
- Removed default credentials from login page for security

✅ **Enhanced Database Schema with Guest Support**
- Users table with role-based permissions and full profiles
- Prayer requests with status tracking (active/answered/archived)
- **Guest prayer submissions**: Support for non-registered users to submit public prayers
- Email fields for prayer requesters (both registered and guest users)
- Suggested updates with approval workflow and content replacement system
- Sessions table for secure authentication
- Prayer categories table with custom colors, icons, and sort ordering
- Permissions and role management system

✅ **Responsive UI**
- TailwindCSS styling with custom BYNE CHURCH colors
- FontAwesome icons for enhanced UX
- Mobile-friendly responsive layout
- Interactive forms with hover effects

## Current Functional Entry URIs

### Public Endpoints
- `GET /` → Main dashboard (redirects to `/login` if not authenticated)
- `GET /home` → Public landing page with navigation options
- `GET /display` → **Public prayer display with color coding** (no authentication required)
- `GET /request-prayer` → **Guest prayer submission form** (no authentication required)
- `GET /login` → Login page with credentials form
- `GET /register` → New user registration form
- `GET /logout` → Logout and clear session

### API Endpoints
- `POST /api/login` → Authenticate user and create session
- `POST /api/register` → Register new user account
- `POST /api/prayer-requests` → Submit new prayer request (requires auth)
- `POST /api/prayer-requests/public` → **Submit guest prayer request** (no authentication)
- `POST /api/prayer-requests/:id/suggest-update` → Suggest update (requires auth, JSON body)

### Admin Endpoints (requires admin privileges)
- `GET /admin` → Admin panel for reviewing suggested updates
- `POST /api/admin/review-update` → Approve/reject suggested updates

### Super Admin Endpoints (requires super admin privileges)
- `GET /manage-users` → User management panel
- `POST /api/users` → Create new user account
- `POST /api/users/:id` → Update user status (activate/deactivate)

### Import/Export & Activity Endpoints (requires admin privileges)
- `GET /admin/import` → CSV import interface
- `POST /api/admin/import` → Process CSV file upload
- `GET /admin/export` → Export and print interface
- `GET /admin/activity` → Prayer activity tracking dashboard
- `POST /api/prayer-requests/:id` → Delete prayer request

## User Guide
1. **Access the App**: Visit the production URL
2. **Login**: Contact administrator for credentials (default removed for security)
3. **Submit Prayer**: Fill out the prayer request form on the dashboard
4. **Suggest Updates**: Click "Suggest Update" on any prayer card to share news
5. **Admin Review**: Admins can visit `/admin` to approve/reject suggested updates
6. **User Management**: Super admins can visit `/manage-users` to create and manage users
7. **View Updates**: Approved updates appear on prayer request cards
8. **Filter by Category**: Use category buttons to filter prayer requests
9. **Import Data**: Admins can use `/admin/import` to bulk upload prayer requests from CSV
10. **Export/Print**: Use `/admin/export` to download CSV or print formatted reports
11. **Track Activity**: Admins can use `/admin/activity` to monitor prayer update patterns and find stale requests

## Administrator Access
- **Super Admin Account**: admin/admin123 (created during setup)
- **Role**: Super Administrator (full access including user management)
- **Security Note**: Change default password after first login
- **User Creation**: Super admins can create accounts for church members

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
- **Status**: ✅ PRODUCTION DEPLOYED WITH COLOR CODING
- **Production URL**: https://e0b1f20f.prayer-app.pages.dev
- **Database**: Cloudflare D1 (Remote Production) - prayer-app-production
- **Tech Stack**: Hono + TypeScript + TailwindCSS + D1 Database + FontAwesome Icons
- **Authentication**: Secure session-based with bcrypt password hashing
- **Color System**: 8 distinct category colors with matching icons and borders
- **Last Updated**: September 19, 2025

## Security Features
- Password hashing with bcrypt (12 rounds)
- Secure HTTP-only cookies for session management
- CSRF protection through form-based submissions
- Admin role separation for privileged operations
- Session expiration (24-hour lifetime)

## Features Not Yet Implemented
- User registration (currently admin creates users)
- Email notifications for prayer updates
- Advanced search functionality
- Prayer request status updates (answered/archived) - UI controls needed
- User profile management
- Prayer request comments/discussion
- Mobile app version
- Automated prayer reminders

## Recommended Next Steps
1. **Add email notifications** when updates are approved
2. **Implement prayer status workflow** (mark as answered/archived with UI controls)
3. **Create advanced search functionality** across all prayer fields
4. **Add prayer request analytics** and reporting dashboard
5. **Create mobile-optimized PWA** for better mobile experience
6. **Implement automated prayer reminders** for long-term requests
7. **Add user profile management** with contact preferences
8. **Create prayer request discussion threads** for community interaction
9. **Set up automated backups** for prayer data
10. **Add multi-language support** for diverse congregations