import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { serveStatic } from 'hono/cloudflare-workers';
import { CloudflareBindings, LoginCredentials, PrayerRequestForm, CreateUserForm } from './types';
import { AuthService, requireAuth, requireAdmin, requireSuperAdmin } from './auth';
import { PrayerService } from './database';
import { UserService } from './userService';

// Create Hono app with type bindings
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: any } }>();

// Enable CORS for API routes
app.use('/api/*', cors());

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }));

// Helper function to render simplified pages
const renderSimplePage = (title: string, content: string, user: any = null) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - BYNE CHURCH Prayer App</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50 min-h-screen">
    <nav class="bg-blue-900 text-white shadow-lg">
        <div class="max-w-6xl mx-auto px-4 py-4">
            <div class="flex justify-between items-center">
                <h1 class="text-xl font-bold">BYNE CHURCH Prayer Requests</h1>
                <div class="flex items-center space-x-4">
                    ${user ? `
                        <span class="text-gray-300">Welcome, ${user.full_name || user.username}</span>
                        <span class="text-xs px-2 py-1 bg-blue-600 rounded">${user.role.replace('_', ' ').toUpperCase()}</span>
                        ${user.is_admin ? '<a href="/admin" class="bg-yellow-600 px-3 py-1 rounded text-sm hover:bg-yellow-500">Admin</a>' : ''}
                        ${user.role === 'super_admin' ? '<a href="/manage-users" class="bg-purple-600 px-3 py-1 rounded text-sm hover:bg-purple-500">Users</a>' : ''}
                        <a href="/logout" class="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-500">Logout</a>
                    ` : `
                        <a href="/request-prayer" class="bg-green-600 px-3 py-1 rounded text-sm hover:bg-green-700">Request Prayer</a>
                        <a href="/login" class="bg-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-700">Login</a>
                    `}
                </div>
            </div>
        </div>
    </nav>
    <div class="max-w-6xl mx-auto px-4 py-8">
        ${content}
    </div>
