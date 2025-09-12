import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { serveStatic } from 'hono/cloudflare-workers';
import { CloudflareBindings, LoginCredentials, PrayerRequestForm, SuggestedUpdateForm, CreateUserForm } from './types';
import { AuthService, requireAuth, requireAdmin, requireSuperAdmin, requirePermission } from './auth';
import { PrayerService } from './database';
import { UserService } from './userService';

// Create Hono app with type bindings
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: any } }>();

// Enable CORS for API routes
app.use('/api/*', cors());

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }));

// Helper function to render the base HTML template
const renderPage = (title: string, content: string, user: any = null) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - BYNE CHURCH Prayer App</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  'byne-blue': '#2563eb',
                  'byne-dark-blue': '#1e40af',
                  'byne-black': '#0f172a',
                }
              }
            }
          }
        </script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          .prayer-card {
            transition: all 0.3s ease;
          }
          .prayer-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
          }
          .update-form {
            display: none;
          }
          .update-form.active {
            display: block;
          }
          .byne-logo {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 300;
            letter-spacing: 0.1em;
            text-transform: uppercase;
          }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="bg-byne-black text-white shadow-lg">
            <div class="max-w-6xl mx-auto px-4 py-6">
                <div class="flex justify-between items-center">
                    <div class="flex items-center space-x-4">
                        <img src="https://page.gensparksite.com/v1/base64_upload/55902c19483ba9b8cde122174f4dc301" 
                             alt="BYNE CHURCH" 
                             class="h-8 w-auto">
                        <div class="byne-logo">
                            <span class="text-byne-blue text-xl">BYNE</span>
                            <span class="text-byne-dark-blue text-xl ml-2">CHURCH</span>
                        </div>
                        <span class="text-gray-400 text-sm ml-4">Prayer Requests</span>
                    </div>
                    <div class="flex items-center space-x-4">
                        ${user ? `
                            <span class="text-gray-300">Welcome, ${user.full_name || user.username}</span>
                            <span class="text-xs px-2 py-1 bg-byne-blue rounded">${user.role.replace('_', ' ').toUpperCase()}</span>
                            ${user.is_admin ? '<a href="/admin" class="bg-yellow-600 px-3 py-1 rounded text-sm hover:bg-yellow-500">Admin Panel</a>' : ''}
                            ${user.is_admin ? '<a href="/admin/activity" class="bg-green-600 px-3 py-1 rounded text-sm hover:bg-green-500">Activity</a>' : ''}
                            ${user.role === 'super_admin' ? '<a href="/manage-users" class="bg-purple-600 px-3 py-1 rounded text-sm hover:bg-purple-500">Manage Users</a>' : ''}
                            <a href="/logout" class="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-500">Logout</a>
                        ` : `
                            <a href="/login" class="bg-byne-blue px-3 py-1 rounded text-sm hover:bg-byne-dark-blue">Login</a>
                        `}
                    </div>
                </div>
            </div>
        </nav>

        <div class="max-w-6xl mx-auto px-4 py-8">
            ${content}
        </div>

        <script>
            function toggleUpdateForm(prayerId) {
                const form = document.getElementById('update-form-' + prayerId);
                const button = document.getElementById('update-btn-' + prayerId);
                
                if (form.classList.contains('active')) {
                    form.classList.remove('active');
                    button.innerHTML = '<i class="fas fa-plus mr-1"></i> Suggest Update';
                } else {
                    form.classList.add('active');
                    button.innerHTML = '<i class="fas fa-times mr-1"></i> Cancel';
                }
            }

            async function submitUpdate(prayerId) {
                const textarea = document.getElementById('update-content-' + prayerId);
                const content = textarea.value.trim();
                
                if (!content) {
                    alert('Please enter an update.');
                    return;
                }

                try {
                    const response = await fetch('/api/prayer-requests/' + prayerId + '/suggest-update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ suggested_content: content })
                    });

                    if (response.ok) {
                        alert('Update suggestion submitted successfully! It will be reviewed by an administrator.');
                        textarea.value = '';
                        toggleUpdateForm(prayerId);
                        location.reload();
                    } else {
                        alert('Error submitting update. Please try again.');
                    }
                } catch (error) {
                    alert('Error submitting update. Please try again.');
                }
            }
        </script>
    </body>
    </html>
  `;
};

// Login page
app.get('/login', (c) => {
  const errorParam = c.req.query('error');
  let errorMessage = '';
  
  if (errorParam === 'invalid') {
    errorMessage = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Invalid username or password.</div>';
  } else if (errorParam === 'missing') {
    errorMessage = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Please enter both username and password.</div>';
  } else if (errorParam === 'server') {
    errorMessage = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Server error. Please try again.</div>';
  }

  const content = `
    <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-center mb-6">Login</h2>
        
        ${errorMessage}
        
        <form action="/api/login" method="POST" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input type="text" name="username" required 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" name="password" required 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            
            <button type="submit" 
                    class="w-full bg-byne-blue text-white py-2 px-4 rounded-md hover:bg-byne-dark-blue focus:outline-none focus:ring-2 focus:ring-byne-blue">
                <i class="fas fa-sign-in-alt mr-2"></i>Login
            </button>
        </form>
        
        <div class="mt-6 text-center">
            <p class="text-sm text-gray-500">
                Contact your administrator for login credentials.
            </p>
        </div>
    </div>
  `;

  return c.html(renderPage('Login', content));
});

// Main dashboard (protected)
app.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const prayerService = new PrayerService(c.env.DB);
  
  const selectedCategory = c.req.query('category') || 'all';
  const prayerRequests = await prayerService.getAllPrayerRequests(selectedCategory === 'all' ? undefined : selectedCategory);
  const categories = await prayerService.getAllCategories();
  const categoryStats = await prayerService.getPrayerCountsByCategory();

  const content = `
    <!-- Category Filter Bar -->
    <div class="mb-6 bg-white rounded-lg shadow-md p-4">
        <h3 class="text-lg font-bold mb-3">
            <i class="fas fa-filter mr-2 text-byne-blue"></i>
            Filter by Category
        </h3>
        <div class="flex flex-wrap gap-2">
            <a href="/?category=all" 
               class="px-3 py-1 rounded-full text-sm ${selectedCategory === 'all' ? 'bg-byne-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">
                <i class="fas fa-th-large mr-1"></i>All (${prayerRequests.length + categoryStats.reduce((sum, cat) => selectedCategory === 'all' ? 0 : sum + (cat.count || 0), 0)})
            </a>
            ${categories.map(cat => {
              const count = categoryStats.find(s => s.category === cat.name)?.count || 0;
              return `
                <a href="/?category=${encodeURIComponent(cat.name)}" 
                   class="px-3 py-1 rounded-full text-sm ${selectedCategory === cat.name ? 'text-white' : 'text-gray-700 hover:bg-gray-200'}"
                   style="background-color: ${selectedCategory === cat.name ? cat.color : '#f3f4f6'}">
                    <i class="${cat.icon} mr-1"></i>${cat.name} (${count})
                </a>
              `;
            }).join('')}
        </div>
    </div>

    <div class="grid lg:grid-cols-3 gap-8">
        <!-- Submit Prayer Request Form -->
        <div class="lg:col-span-1">
            <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 class="text-xl font-bold mb-4">
                    <i class="fas fa-plus-circle mr-2 text-green-600"></i>
                    Submit Prayer Request
                </h2>
                
                <form action="/api/prayer-requests" method="POST" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <input type="text" name="title" required 
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select name="category" required 
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                            ${categories.map(cat => `
                                <option value="${cat.name}">${cat.name}</option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Prayer Request</label>
                        <textarea name="content" rows="4" required 
                                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue"></textarea>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Requested by (name)</label>
                        <input type="text" name="requester_name" required 
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                    </div>
                    
                    <button type="submit" 
                            class="w-full bg-byne-blue text-white py-2 px-4 rounded-md hover:bg-byne-dark-blue">
                        <i class="fas fa-paper-plane mr-2"></i>Submit Prayer Request
                    </button>
                </form>
            </div>
        </div>
        
        <!-- Prayer Requests List -->
        <div class="lg:col-span-2">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">
                    <i class="fas fa-praying-hands mr-2 text-byne-blue"></i>
                    ${selectedCategory === 'all' ? 'All Prayer Requests' : selectedCategory} (${prayerRequests.length})
                </h2>
                ${user.is_admin ? `
                    <div class="flex space-x-2">
                        <a href="/admin/import" class="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
                            <i class="fas fa-upload mr-1"></i>Import
                        </a>
                        <a href="/admin/export" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                            <i class="fas fa-download mr-1"></i>Export
                        </a>
                    </div>
                ` : ''}
            </div>
            
            <div class="space-y-4">
                ${prayerRequests.map(prayer => {
                  const category = categories.find(c => c.name === prayer.category);
                  return `
                    <div class="bg-white rounded-lg shadow-md p-4 prayer-card border-l-4" style="border-left-color: ${category?.color || '#3B82F6'}">
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex items-center space-x-2 mb-2">
                                <span class="px-2 py-1 rounded-full text-xs font-semibold text-white" style="background-color: ${category?.color || '#3B82F6'}">
                                    <i class="${category?.icon || 'fas fa-praying-hands'} mr-1"></i>${prayer.category}
                                </span>
                                ${user.is_admin ? `
                                    <form action="/api/prayer-requests/${prayer.id}" method="POST" class="inline" onsubmit="return confirm('Are you sure you want to delete this prayer request? This action cannot be undone.')">
                                        <input type="hidden" name="_method" value="DELETE">
                                        <button type="submit" class="text-red-500 hover:text-red-700 text-xs">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </form>
                                ` : ''}
                            </div>
                        </div>
                        
                        <h3 class="font-bold text-lg mb-2">${prayer.title}</h3>
                        <p class="text-gray-600 mb-3">${prayer.content}</p>
                        
                        <div class="flex justify-between items-center text-sm text-gray-500 mb-3">
                            <span><i class="fas fa-user mr-1"></i>${prayer.requester_name}</span>
                            <div class="text-right">
                                <div><i class="fas fa-calendar mr-1"></i>Created: ${new Date(prayer.created_at).toLocaleDateString()}</div>
                                ${user.is_admin && prayer.updated_at !== prayer.created_at ? `
                                    <div class="text-green-600 text-xs mt-1">
                                        <i class="fas fa-clock mr-1"></i>Updated: ${new Date(prayer.updated_at).toLocaleDateString()} ${new Date(prayer.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        
                        <div class="border-t pt-3">
                            <button id="update-btn-${prayer.id}" 
                                    onclick="toggleUpdateForm(${prayer.id})"
                                    class="bg-byne-blue text-white px-3 py-1 rounded text-sm hover:bg-byne-dark-blue">
                                <i class="fas fa-plus mr-1"></i>Suggest Update
                            </button>
                            
                            <div id="update-form-${prayer.id}" class="update-form mt-3">
                                <textarea id="update-content-${prayer.id}" 
                                          placeholder="Share an update about this prayer request..."
                                          class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" rows="3"></textarea>
                                <div class="flex justify-end mt-2 space-x-2">
                                    <button onclick="toggleUpdateForm(${prayer.id})"
                                            class="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500">Cancel</button>
                                    <button onclick="submitUpdate(${prayer.id})"
                                            class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Submit</button>
                                </div>
                            </div>
                        </div>
                    </div>
                  `;
                }).join('')}
            </div>
        </div>
    </div>
  `;

  return c.html(renderPage('Dashboard', content, user));
});

// API: Login endpoint
app.post('/api/login', async (c) => {
  try {
    const formData = await c.req.formData();
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!username || !password) {
      return c.redirect('/login?error=missing');
    }

    const authService = new AuthService(c.env.DB);
    const user = await authService.authenticateUser(username, password);

    if (!user) {
      return c.redirect('/login?error=invalid');
    }

    const sessionId = await authService.createSession(user.id);
    
    // Set cookie with settings that work in Cloudflare Pages
    setCookie(c, 'session_id', sessionId, {
      httpOnly: true,
      secure: true, // Use secure in production
      sameSite: 'Lax', // More permissive for Cloudflare Pages
      path: '/',
      maxAge: 24 * 60 * 60
    });
    
    return c.redirect('/');
  } catch (error) {
    console.error('Login error:', error);
    return c.redirect('/login?error=server');
  }
});

// API: Logout endpoint
app.get('/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id');
  
  if (sessionId) {
    const authService = new AuthService(c.env.DB);
    await authService.deleteSession(sessionId);
  }
  
  deleteCookie(c, 'session_id');
  return c.redirect('/login');
});

// API: Create prayer request
app.post('/api/prayer-requests', requireAuth, async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  
  const prayerData: PrayerRequestForm = {
    title: formData.get('title') as string,
    content: formData.get('content') as string,
    requester_name: formData.get('requester_name') as string,
    category: formData.get('category') as string,
  };

  const prayerService = new PrayerService(c.env.DB);
  await prayerService.createPrayerRequest(prayerData, user.id);
  
  return c.redirect('/');
});

// API: Suggest update for prayer request
app.post('/api/prayer-requests/:id/suggest-update', requireAuth, async (c) => {
  const user = c.get('user');
  const prayerRequestId = parseInt(c.req.param('id'));
  const { suggested_content } = await c.req.json() as SuggestedUpdateForm;

  const prayerService = new PrayerService(c.env.DB);
  await prayerService.createSuggestedUpdate(prayerRequestId, { suggested_content }, user.id);
  
  return c.json({ success: true });
});

// API: Delete prayer request (Admin only)
app.post('/api/prayer-requests/:id', requireAuth, requireAdmin, async (c) => {
  try {
    const prayerRequestId = parseInt(c.req.param('id'));
    const formData = await c.req.formData();
    const method = formData.get('_method') as string;

    if (method === 'DELETE') {
      const prayerService = new PrayerService(c.env.DB);
      await prayerService.deletePrayerRequest(prayerRequestId);
    }
    
    return c.redirect('/');
  } catch (error) {
    console.error('Delete prayer request error:', error);
    return c.redirect('/?error=delete');
  }
});

// Admin panel
app.get('/admin', requireAuth, requireAdmin, async (c) => {
  const user = c.get('user');
  const prayerService = new PrayerService(c.env.DB);
  
  const pendingUpdates = await prayerService.getPendingSuggestedUpdates();
  const recentActivity = await prayerService.getRecentPrayerActivity();

  const content = `
    <div class="grid lg:grid-cols-2 gap-6 mb-6">
        <!-- Recent Prayer Activity -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-bold mb-4">
                <i class="fas fa-clock mr-2 text-blue-600"></i>
                Recent Prayer Activity
            </h3>
            <div class="space-y-3 max-h-96 overflow-y-auto">
                ${recentActivity.slice(0, 10).map(activity => `
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center space-x-3">
                            <span class="w-3 h-3 rounded-full" style="background-color: ${activity.color}"></span>
                            <div>
                                <div class="font-medium text-sm">${activity.title}</div>
                                <div class="text-xs text-gray-500">${activity.requester_name} • ${activity.category}</div>
                            </div>
                        </div>
                        <div class="text-right text-xs">
                            <div class="${activity.activity_type === 'updated' ? 'text-green-600' : 'text-blue-600'}">
                                ${activity.activity_type === 'updated' ? 'Updated' : 'Created'}
                            </div>
                            <div class="text-gray-500">${new Date(activity.activity_type === 'updated' ? activity.updated_at : activity.created_at).toLocaleDateString()}</div>
                            ${activity.pending_updates_count > 0 ? `<div class="text-orange-600 font-semibold">${activity.pending_updates_count} pending</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="mt-4 pt-4 border-t">
                <a href="/admin/activity" class="text-blue-600 hover:text-blue-800 text-sm">
                    <i class="fas fa-arrow-right mr-1"></i>View Full Activity Log
                </a>
            </div>
        </div>

        <!-- Pending Updates Summary -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-bold mb-4">
                <i class="fas fa-tasks mr-2 text-orange-600"></i>
                Pending Updates Summary
            </h3>
            ${pendingUpdates.length === 0 ? `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-check-circle text-4xl mb-4 text-green-400"></i>
                    <p>No pending updates to review.</p>
                    <p class="text-sm mt-2">All suggestions have been processed!</p>
                </div>
            ` : `
                <div class="mb-4 p-4 bg-orange-50 rounded-lg">
                    <div class="flex items-center justify-between">
                        <span class="text-orange-800 font-semibold">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            ${pendingUpdates.length} updates waiting for review
                        </span>
                        <button onclick="scrollToUpdates()" class="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700">
                            Review Now
                        </button>
                    </div>
                </div>
                <div class="space-y-2">
                    ${pendingUpdates.slice(0, 5).map(update => `
                        <div class="flex justify-between items-center p-2 bg-yellow-50 rounded">
                            <div class="text-sm">
                                <div class="font-medium">${update.prayer_title}</div>
                                <div class="text-gray-500 text-xs">by ${update.suggested_by_username}</div>
                            </div>
                            <div class="text-xs text-gray-500">${new Date(update.created_at).toLocaleDateString()}</div>
                        </div>
                    `).join('')}
                    ${pendingUpdates.length > 5 ? `<div class="text-center text-sm text-gray-500">...and ${pendingUpdates.length - 5} more</div>` : ''}
                </div>
            `}
        </div>
    </div>

    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6" id="pending-updates">
            <i class="fas fa-shield-alt mr-2 text-yellow-600"></i>
            Review Suggested Updates
        </h2>
        
        ${pendingUpdates.length === 0 ? `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-check-circle text-4xl mb-4"></i>
                <p>No pending updates to review.</p>
            </div>
        ` : `
            <div class="space-y-6">
                ${pendingUpdates.map(update => `
                    <div class="border rounded-lg p-4 bg-yellow-50">
                        <h4 class="font-bold text-lg mb-2">Prayer: "${update.prayer_title}"</h4>
                        <div class="bg-white p-3 rounded mb-3">
                            <p class="text-gray-700">${update.suggested_content}</p>
                        </div>
                        <div class="flex justify-between items-center text-sm text-gray-600 mb-4">
                            <span>Suggested by: ${update.suggested_by_username}</span>
                            <span>Date: ${new Date(update.created_at).toLocaleDateString()}</span>
                        </div>
                        
                        <form action="/api/admin/review-update" method="POST" class="flex gap-2">
                            <input type="hidden" name="update_id" value="${update.id}">
                            <textarea name="admin_notes" placeholder="Optional admin notes..." 
                                      class="flex-1 px-3 py-2 border rounded text-sm"></textarea>
                            <button type="submit" name="action" value="approve"
                                    class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                                <i class="fas fa-check mr-1"></i>Approve
                            </button>
                            <button type="submit" name="action" value="reject"
                                    class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
                                <i class="fas fa-times mr-1"></i>Reject
                            </button>
                        </form>
                    </div>
                `).join('')}
            </div>
        `}
    </div>

    <script>
        function scrollToUpdates() {
            document.getElementById('pending-updates').scrollIntoView({ 
                behavior: 'smooth' 
            });
        }
    </script>
  `;

  return c.html(renderPage('Admin Panel', content, user));
});

// API: Review update (admin only)
app.post('/api/admin/review-update', requireAuth, requireAdmin, async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  
  const updateId = parseInt(formData.get('update_id') as string);
  const action = formData.get('action') as string;
  const adminNotes = formData.get('admin_notes') as string;

  const prayerService = new PrayerService(c.env.DB);

  if (action === 'approve') {
    await prayerService.approveSuggestedUpdate(updateId, user.id, adminNotes);
  } else if (action === 'reject') {
    await prayerService.rejectSuggestedUpdate(updateId, user.id, adminNotes);
  }

  return c.redirect('/admin');
});

// User Management Panel (Super Admin only)
app.get('/manage-users', requireAuth, requireSuperAdmin, async (c) => {
  const user = c.get('user');
  const userService = new UserService(c.env.DB);
  
  const allUsers = await userService.getAllUsers();
  const userStats = await userService.getUserStats();

  const content = `
    <div class="grid md:grid-cols-3 gap-6">
        <!-- User Statistics -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-bold mb-4">
                <i class="fas fa-chart-bar mr-2 text-byne-blue"></i>
                User Statistics
            </h3>
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span>Total Users:</span>
                    <span class="font-bold">${userStats.total}</span>
                </div>
                ${userStats.byRole.map((role: any) => `
                    <div class="flex justify-between text-sm">
                        <span>${role.role.replace('_', ' ')}:</span>
                        <span>${role.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Create New User -->
        <div class="md:col-span-2 bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-bold mb-4">
                <i class="fas fa-user-plus mr-2 text-green-600"></i>
                Create New User
            </h3>
            
            <form action="/api/users" method="POST" class="grid md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input type="text" name="username" required 
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" name="email" required 
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" name="full_name" required 
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select name="role" required 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                        <option value="member">Member</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                
                <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input type="password" name="password" required minlength="6"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                </div>
                
                <div class="md:col-span-2">
                    <button type="submit" 
                            class="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">
                        <i class="fas fa-user-plus mr-2"></i>Create User
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Users List -->
    <div class="mt-8 bg-white rounded-lg shadow-md p-6">
        <h3 class="text-lg font-bold mb-4">
            <i class="fas fa-users mr-2 text-byne-blue"></i>
            All Users (${allUsers.length})
        </h3>
        
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${allUsers.map(u => `
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div class="flex items-center">
                                    <div>
                                        <div class="text-sm font-medium text-gray-900">${u.full_name || u.username}</div>
                                        <div class="text-sm text-gray-500">${u.email || u.username}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="px-2 py-1 text-xs font-semibold rounded-full 
                                    ${u.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 
                                      u.role === 'admin' ? 'bg-blue-100 text-blue-800' : 
                                      u.role === 'moderator' ? 'bg-green-100 text-green-800' : 
                                      'bg-gray-100 text-gray-800'}">
                                    ${u.role.replace('_', ' ').toUpperCase()}
                                </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="px-2 py-1 text-xs font-semibold rounded-full 
                                    ${u.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                                    ${u.status.toUpperCase()}
                                </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                ${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                ${u.role !== 'super_admin' || u.id !== user.id ? `
                                    <form action="/api/users/${u.id}" method="POST" class="inline">
                                        <input type="hidden" name="_method" value="DELETE">
                                        <button type="submit" 
                                                onclick="return confirm('Are you sure you want to deactivate this user?')"
                                                class="text-red-600 hover:text-red-900">
                                            ${u.status === 'active' ? 'Deactivate' : 'Activate'}
                                        </button>
                                    </form>
                                ` : '<span class="text-gray-400">Protected</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
  `;

  return c.html(renderPage('User Management', content, user));
});

// API: Create new user (Super Admin only)
app.post('/api/users', requireAuth, requireSuperAdmin, async (c) => {
  try {
    const user = c.get('user');
    const formData = await c.req.formData();
    
    const userData: CreateUserForm = {
      username: formData.get('username') as string,
      password: formData.get('password') as string,
      email: formData.get('email') as string,
      full_name: formData.get('full_name') as string,
      role: formData.get('role') as 'admin' | 'moderator' | 'member',
    };

    const userService = new UserService(c.env.DB);
    await userService.createUser(userData, user.id);
    
    return c.redirect('/manage-users');
  } catch (error) {
    console.error('Create user error:', error);
    return c.redirect('/manage-users?error=create');
  }
});

// API: Update user status (Super Admin only)
app.post('/api/users/:id', requireAuth, requireSuperAdmin, async (c) => {
  try {
    const user = c.get('user');
    const userId = parseInt(c.req.param('id'));
    const formData = await c.req.formData();
    const method = formData.get('_method') as string;

    const userService = new UserService(c.env.DB);
    
    if (method === 'DELETE') {
      // Get the target user to check if it's a super admin
      const targetUser = await userService.getUserById(userId);
      
      if (targetUser?.role === 'super_admin' && targetUser.id === user.id) {
        // Prevent self-deactivation of super admin
        return c.redirect('/manage-users?error=self_deactivate');
      }
      
      // Toggle user status
      const newStatus = targetUser?.status === 'active' ? 'inactive' : 'active';
      await userService.updateUser(userId, { status: newStatus });
    }
    
    return c.redirect('/manage-users');
  } catch (error) {
    console.error('Update user error:', error);
    return c.redirect('/manage-users?error=update');
  }
});

// Admin Activity Tracking Page
app.get('/admin/activity', requireAuth, requireAdmin, async (c) => {
  const user = c.get('user');
  const prayerService = new PrayerService(c.env.DB);
  
  const recentActivity = await prayerService.getRecentPrayerActivity(50);
  const staleRequests = await prayerService.getStalePrayers(30);
  const categoryStats = await prayerService.getPrayerCountsByCategory();

  const content = `
    <div class="space-y-6">
        <!-- Activity Statistics -->
        <div class="grid md:grid-cols-4 gap-4">
            <div class="bg-blue-500 text-white rounded-lg p-4">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-blue-100 text-sm">Total Active</p>
                        <p class="text-2xl font-bold">${categoryStats.reduce((sum, cat) => sum + cat.count, 0)}</p>
                    </div>
                    <i class="fas fa-praying-hands text-2xl text-blue-200"></i>
                </div>
            </div>
            
            <div class="bg-green-500 text-white rounded-lg p-4">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-green-100 text-sm">Recent Activity</p>
                        <p class="text-2xl font-bold">${recentActivity.filter(a => a.activity_type === 'updated').length}</p>
                    </div>
                    <i class="fas fa-clock text-2xl text-green-200"></i>
                </div>
            </div>
            
            <div class="bg-orange-500 text-white rounded-lg p-4">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-orange-100 text-sm">Needs Attention</p>
                        <p class="text-2xl font-bold">${staleRequests.length}</p>
                    </div>
                    <i class="fas fa-exclamation-triangle text-2xl text-orange-200"></i>
                </div>
            </div>
            
            <div class="bg-purple-500 text-white rounded-lg p-4">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-purple-100 text-sm">Categories</p>
                        <p class="text-2xl font-bold">${categoryStats.length}</p>
                    </div>
                    <i class="fas fa-tags text-2xl text-purple-200"></i>
                </div>
            </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-6">
            <!-- Full Activity Log -->
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-lg font-bold mb-4">
                    <i class="fas fa-history mr-2 text-blue-600"></i>
                    Complete Activity Log
                </h3>
                <div class="space-y-3 max-h-96 overflow-y-auto">
                    ${recentActivity.map(activity => `
                        <div class="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0 mt-1">
                                    <span class="w-3 h-3 rounded-full inline-block" style="background-color: ${activity.color}"></span>
                                </div>
                                <div class="flex-1">
                                    <div class="font-medium text-sm">${activity.title}</div>
                                    <div class="text-xs text-gray-500 mb-1">${activity.requester_name} • ${activity.category}</div>
                                    <div class="flex items-center space-x-4 text-xs text-gray-500">
                                        <span>Created: ${new Date(activity.created_at).toLocaleDateString()}</span>
                                        ${activity.updated_at !== activity.created_at ? `
                                            <span class="text-green-600">Updated: ${new Date(activity.updated_at).toLocaleDateString()}</span>
                                        ` : ''}
                                    </div>
                                    ${activity.pending_updates_count > 0 || activity.approved_updates_count > 0 ? `
                                        <div class="flex items-center space-x-2 mt-1">
                                            ${activity.pending_updates_count > 0 ? `<span class="px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded">${activity.pending_updates_count} pending</span>` : ''}
                                            ${activity.approved_updates_count > 0 ? `<span class="px-2 py-1 bg-green-100 text-green-600 text-xs rounded">${activity.approved_updates_count} approved</span>` : ''}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                            <div class="flex-shrink-0 text-right">
                                <div class="text-xs ${activity.activity_type === 'updated' ? 'text-green-600' : 'text-blue-600'} font-semibold">
                                    ${activity.activity_type === 'updated' ? 'UPDATED' : 'NEW'}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Stale Requests Needing Attention -->
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-lg font-bold mb-4">
                    <i class="fas fa-clock mr-2 text-orange-600"></i>
                    Requests Needing Attention
                </h3>
                ${staleRequests.length === 0 ? `
                    <div class="text-center py-8 text-gray-500">
                        <i class="fas fa-thumbs-up text-4xl mb-4 text-green-400"></i>
                        <p>All prayers have recent activity!</p>
                        <p class="text-sm mt-2">No requests older than 30 days without updates.</p>
                    </div>
                ` : `
                    <p class="text-orange-700 text-sm mb-4">These requests haven't been updated in 30+ days and may need follow-up:</p>
                    <div class="space-y-3 max-h-96 overflow-y-auto">
                        ${staleRequests.map(prayer => `
                            <div class="flex items-start justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                                <div class="flex items-start space-x-3">
                                    <span class="w-3 h-3 rounded-full mt-1 flex-shrink-0" style="background-color: ${prayer.color}"></span>
                                    <div>
                                        <div class="font-medium text-sm">${prayer.title}</div>
                                        <div class="text-xs text-gray-500">${prayer.requester_name} • ${prayer.category}</div>
                                        <div class="text-xs text-orange-600 mt-1">
                                            <i class="fas fa-calendar mr-1"></i>
                                            ${prayer.days_since_update} days since last update
                                        </div>
                                    </div>
                                </div>
                                <a href="/?category=${encodeURIComponent(prayer.category)}" 
                                   class="text-blue-600 hover:text-blue-800 text-xs">
                                    View
                                </a>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-bold mb-4">
                <i class="fas fa-tools mr-2 text-gray-600"></i>
                Quick Admin Actions
            </h3>
            <div class="grid md:grid-cols-4 gap-4">
                <a href="/admin" class="bg-blue-600 text-white p-4 rounded-lg text-center hover:bg-blue-700">
                    <i class="fas fa-shield-alt text-2xl mb-2"></i>
                    <div class="font-semibold">Review Updates</div>
                </a>
                <a href="/admin/import" class="bg-green-600 text-white p-4 rounded-lg text-center hover:bg-green-700">
                    <i class="fas fa-upload text-2xl mb-2"></i>
                    <div class="font-semibold">Import Prayers</div>
                </a>
                <a href="/admin/export" class="bg-purple-600 text-white p-4 rounded-lg text-center hover:bg-purple-700">
                    <i class="fas fa-download text-2xl mb-2"></i>
                    <div class="font-semibold">Export Data</div>
                </a>
                <a href="/manage-users" class="bg-indigo-600 text-white p-4 rounded-lg text-center hover:bg-indigo-700">
                    <i class="fas fa-users text-2xl mb-2"></i>
                    <div class="font-semibold">Manage Users</div>
                </a>
            </div>
        </div>
    </div>
  `;

  return c.html(renderPage('Prayer Activity Tracking', content, user));
});

// Import page (Admin only)
app.get('/admin/import', requireAuth, requireAdmin, async (c) => {
  const user = c.get('user');
  const prayerService = new PrayerService(c.env.DB);
  const categories = await prayerService.getAllCategories();

  const content = `
    <div class="max-w-4xl mx-auto">
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6">
          <i class="fas fa-upload mr-2 text-green-600"></i>
          Import Prayer Requests
        </h2>
        
        <div class="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 class="font-bold text-blue-800 mb-2">CSV Format Requirements:</h3>
          <p class="text-blue-700 mb-2">Your CSV file should have the following columns (first row as headers):</p>
          <code class="bg-blue-100 p-2 rounded text-sm block">
            title,content,requester_name,category
          </code>
          <p class="text-blue-700 mt-2 text-sm">
            Available categories: ${categories.map(c => c.name).join(', ')}
          </p>
        </div>

        <div class="mb-6 p-4 bg-yellow-50 rounded-lg">
          <h3 class="font-bold text-yellow-800 mb-2">Example CSV Content:</h3>
          <pre class="bg-yellow-100 p-2 rounded text-sm overflow-x-auto">
title,content,requester_name,category
"Healing for John","Please pray for John's recovery from surgery","Mary Smith","Health Need"
"Mission Trip Safety","Pray for our team going to Honduras","Youth Pastor","Ministry Partner"
"College Stress","Pray for peace during finals week","Sarah Johnson","College Student"
          </pre>
        </div>

        <form action="/api/admin/import" method="POST" enctype="multipart/form-data" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Select CSV File</label>
            <input type="file" name="csvFile" accept=".csv" required 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
            <p class="text-sm text-gray-500 mt-1">Upload a CSV file with prayer requests</p>
          </div>
          
          <div class="flex justify-between">
            <a href="/" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
              <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
            </a>
            <button type="submit" class="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
              <i class="fas fa-upload mr-2"></i>Import Prayer Requests
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  return c.html(renderPage('Import Prayer Requests', content, user));
});

// Export page (Admin only)
app.get('/admin/export', requireAuth, requireAdmin, async (c) => {
  const user = c.get('user');
  const prayerService = new PrayerService(c.env.DB);
  const exportData = await prayerService.getExportData();
  
  // Generate CSV content
  const csvHeaders = ['Title', 'Content', 'Requested By', 'Category', 'Status', 'Created Date', 'Recent Updates'];
  const csvRows = exportData.map(prayer => [
    `"${prayer.title.replace(/"/g, '""')}"`,
    `"${prayer.content.replace(/"/g, '""')}"`,
    `"${prayer.requester_name.replace(/"/g, '""')}"`,
    `"${prayer.category}"`,
    `"${prayer.status}"`,
    `"${new Date(prayer.created_at).toLocaleDateString()}"`,
    `"${(prayer.approved_updates || '').replace(/"/g, '""')}"`
  ]);
  
  const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');

  const content = `
    <div class="max-w-6xl mx-auto">
      <div class="bg-white rounded-lg shadow-md p-6">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">
            <i class="fas fa-download mr-2 text-blue-600"></i>
            Export Prayer Requests (${exportData.length} active)
          </h2>
          <div class="flex space-x-2">
            <button onclick="downloadCSV()" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
              <i class="fas fa-file-csv mr-2"></i>Download CSV
            </button>
            <button onclick="printReport()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              <i class="fas fa-print mr-2"></i>Print Report
            </button>
            <a href="/" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
              <i class="fas fa-arrow-left mr-2"></i>Back
            </a>
          </div>
        </div>

        <div id="printable-report" class="space-y-4">
          <div class="text-center mb-6 print:block hidden">
            <h1 class="text-2xl font-bold">BYNE CHURCH</h1>
            <h2 class="text-xl">Prayer Request Report</h2>
            <p class="text-gray-600">Generated on ${new Date().toLocaleDateString()}</p>
          </div>

          ${exportData.map((prayer, index) => `
            <div class="border rounded-lg p-4 print:border-gray-400 print:mb-4 print:break-inside-avoid">
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-lg">${index + 1}. ${prayer.title}</h3>
                <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                  ${prayer.category}
                </span>
              </div>
              <p class="text-gray-700 mb-2">${prayer.content}</p>
              <div class="text-sm text-gray-500 mb-2">
                <strong>Requested by:</strong> ${prayer.requester_name} | 
                <strong>Date:</strong> ${new Date(prayer.created_at).toLocaleDateString()}
              </div>
              ${prayer.approved_updates ? `
                <div class="bg-green-50 p-2 rounded mt-2">
                  <strong class="text-green-800">Recent Updates:</strong>
                  <p class="text-green-700 text-sm">${prayer.approved_updates}</p>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <script>
      const csvData = \`${csvContent.replace(/`/g, '\\`')}\`;
      
      function downloadCSV() {
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'byne_church_prayer_requests_' + new Date().toISOString().split('T')[0] + '.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      function printReport() {
        window.print();
      }
    </script>

    <style>
      @media print {
        body * {
          visibility: hidden;
        }
        #printable-report, #printable-report * {
          visibility: visible;
        }
        #printable-report {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        .no-print {
          display: none !important;
        }
      }
    </style>
  `;

  return c.html(renderPage('Export Prayer Requests', content, user));
});

// API: Import CSV (Admin only)
app.post('/api/admin/import', requireAuth, requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const formData = await c.req.formData();
    const csvFile = formData.get('csvFile') as File;

    if (!csvFile || !csvFile.name.endsWith('.csv')) {
      return c.redirect('/admin/import?error=invalid_file');
    }

    const csvContent = await csvFile.text();
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return c.redirect('/admin/import?error=empty_file');
    }

    // Parse CSV (simple parsing - assumes no commas in quoted fields for now)
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const requiredHeaders = ['title', 'content', 'requester_name', 'category'];
    
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return c.redirect(`/admin/import?error=missing_headers&headers=${missingHeaders.join(',')}`);
    }

    const prayers: PrayerRequestForm[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      
      if (values.length >= headers.length) {
        const prayer: PrayerRequestForm = {
          title: values[headers.indexOf('title')] || '',
          content: values[headers.indexOf('content')] || '',
          requester_name: values[headers.indexOf('requester_name')] || '',
          category: values[headers.indexOf('category')] || 'Prayer Need'
        };
        
        if (prayer.title && prayer.content && prayer.requester_name) {
          prayers.push(prayer);
        }
      }
    }

    const prayerService = new PrayerService(c.env.DB);
    const result = await prayerService.bulkImportPrayerRequests(prayers, user.id);
    
    return c.redirect(`/?imported=${result.success}&failed=${result.failed}`);
    
  } catch (error) {
    console.error('Import error:', error);
    return c.redirect('/admin/import?error=processing');
  }
});

export default app;