import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { serveStatic } from 'hono/cloudflare-workers';
import { CloudflareBindings, LoginCredentials, PrayerRequestForm, SuggestedUpdateForm } from './types';
import { AuthService, requireAuth, requireAdmin } from './auth';
import { PrayerService } from './database';

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
        <title>${title} - Prayer App</title>
        <script src="https://cdn.tailwindcss.com"></script>
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
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="bg-blue-800 text-white shadow-lg">
            <div class="max-w-6xl mx-auto px-4 py-4">
                <div class="flex justify-between items-center">
                    <h1 class="text-xl font-bold">
                        <i class="fas fa-praying-hands mr-2"></i>
                        Prayer Request App
                    </h1>
                    <div class="flex items-center space-x-4">
                        ${user ? `
                            <span class="text-blue-200">Welcome, ${user.username}</span>
                            ${user.is_admin ? '<a href="/admin" class="bg-yellow-600 px-3 py-1 rounded text-sm hover:bg-yellow-500">Admin Panel</a>' : ''}
                            <a href="/logout" class="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-500">Logout</a>
                        ` : `
                            <a href="/login" class="bg-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-500">Login</a>
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
  const content = `
    <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-center mb-6">Login</h2>
        
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
                    class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <i class="fas fa-sign-in-alt mr-2"></i>Login
            </button>
        </form>
        
        <div class="mt-4 p-4 bg-blue-50 rounded">
            <p class="text-sm text-gray-600">
                <strong>Default Login:</strong><br>
                Username: admin<br>
                Password: admin123
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
  
  const prayerRequests = await prayerService.getAllPrayerRequests();

  const content = `
    <div class="grid md:grid-cols-2 gap-8">
        <div>
            <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 class="text-xl font-bold mb-4">
                    <i class="fas fa-plus-circle mr-2 text-green-600"></i>
                    Submit Prayer Request
                </h2>
                
                <form action="/api/prayer-requests" method="POST" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <input type="text" name="title" required 
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Prayer Request</label>
                        <textarea name="content" rows="4" required 
                                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Requested by (name)</label>
                        <input type="text" name="requester_name" required 
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    
                    <button type="submit" 
                            class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">
                        <i class="fas fa-paper-plane mr-2"></i>Submit Prayer Request
                    </button>
                </form>
            </div>
        </div>
        
        <div>
            <h2 class="text-xl font-bold mb-4">
                <i class="fas fa-praying-hands mr-2 text-blue-600"></i>
                Active Prayer Requests (${prayerRequests.length})
            </h2>
            
            <div class="space-y-4">
                ${prayerRequests.map(prayer => `
                    <div class="bg-white rounded-lg shadow-md p-4 prayer-card">
                        <h3 class="font-bold text-lg mb-2">${prayer.title}</h3>
                        <p class="text-gray-600 mb-3">${prayer.content}</p>
                        <div class="flex justify-between items-center text-sm text-gray-500 mb-3">
                            <span><i class="fas fa-user mr-1"></i>${prayer.requester_name}</span>
                            <span><i class="fas fa-calendar mr-1"></i>${new Date(prayer.created_at).toLocaleDateString()}</span>
                        </div>
                        
                        <div class="border-t pt-3">
                            <button id="update-btn-${prayer.id}" 
                                    onclick="toggleUpdateForm(${prayer.id})"
                                    class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
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
                `).join('')}
            </div>
        </div>
    </div>
  `;

  return c.html(renderPage('Dashboard', content, user));
});

// API: Login endpoint
app.post('/api/login', async (c) => {
  const formData = await c.req.formData();
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  const authService = new AuthService(c.env.DB);
  const user = await authService.authenticateUser(username, password);

  if (!user) {
    return c.redirect('/login?error=invalid');
  }

  const sessionId = await authService.createSession(user.id);
  
  // Set secure cookie
  setCookie(c, 'session_id', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 24 * 60 * 60
  });
  
  return c.redirect('/');
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

// Admin panel
app.get('/admin', requireAuth, requireAdmin, async (c) => {
  const user = c.get('user');
  const prayerService = new PrayerService(c.env.DB);
  
  const pendingUpdates = await prayerService.getPendingSuggestedUpdates();

  const content = `
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6">
            <i class="fas fa-shield-alt mr-2 text-yellow-600"></i>
            Admin Panel - Review Suggested Updates
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

export default app;