</body>
</html>`;
};

// Login page
app.get('/login', async (c) => {
  const content = `
    <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6 text-center">Member Login</h2>
        <form action="/api/login" method="POST" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input type="text" name="username" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" name="password" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <button type="submit" class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">Login</button>
        </form>
        <div class="mt-4 text-center">
            <a href="/register" class="text-blue-600 hover:text-blue-800 text-sm">Need an account? Register here</a>
        </div>
    </div>`;
  return c.html(renderSimplePage('Login', content));
});

// Register page
app.get('/register', async (c) => {
  const content = `
    <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6 text-center">Create Account</h2>
        <form action="/api/register" method="POST" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" name="full_name" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input type="text" name="username" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" name="email" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" name="password" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <button type="submit" class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">Register</button>
        </form>
        <div class="mt-4 text-center">
            <a href="/login" class="text-blue-600 hover:text-blue-800 text-sm">Already have an account? Login</a>
        </div>
    </div>`;
  return c.html(renderSimplePage('Register', content));
});

// Public prayer request page
app.get('/request-prayer', async (c) => {
  const prayerService = new PrayerService(c.env.DB);
  const categories = await prayerService.getAllCategories();

  const content = `
    <div class="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6 text-center">
            <i class="fas fa-praying-hands mr-2 text-blue-600"></i>
            Submit a Prayer Request
        </h2>
        
        <div class="mb-6 p-4 bg-blue-50 rounded-lg">
            <p class="text-blue-700 text-sm">
                <i class="fas fa-info-circle mr-2"></i>
                You can submit a prayer request as a guest. To submit private prayers, please 
                <a href="/register" class="text-blue-800 underline">create an account</a>.
            </p>
        </div>

        <form action="/api/prayer-requests/public" method="POST" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Prayer Request Title *</label>
                <input type="text" name="title" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Your Name *</label>
                <input type="text" name="requester_name" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Your Email (Optional)</label>
                <input type="email" name="requester_email" class="w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                <select name="category" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Select a category...</option>
                    ${categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Prayer Request Details *</label>
                <textarea name="content" required rows="4" class="w-full px-3 py-2 border border-gray-300 rounded-md"></textarea>
            </div>
            <div class="flex justify-between pt-4">
                <a href="/display" class="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600">
                    <i class="fas fa-arrow-left mr-2"></i>View Prayers
                </a>
                <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
                    <i class="fas fa-paper-plane mr-2"></i>Submit Prayer Request
                </button>
            </div>
        </form>
    </div>`;

  return c.html(renderSimplePage('Submit Prayer Request', content));
});

// Main dashboard (protected)
app.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const prayerService = new PrayerService(c.env.DB);
  
  const selectedCategory = c.req.query('category') || 'all';
  const prayerRequests = await prayerService.getAllPrayerRequests(selectedCategory === 'all' ? undefined : selectedCategory);
  const categories = await prayerService.getAllCategories();

  const content = `
    <div class="grid lg:grid-cols-3 gap-8">
        <!-- Submit Prayer Request Form -->
        <div class="lg:col-span-1">
            <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 class="text-xl font-bold mb-4">Submit Prayer Request</h2>
                <form action="/api/prayer-requests" method="POST" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <input type="text" name="title" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select name="category" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
                            ${categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Prayer Request</label>
                        <textarea name="content" rows="4" required class="w-full px-3 py-2 border border-gray-300 rounded-md"></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Requested by (name)</label>
                        <input type="text" name="requester_name" required class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                        <input type="email" name="requester_email" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    </div>
                    <div class="flex items-center">
                        <input type="checkbox" name="is_private" id="is_private" class="h-4 w-4 text-blue-600">
                        <label for="is_private" class="ml-2 text-sm text-gray-700">Private (members only)</label>
                    </div>
                    <button type="submit" class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">
                        <i class="fas fa-paper-plane mr-2"></i>Submit Prayer Request
                    </button>
                </form>
            </div>
        </div>
        
        <!-- Prayer Requests List -->
        <div class="lg:col-span-2">
            <h2 class="text-xl font-bold mb-4">Prayer Requests (${prayerRequests.length})</h2>
            <div class="space-y-4">
                ${prayerRequests.map(prayer => `
                    <div class="bg-white rounded-lg shadow-md p-4">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-bold text-lg">${prayer.title}</h3>
                            <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">${prayer.category}</span>
                        </div>
                        <p class="text-gray-700 mb-2">${prayer.content}</p>
                        <div class="text-sm text-gray-500">
                            By: ${prayer.requester_name} | ${new Date(prayer.created_at).toLocaleDateString()}
                            ${prayer.is_private ? '<span class="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">Private</span>' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>`;

  return c.html(renderSimplePage('Prayer Dashboard', content, user));
});

// Public display page
app.get('/display', async (c) => {
  const prayerService = new PrayerService(c.env.DB);
  const prayerRequests = await prayerService.getPublicPrayerRequests();

  const content = `
    <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-blue-600 mb-2">BYNE CHURCH</h1>
        <h2 class="text-2xl text-gray-700">Prayer Requests</h2>
    </div>
    
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${prayerRequests.map(prayer => `
            <div class="bg-white rounded-lg shadow-md p-4">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg">${prayer.title}</h3>
                    <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">${prayer.category}</span>
                </div>
                <p class="text-gray-700 mb-2">${prayer.content}</p>
                <div class="text-sm text-gray-500">
                    By: ${prayer.requester_name} | ${new Date(prayer.created_at).toLocaleDateString()}
                </div>
            </div>
        `).join('')}
    </div>
    
    <div class="text-center mt-8">
        <a href="/request-prayer" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700">
            <i class="fas fa-plus mr-2"></i>Submit Prayer Request
        </a>
    </div>`;

  return c.html(renderSimplePage('Prayer Display', content));
});

// User management (Super Admin only)
app.get('/manage-users', requireAuth, requireSuperAdmin, async (c) => {
  const user = c.get('user');
  const userService = new UserService(c.env.DB);
  const allUsers = await userService.getAllUsers();

  const content = `
    <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6">User Management</h2>
        <div class="overflow-x-auto">
            <table class="w-full border-collapse">
                <thead>
                    <tr class="bg-gray-50">
                        <th class="text-left p-3 border-b">User</th>
                        <th class="text-left p-3 border-b">Role</th>
                        <th class="text-left p-3 border-b">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${allUsers.map(u => `
                        <tr class="border-b">
                            <td class="p-3">${u.full_name || u.username} (@${u.username})</td>
                            <td class="p-3">
                                <span class="px-2 py-1 rounded text-xs ${u.role === 'super_admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}">
                                    ${u.role.replace('_', ' ').toUpperCase()}
                                </span>
                            </td>
                            <td class="p-3">
                                ${u.id !== user.id ? `
                                    <form action="/api/users/${u.id}/role" method="POST" class="inline">
                                        <select name="new_role" class="text-sm border rounded px-2 py-1 mr-2" onchange="this.form.submit()">
                                            <option value="member" ${u.role === 'member' ? 'selected' : ''}>Member</option>
                                            <option value="moderator" ${u.role === 'moderator' ? 'selected' : ''}>Moderator</option>
                                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                                            <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                                        </select>
                                    </form>
                                ` : '<span class="text-gray-500 text-sm">Your account</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>`;

  return c.html(renderSimplePage('User Management', content, user));
});

// API Routes
app.post('/api/login', async (c) => {
  const formData = await c.req.formData();
  const credentials: LoginCredentials = {
    username: formData.get('username') as string,
    password: formData.get('password') as string
  };

  const authService = new AuthService(c.env.DB);
  const user = await authService.authenticate(credentials.username, credentials.password);

  if (user) {
    const sessionId = await authService.createSession(user.id);
    setCookie(c, 'session_id', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 1440 * 60 // 24 hours
    });
    return c.redirect('/');
  } else {
    return c.redirect('/login?error=invalid');
  }
});

app.post('/api/register', async (c) => {
  const formData = await c.req.formData();
  const userData: CreateUserForm = {
    username: formData.get('username') as string,
    password: formData.get('password') as string,
    email: formData.get('email') as string,
    full_name: formData.get('full_name') as string,
    role: 'member'
  };

  const userService = new UserService(c.env.DB);
  try {
    await userService.createUser(userData);
    return c.redirect('/login?registered=success');
  } catch (error) {
    return c.redirect('/register?error=failed');
  }
});

app.get('/logout', (c) => {
  deleteCookie(c, 'session_id');
  return c.redirect('/login');
});

app.post('/api/prayer-requests', requireAuth, async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  
  const prayerData: PrayerRequestForm = {
    title: formData.get('title') as string,
    content: formData.get('content') as string,
    requester_name: formData.get('requester_name') as string,
    requester_email: formData.get('requester_email') as string || undefined,
    category: formData.get('category') as string,
    is_private: formData.get('is_private') === 'on',
  };

  const prayerService = new PrayerService(c.env.DB);
  await prayerService.createPrayerRequest(prayerData, user.id);
  
  return c.redirect('/');
});

app.post('/api/prayer-requests/public', async (c) => {
  const formData = await c.req.formData();
  
  const prayerData: PrayerRequestForm = {
    title: formData.get('title') as string,
    content: formData.get('content') as string,
    requester_name: formData.get('requester_name') as string,
    requester_email: formData.get('requester_email') as string || undefined,
    category: formData.get('category') as string,
    is_private: false,
  };

  const prayerService = new PrayerService(c.env.DB);
  await prayerService.createPrayerRequest(prayerData);
  
  return c.redirect('/display?submitted=success');
});

app.post('/api/users/:id/role', requireAuth, requireSuperAdmin, async (c) => {
  try {
    const userId = parseInt(c.req.param('id'));
    const formData = await c.req.formData();
    const newRole = formData.get('new_role') as string;

    const validRoles = ['member', 'moderator', 'admin', 'super_admin'];
    if (!validRoles.includes(newRole)) {
      return c.redirect('/manage-users?error=invalid_role');
    }

    const userService = new UserService(c.env.DB);
    await userService.updateUserRole(userId, newRole);
    
    return c.redirect('/manage-users?updated=success');
  } catch (error) {
    return c.redirect('/manage-users?error=update_failed');
  }
});

export default app;