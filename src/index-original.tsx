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
                        <div class="byne-logo">
                            <span class="text-byne-blue text-xl font-bold">BYNE</span>
                            <span class="text-byne-dark-blue text-xl ml-2 font-bold">CHURCH</span>
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
                            <a href="/request-prayer" class="bg-green-600 px-3 py-1 rounded text-sm hover:bg-green-700">Request Prayer</a>
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
            
            function toggleMainPrayerContent(prayerId) {
                const content = document.getElementById('main-prayer-content-' + prayerId);
                const toggleText = document.getElementById('main-toggle-text-' + prayerId);
                
                if (content && toggleText) {
                    if (content.classList.contains('hidden')) {
                        content.classList.remove('hidden');
                        toggleText.innerHTML = '<i class="fas fa-eye-slash mr-1"></i>Hide details';
                    } else {
                        content.classList.add('hidden');
                        toggleText.innerHTML = '<i class="fas fa-eye mr-1"></i>Click to view details';
                    }
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
            <p class="text-sm text-gray-500 mb-3">
                Don't have an account?
            </p>
            <a href="/register" class="inline-block bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm mb-3">
                <i class="fas fa-user-plus mr-2"></i>Create Account
            </a>
            
            <div class="text-center">
                <a href="/forgot-password" class="text-byne-blue hover:text-byne-dark-blue text-sm">
                    <i class="fas fa-key mr-1"></i>Forgot Password?
                </a>
            </div>
            
            <p class="text-xs text-gray-400 mt-3">
                For admin access, contact your administrator.
            </p>
        </div>
    </div>
  `;

  return c.html(renderPage('Login', content));
});

// Registration page
app.get('/register', (c) => {
  const errorParam = c.req.query('error');
  const successParam = c.req.query('success');
  let message = '';
  
  if (errorParam === 'username_taken') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Username already taken. Please choose a different username.</div>';
  } else if (errorParam === 'missing') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Please fill in all required fields.</div>';
  } else if (errorParam === 'password_mismatch') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Passwords do not match.</div>';
  } else if (errorParam === 'server') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Server error. Please try again.</div>';
  } else if (successParam === '1') {
    message = '<div class="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">Account created successfully! You can now log in.</div>';
  }

  const content = `
    <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-center mb-6">Create Account</h2>
        
        <div class="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded text-sm">
            <i class="fas fa-info-circle mr-2"></i>
            <strong>Member Account:</strong> You'll be able to submit prayer requests and suggest updates to existing prayers.
        </div>
        
        ${message}
        
        <form action="/api/register" method="POST" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" name="full_name" required 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input type="text" name="username" required 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                       pattern="[a-zA-Z0-9_]+" title="Only letters, numbers, and underscores allowed">
                <p class="text-xs text-gray-500 mt-1">Only letters, numbers, and underscores</p>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" name="email" 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" name="password" required minlength="6"
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
                <p class="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                <input type="password" name="confirm_password" required minlength="6"
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
            </div>
            
            <button type="submit" 
                    class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500">
                <i class="fas fa-user-plus mr-2"></i>Create Account
            </button>
        </form>
        
        <div class="mt-6 text-center">
            <p class="text-sm text-gray-500 mb-2">
                Already have an account?
            </p>
            <a href="/login" class="text-byne-blue hover:text-byne-dark-blue text-sm">
                <i class="fas fa-sign-in-alt mr-1"></i>Sign In
            </a>
        </div>
    </div>
  `;

  return c.html(renderPage('Create Account', content));
});

// Forgot Password page
app.get('/forgot-password', (c) => {
  const errorParam = c.req.query('error');
  const successParam = c.req.query('success');
  let message = '';
  
  if (errorParam === 'email_not_found') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">No account found with that email address.</div>';
  } else if (errorParam === 'missing') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Please enter your email address.</div>';
  } else if (errorParam === 'server') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Server error. Please try again.</div>';
  } else if (successParam === '1') {
    const demoToken = c.req.query('demo_token');
    const resetLink = demoToken ? `/reset-password?token=${demoToken}` : '#';
    message = `<div class="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
      <p><strong>Password reset instructions sent!</strong></p>
      <p class="text-sm mt-2">In a real application, this would be sent via email.</p>
      ${demoToken ? `<p class="text-sm mt-2"><strong>Demo Link:</strong> <a href="${resetLink}" class="text-blue-700 hover:text-blue-900 underline">Reset your password here</a></p>` : ''}
    </div>`;
  }

  const content = `
    <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-center mb-6">Forgot Password</h2>
        
        <div class="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded text-sm">
            <i class="fas fa-info-circle mr-2"></i>
            Enter your email address and we'll send you instructions to reset your password.
        </div>
        
        ${message}
        
        <form action="/api/forgot-password" method="POST" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <input type="email" name="email" required 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
            </div>
            
            <button type="submit" 
                    class="w-full bg-byne-blue text-white py-2 px-4 rounded-md hover:bg-byne-dark-blue focus:outline-none focus:ring-2 focus:ring-byne-blue">
                <i class="fas fa-paper-plane mr-2"></i>Send Reset Instructions
            </button>
        </form>
        
        <div class="mt-6 text-center">
            <p class="text-sm text-gray-500 mb-2">
                Remember your password?
            </p>
            <a href="/login" class="text-byne-blue hover:text-byne-dark-blue text-sm">
                <i class="fas fa-sign-in-alt mr-1"></i>Back to Login
            </a>
        </div>
    </div>
  `;

  return c.html(renderPage('Forgot Password', content));
});

// Reset Password page
app.get('/reset-password', (c) => {
  const token = c.req.query('token');
  const errorParam = c.req.query('error');
  const successParam = c.req.query('success');
  let message = '';
  
  if (!token) {
    return c.redirect('/forgot-password?error=missing_token');
  }
  
  if (errorParam === 'invalid_token') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">This reset link is invalid or has expired. Please request a new one.</div>';
  } else if (errorParam === 'password_mismatch') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Passwords do not match.</div>';
  } else if (errorParam === 'missing') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Please fill in all fields.</div>';
  } else if (errorParam === 'server') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Server error. Please try again.</div>';
  } else if (successParam === '1') {
    message = '<div class="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">Your password has been reset successfully! You can now log in with your new password.</div>';
  }

  const content = `
    <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-center mb-6">Reset Password</h2>
        
        <div class="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded text-sm">
            <i class="fas fa-info-circle mr-2"></i>
            Enter your new password below.
        </div>
        
        ${message}
        
        <form action="/api/reset-password" method="POST" class="space-y-4">
            <input type="hidden" name="token" value="${token}">
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
                <input type="password" name="password" required minlength="6"
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                <p class="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Confirm New Password *</label>
                <input type="password" name="confirm_password" required minlength="6"
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
            </div>
            
            <button type="submit" 
                    class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500">
                <i class="fas fa-lock mr-2"></i>Reset Password
            </button>
        </form>
        
        <div class="mt-6 text-center">
            <a href="/login" class="text-byne-blue hover:text-byne-dark-blue text-sm">
                <i class="fas fa-sign-in-alt mr-1"></i>Back to Login
            </a>
        </div>
    </div>
  `;

  return c.html(renderPage('Reset Password', content));
});

// Public prayer request page (for guests)
app.get('/request-prayer', async (c) => {
  const prayerService = new PrayerService(c.env.DB);
  const categories = await prayerService.getAllCategories();
  const errorParam = c.req.query('error');
  const successParam = c.req.query('success');
  let message = '';
  
  if (errorParam === 'missing') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Please fill in all required fields.</div>';
  } else if (errorParam === 'server') {
    message = '<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">Server error. Please try again.</div>';
  } else if (successParam === '1') {
    message = '<div class="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">Your prayer request has been submitted successfully! It will be reviewed and added to our prayer list.</div>';
  }

  const content = `
    <div class="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-8">
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-byne-blue mb-2">
                <i class="fas fa-praying-hands mr-3"></i>
                Submit Prayer Request
            </h1>
            <p class="text-gray-600">BYNE CHURCH - We're here to pray with you</p>
        </div>
        
        <div class="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded">
            <i class="fas fa-info-circle mr-2"></i>
            <strong>Welcome!</strong> You don't need to create an account to submit a prayer request. 
            Our church family is here to support you in prayer.
        </div>
        
        ${message}
        
        <form action="/api/prayer-requests/public" method="POST" class="space-y-6">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Prayer Request Title *</label>
                <input type="text" name="title" required 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue"
                       placeholder="Brief description (e.g., 'Health concerns', 'Job search')">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select name="category" required 
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue">
                    <option value="">Select a category...</option>
                    ${categories.map(cat => `
                        <option value="${cat.name}">${cat.name}</option>
                    `).join('')}
                </select>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Prayer Request Details *</label>
                <textarea name="content" rows="5" required 
                          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue"
                          placeholder="Share your prayer request. Please be as specific as you're comfortable with."></textarea>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                <input type="text" name="requester_name" required 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue"
                       placeholder="First name or 'Anonymous' if you prefer">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                <input type="email" name="requester_email" 
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue"
                       placeholder="For prayer updates or pastoral follow-up">
                <p class="text-xs text-gray-500 mt-1">Optional: We may use this to follow up with encouragement or prayer updates</p>
            </div>
            
            <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div class="flex items-start space-x-3">
                    <input type="checkbox" name="is_private" id="guest_is_private" 
                           class="mt-1 h-4 w-4 text-byne-blue focus:ring-byne-blue border-gray-300 rounded">
                    <div class="flex-1">
                        <label for="guest_is_private" class="block text-sm font-medium text-gray-700">
                            <i class="fas fa-lock mr-2 text-yellow-600"></i>Keep Private to Church Members Only
                        </label>
                        <p class="text-xs text-gray-600 mt-1">
                            If checked, only logged-in church members will see this request. 
                            Unchecked requests may appear on our public prayer display board.
                        </p>
                    </div>
                </div>
            </div>
            
            <button type="submit" 
                    class="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 text-lg font-semibold">
                <i class="fas fa-heart mr-2"></i>Submit Prayer Request
            </button>
        </form>
        
        <div class="mt-8 text-center">
            <div class="border-t pt-6">
                <p class="text-sm text-gray-500 mb-3">
                    Want to join our prayer community?
                </p>
                <div class="flex justify-center space-x-4">
                    <a href="/register" class="bg-byne-blue text-white px-4 py-2 rounded-md hover:bg-byne-dark-blue text-sm">
                        <i class="fas fa-user-plus mr-1"></i>Create Account
                    </a>
                    <a href="/login" class="text-byne-blue hover:text-byne-dark-blue text-sm">
                        <i class="fas fa-sign-in-alt mr-1"></i>Member Login
                    </a>
                </div>
            </div>
        </div>
    </div>
  `;

  return c.html(renderPage('Submit Prayer Request', content));
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
                        <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
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
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                        <input type="email" name="requester_email" 
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-byne-blue"
                               placeholder="For prayer updates or follow-up">
                        <p class="text-xs text-gray-500 mt-1">Optional: Provide email for prayer updates or pastoral follow-up</p>
                    </div>
                    
                    <div class="bg-gray-50 p-4 rounded-lg border">
                        <div class="flex items-start space-x-3">
                            <input type="checkbox" name="is_private" id="is_private" 
                                   class="mt-1 h-4 w-4 text-byne-blue focus:ring-byne-blue border-gray-300 rounded">
                            <div class="flex-1">
                                <label for="is_private" class="block text-sm font-medium text-gray-700">
                                    <i class="fas fa-lock mr-2 text-gray-500"></i>Private Prayer Request
                                </label>
                                <p class="text-xs text-gray-600 mt-1">
                                    If checked, this prayer will only be visible to logged-in church members. 
                                    Unchecked prayers appear on the public display board.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <button type="submit" 
                            class="w-full bg-byne-blue text-white py-2 px-4 rounded-md hover:bg-byne-dark-blue">
                        <i class="fas fa-paper-plane mr-2"></i>Submit Prayer Request
                    </button>
                </form>
                
                <div class="mt-4 p-3 bg-blue-50 rounded-lg border">
                    <p class="text-sm text-blue-700">
                        <i class="fas fa-info-circle mr-2"></i>
                        <strong>Note:</strong> Guests can also submit public prayer requests without logging in. 
                        <a href="/request-prayer" class="text-blue-800 underline font-semibold">Submit as guest</a>
                    </p>
                </div>
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
                ${prayerRequests.map((prayer, index) => {
                  const category = categories.find(c => c.name === prayer.category);
                  return `
                    <div class="bg-white rounded-lg shadow-md prayer-card border-l-4" style="border-left-color: ${category?.color || '#3B82F6'}">
                        <!-- Prayer Header (Always Visible) -->
                        <div class="p-4 cursor-pointer" onclick="toggleMainPrayerContent(${prayer.id})">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex items-center space-x-2">
                                    <span class="px-2 py-1 rounded-full text-xs font-semibold text-white" style="background-color: ${category?.color || '#3B82F6'}">
                                        <i class="${category?.icon || 'fas fa-praying-hands'} mr-1"></i>${prayer.category}
                                    </span>
                                    ${prayer.is_private ? `
                                        <span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                                            <i class="fas fa-lock mr-1"></i>Private
                                        </span>
                                    ` : ''}
                                </div>
                                ${user.is_admin ? `
                                    <form action="/api/prayer-requests/${prayer.id}" method="POST" class="inline" onsubmit="return confirm('Are you sure you want to delete this prayer request? This action cannot be undone.')" onclick="event.stopPropagation();">
                                        <input type="hidden" name="_method" value="DELETE">
                                        <button type="submit" class="text-red-500 hover:text-red-700 text-xs">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </form>
                                ` : ''}
                            </div>
                            
                            <h3 class="font-bold text-lg mb-2 text-gray-800">${prayer.title}</h3>
                            
                            <div class="flex justify-between items-center text-sm text-gray-500">
                                <span><i class="fas fa-user mr-1"></i>${prayer.requester_name}</span>
                                <div class="text-byne-blue font-semibold text-xs">
                                    <i class="fas fa-eye mr-1"></i>
                                    <span id="main-toggle-text-${prayer.id}">Click to view details</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Prayer Content & Actions (Hidden by Default) -->
                        <div id="main-prayer-content-${prayer.id}" class="hidden">
                            <div class="px-4 pb-3 border-t border-gray-100">
                                <p class="text-gray-700 leading-relaxed mb-3 mt-3">${prayer.content}</p>
                                
                                <div class="flex justify-between items-center text-sm text-gray-500 mb-3">
                                    <div class="text-left">
                                        <div><i class="fas fa-calendar mr-1"></i>Created: ${new Date(prayer.created_at).toLocaleDateString()}</div>
                                        ${user.is_admin && prayer.updated_at !== prayer.created_at ? `
                                            <div class="text-green-600 text-xs mt-1">
                                                <i class="fas fa-clock mr-1"></i>Updated: ${new Date(prayer.updated_at).toLocaleDateString()} ${new Date(prayer.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Update Form Section -->
                            <div class="border-t pt-3">
                                <button id="update-btn-${prayer.id}" 
                                        onclick="toggleUpdateForm(${prayer.id}); event.stopPropagation();"
                                        class="bg-byne-blue text-white px-3 py-1 rounded text-sm hover:bg-byne-dark-blue">
                                    <i class="fas fa-plus mr-1"></i>Suggest Update
                                </button>
                                
                                <div id="update-form-${prayer.id}" class="update-form mt-3">
                                    <textarea id="update-content-${prayer.id}" 
                                              placeholder="Share an update about this prayer request..."
                                              class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" rows="3"></textarea>
                                    <div class="flex justify-end mt-2 space-x-2">
                                        <button onclick="toggleUpdateForm(${prayer.id}); event.stopPropagation();"
                                                class="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500">Cancel</button>
                                        <button onclick="submitUpdate(${prayer.id}); event.stopPropagation();"
                                                class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Submit</button>
                                    </div>
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

// API: Registration endpoint
app.post('/api/register', async (c) => {
  try {
    const formData = await c.req.formData();
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirm_password') as string;
    const fullName = formData.get('full_name') as string;
    const email = formData.get('email') as string;

    // Validation
    if (!username || !password || !fullName) {
      return c.redirect('/register?error=missing');
    }

    if (password !== confirmPassword) {
      return c.redirect('/register?error=password_mismatch');
    }

    if (password.length < 6) {
      return c.redirect('/register?error=password_length');
    }

    const userService = new UserService(c.env.DB);
    
    // Check if username already exists
    const existingUser = await userService.getUserByUsername(username);
    if (existingUser) {
      return c.redirect('/register?error=username_taken');
    }

    // Create new user with member role
    const userData: CreateUserForm = {
      username,
      password,
      full_name: fullName,
      email: email || '',
      role: 'member' // Member role - can view prayers, create prayers, and suggest updates
    };

    await userService.createUser(userData);
    
    return c.redirect('/register?success=1');
  } catch (error) {
    console.error('Registration error:', error);
    return c.redirect('/register?error=server');
  }
});

// API: Forgot Password endpoint
app.post('/api/forgot-password', async (c) => {
  try {
    const formData = await c.req.formData();
    const email = formData.get('email') as string;

    if (!email) {
      return c.redirect('/forgot-password?error=missing');
    }

    const userService = new UserService(c.env.DB);
    const token = await userService.createPasswordResetToken(email);
    
    if (token) {
      // In a real application, you would send an email here
      // For demo purposes, we'll redirect with a success message and show the reset link
      console.log(`Password reset token for ${email}: ${token}`);
      console.log(`Reset link: ${new URL(c.req.url).origin}/reset-password?token=${token}`);
      
      // For demo - you could also log this to a visible place for testing
      return c.redirect(`/forgot-password?success=1&demo_token=${token}`);
    } else {
      return c.redirect('/forgot-password?error=email_not_found');
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    return c.redirect('/forgot-password?error=server');
  }
});

// API: Reset Password endpoint
app.post('/api/reset-password', async (c) => {
  try {
    const formData = await c.req.formData();
    const token = formData.get('token') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirm_password') as string;

    if (!token || !password || !confirmPassword) {
      return c.redirect(`/reset-password?token=${token}&error=missing`);
    }

    if (password !== confirmPassword) {
      return c.redirect(`/reset-password?token=${token}&error=password_mismatch`);
    }

    if (password.length < 6) {
      return c.redirect(`/reset-password?token=${token}&error=password_length`);
    }

    const userService = new UserService(c.env.DB);
    const success = await userService.resetPasswordWithToken(token, password);
    
    if (success) {
      return c.redirect('/reset-password?success=1');
    } else {
      return c.redirect(`/reset-password?token=${token}&error=invalid_token`);
    }
  } catch (error) {
    console.error('Reset password error:', error);
    return c.redirect(`/reset-password?error=server`);
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
    requester_email: formData.get('requester_email') as string || undefined,
    category: formData.get('category') as string,
    is_private: formData.get('is_private') === 'on', // Checkbox value
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
            name,content,requester_name,category
          </code>
          <p class="text-blue-700 mt-2 text-sm">
            Available categories: ${categories.map(c => c.name).join(', ')}
          </p>
        </div>

        <div class="mb-6 p-4 bg-yellow-50 rounded-lg">
          <h3 class="font-bold text-yellow-800 mb-2">Example CSV Content:</h3>
          <pre class="bg-yellow-100 p-2 rounded text-sm overflow-x-auto">
name,content,requester_name,category
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
  const csvHeaders = ['Name', 'Content', 'Requested By', 'Category', 'Status', 'Created Date', 'Recent Updates'];
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

// Embed display page (no authentication required)
app.get('/display', async (c) => {
  const prayerService = new PrayerService(c.env.DB);
  
  const selectedCategory = c.req.query('category') || 'all';
  const prayerRequests = await prayerService.getPublicPrayerRequests(selectedCategory === 'all' ? undefined : selectedCategory);
  const categories = await prayerService.getAllCategories();
  const categoryStats = await prayerService.getPrayerCountsByCategory();

  const content = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BYNE CHURCH Prayer Requests - Display</title>
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
          
          /* Line clamping for titles */
          .line-clamp-2 {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          
          /* Smooth transitions */
          .transition-all {
            transition: all 0.3s ease;
          }
        </style>
        <script>
          // Auto-refresh every 5 minutes
          setTimeout(() => {
            window.location.reload();
          }, 300000);
          
          // Optional category filtering via URL parameters
          function filterByCategory(category) {
            const url = new URL(window.location);
            if (category === 'all') {
              url.searchParams.delete('category');
            } else {
              url.searchParams.set('category', category);
            }
            window.location = url;
          }
          
          // Toggle prayer content visibility
          function togglePrayerContent(index) {
            const content = document.getElementById('prayer-content-' + index);
            const toggleText = document.getElementById('toggle-text-' + index);
            
            if (content && toggleText) {
              if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                toggleText.innerHTML = '<i class="fas fa-eye-slash mr-1"></i>Click to hide';
              } else {
                content.classList.add('hidden');
                toggleText.innerHTML = '<i class="fas fa-eye mr-1"></i>Click to view';
              }
            }
          }
        </script>
    </head>
    <body class="bg-gray-50 p-4 font-sans">
        <div class="max-w-7xl mx-auto">
            <!-- Header with Church Branding -->
            <div class="text-center mb-8">
                <h1 class="text-4xl font-bold text-byne-blue mb-2">
                    <i class="fas fa-church mr-3"></i>
                    BYNE CHURCH
                </h1>
                <h2 class="text-2xl text-gray-700 mb-4">Prayer Requests</h2>
                <div class="text-sm text-gray-500">
                    Updated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
            </div>

            <!-- Top Actions Bar -->
            <div class="mb-6 bg-white rounded-lg shadow-md p-4">
                <!-- Category Filters -->
                <div class="flex flex-wrap gap-2 justify-center mb-4">
                    <button onclick="filterByCategory('all')" 
                            class="px-3 py-1 rounded-full text-sm transition-all ${selectedCategory === 'all' ? 'bg-byne-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">
                        <i class="fas fa-th-large mr-1"></i>All Categories
                    </button>
                    ${categories.map(cat => {
                      const count = categoryStats.find(s => s.category === cat.name)?.count || 0;
                      return `
                        <button onclick="filterByCategory('${cat.name}')" 
                                class="px-3 py-1 rounded-full text-sm transition-all ${selectedCategory === cat.name ? 'text-white' : 'text-gray-700 hover:bg-gray-200'}"
                                style="background-color: ${selectedCategory === cat.name ? cat.color : '#f3f4f6'}">
                            <i class="${cat.icon} mr-1"></i>${cat.name} (${count})
                        </button>
                      `;
                    }).join('')}
                </div>
                
                <!-- User Access Button -->
                <div class="text-center border-t pt-4">
                    <a href="/register" target="_blank" 
                       class="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-all text-sm font-semibold shadow-md">
                        <i class="fas fa-user-plus mr-2"></i>Request User Access
                    </a>
                    <p class="text-xs text-gray-500 mt-2">Create an account to submit prayers and updates</p>
                </div>
            </div>
            
            <!-- Prayer Requests Display -->
            <div>
                <div class="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    ${prayerRequests.map((prayer, index) => {
                      const category = categories.find(c => c.name === prayer.category);
                      return `
                        <!-- Prayer Card (Click to reveal content) -->
                        <div class="bg-white rounded-lg shadow-md prayer-card border-l-4 h-fit" 
                             style="border-left-color: ${category?.color || '#3B82F6'}">
                            
                            <!-- Card Header (Always Visible) -->
                            <div class="p-4 cursor-pointer" onclick="togglePrayerContent(${index})">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="px-2 py-1 rounded-full text-xs font-semibold text-white inline-flex items-center" 
                                          style="background-color: ${category?.color || '#3B82F6'}">
                                        <i class="${category?.icon || 'fas fa-praying-hands'} mr-1 text-xs"></i>${prayer.category}
                                    </span>
                                    <div class="text-xs text-gray-500">
                                        ${new Date(prayer.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                
                                <!-- Prayer Title (Always Visible) -->
                                <h3 class="font-bold text-lg mb-2 text-gray-800">${prayer.title}</h3>
                                
                                <!-- Requester Info (Always Visible) -->
                                <div class="flex items-center justify-between text-xs text-gray-500">
                                    <div class="flex items-center">
                                        <i class="fas fa-user mr-1 text-byne-blue"></i>
                                        <span class="font-medium">${prayer.requester_name}</span>
                                    </div>
                                    <div class="text-byne-blue font-semibold">
                                        <i class="fas fa-eye mr-1"></i>
                                        <span id="toggle-text-${index}">Click to view</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Prayer Content (Hidden by Default) -->
                            <div id="prayer-content-${index}" class="hidden">
                                <div class="px-4 pb-4 border-t border-gray-100 pt-3">
                                    <p class="text-gray-700 leading-relaxed mb-3">${prayer.content}</p>
                                    
                                    ${prayer.updated_at !== prayer.created_at ? `
                                        <div class="text-xs text-green-600 flex items-center">
                                            <i class="fas fa-clock mr-1"></i>
                                            Updated: ${new Date(prayer.updated_at).toLocaleDateString()}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                                
                                ${prayer.updated_at !== prayer.created_at ? `
                                    <div class="mt-2 text-xs text-green-600 flex items-center">
                                        <i class="fas fa-clock mr-1"></i>
                                        Updated: ${new Date(prayer.updated_at).toLocaleDateString()}
                                    </div>
                                ` : ''}
                            </div>
                            
                            <!-- Expandable Full Content -->
                            <div id="card-${index}" class="hidden">
                                <div class="px-4 pb-4 border-t bg-gray-50">
                                    <div class="pt-3">
                                        <h4 class="font-semibold text-sm text-gray-700 mb-2">Full Prayer Request:</h4>
                                        <p class="text-gray-700 text-sm leading-relaxed">${prayer.content}</p>
                                        
                                        <div class="mt-3 pt-3 border-t text-center">
                                            <button onclick="event.stopPropagation(); toggleCard('card-${index}')" 
                                                    class="text-xs text-gray-500 hover:text-gray-700">
                                                <i class="fas fa-compress-alt mr-1"></i>Click to collapse
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                      `;
                    }).join('')}
                </div>
                
                ${prayerRequests.length === 0 ? `
                    <div class="text-center py-12">
                        <i class="fas fa-praying-hands text-6xl text-gray-300 mb-4"></i>
                        <h3 class="text-xl text-gray-500 mb-2">No Prayer Requests</h3>
                        <p class="text-gray-400">
                            ${selectedCategory === 'all' ? 'There are currently no prayer requests.' : `No prayer requests in the "${selectedCategory}" category.`}
                        </p>
                    </div>
                ` : ''}
                
                <!-- Footer -->
                <div class="text-center mt-12 py-8 border-t border-gray-200">
                    <div class="text-gray-500 mb-2">
                        <i class="fas fa-heart mr-2 text-red-500"></i>
                        Praying together as one body in Christ
                    </div>
                    <div class="text-sm text-gray-400">
                        BYNE CHURCH Prayer Ministry
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Scripture Footer -->
        <div class="fixed bottom-0 left-0 right-0 bg-byne-blue text-white text-center py-2 text-sm">
            <i class="fas fa-quote-left mr-2"></i>
            "Therefore confess your sins to each other and pray for each other so that you may be healed. The prayer of a righteous person is powerful and effective." - James 5:16
        </div>
    </body>
    </html>
  `;

  return c.html(content);
});

// Public prayer request page (no authentication required)
app.get('/request-prayer', async (c) => {
  const prayerService = new PrayerService(c.env.DB);
  const categories = await prayerService.getAllCategories();

  const content = `
    <div class="max-w-2xl mx-auto">
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6 text-center">
          <i class="fas fa-praying-hands mr-2 text-blue-600"></i>
          Submit a Prayer Request
        </h2>
        
        <div class="mb-6 p-4 bg-blue-50 rounded-lg">
          <p class="text-blue-700 text-sm">
            <i class="fas fa-info-circle mr-2"></i>
            You can submit a prayer request as a guest. To submit private prayers or updates, please 
            <a href="/register" class="text-blue-800 underline">create an account</a>.
          </p>
        </div>

        <form action="/api/prayer-requests/public" method="POST" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Prayer Request Title *</label>
            <input type="text" name="title" required 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   placeholder="Brief title for your prayer request">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Your Name *</label>
            <input type="text" name="requester_name" required 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   placeholder="How would you like to be identified?">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Your Email (Optional)</label>
            <input type="email" name="requester_email" 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   placeholder="For prayer updates (optional)">
            <p class="text-xs text-gray-500 mt-1">We'll only use this to send prayer updates if requested</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Category *</label>
            <select name="category" required 
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select a category...</option>
              ${categories.map(cat => `
                <option value="${cat.name}">${cat.name}</option>
              `).join('')}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Prayer Request Details *</label>
            <textarea name="content" required rows="4" 
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Please share the details of your prayer request..."></textarea>
          </div>

          <div class="bg-yellow-50 p-4 rounded-lg">
            <div class="flex items-start">
              <i class="fas fa-exclamation-triangle text-yellow-600 mt-1 mr-2"></i>
              <div class="text-yellow-700 text-sm">
                <p class="font-semibold mb-1">Public Prayer Request</p>
                <p>This prayer request will be visible to all visitors. To submit private prayers visible only to registered members, please <a href="/register" class="underline">create an account</a>.</p>
              </div>
            </div>
          </div>

          <div class="flex justify-between pt-4">
            <a href="/" class="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600">
              <i class="fas fa-arrow-left mr-2"></i>Back to Prayers
            </a>
            <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
              <i class="fas fa-paper-plane mr-2"></i>Submit Prayer Request
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  return c.html(renderPage('Submit Prayer Request', content));
});

// API: Create public prayer request (no authentication required)
app.post('/api/prayer-requests/public', async (c) => {
  const formData = await c.req.formData();
  
  const prayerData: PrayerRequestForm = {
    title: formData.get('title') as string,
    content: formData.get('content') as string,
    requester_name: formData.get('requester_name') as string,
    requester_email: formData.get('requester_email') as string || undefined,
    category: formData.get('category') as string,
    is_private: false, // Public prayers are always public
  };

  const prayerService = new PrayerService(c.env.DB);
  // Call the guest version (without userId)
  await prayerService.createPrayerRequest(prayerData);
  
  return c.redirect('/?submitted=public');
});

// User management page (Super Admin only)
app.get('/manage-users', requireAuth, requireSuperAdmin, async (c) => {
  const user = c.get('user');
  const userService = new UserService(c.env.DB);
  
  const allUsers = await userService.getAllUsers();

  const content = `
    <div class="max-w-6xl mx-auto">
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold mb-6">
          <i class="fas fa-users-cog mr-2 text-purple-600"></i>
          User Management (Super Admin)
        </h2>
        
        <div class="mb-6 p-4 bg-purple-50 rounded-lg">
          <p class="text-purple-700 text-sm">
            <i class="fas fa-shield-alt mr-2"></i>
            As a super admin, you can change user roles. Available roles: member, moderator, admin, super_admin
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-gray-50">
                <th class="text-left p-3 border-b font-semibold">User</th>
                <th class="text-left p-3 border-b font-semibold">Email</th>
                <th class="text-left p-3 border-b font-semibold">Current Role</th>
                <th class="text-left p-3 border-b font-semibold">Joined</th>
                <th class="text-left p-3 border-b font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${allUsers.map(u => `
                <tr class="border-b hover:bg-gray-50">
                  <td class="p-3">
                    <div class="flex items-center">
                      <i class="fas fa-user-circle text-gray-400 mr-2"></i>
                      <div>
                        <div class="font-medium">${u.full_name || u.username}</div>
                        <div class="text-sm text-gray-500">@${u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td class="p-3 text-sm text-gray-600">${u.email || 'No email'}</td>
                  <td class="p-3">
                    <span class="px-2 py-1 rounded text-xs font-semibold ${
                      u.role === 'super_admin' ? 'bg-red-100 text-red-800' :
                      u.role === 'admin' ? 'bg-yellow-100 text-yellow-800' :
                      u.role === 'moderator' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }">
                      ${u.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td class="p-3 text-sm text-gray-600">
                    ${new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td class="p-3">
                    ${u.id !== user.id ? `
                      <form action="/api/users/${u.id}/role" method="POST" class="inline">
                        <select name="new_role" class="text-sm border rounded px-2 py-1 mr-2" 
                                onchange="this.form.submit()">
                          <option value="member" ${u.role === 'member' ? 'selected' : ''}>Member</option>
                          <option value="moderator" ${u.role === 'moderator' ? 'selected' : ''}>Moderator</option>
                          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                          <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                        </select>
                      </form>
                    ` : `
                      <span class="text-xs text-gray-500 italic">Your account</span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="mt-6 pt-6 border-t">
          <div class="flex justify-between">
            <a href="/admin" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
              <i class="fas fa-arrow-left mr-2"></i>Back to Admin
            </a>
            <div class="text-sm text-gray-500">
              Total users: ${allUsers.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return c.html(renderPage('User Management', content, user));
});

// API: Update user role (Super Admin only)
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
    console.error('Update user role error:', error);
    return c.redirect('/manage-users?error=update_failed');
  }
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
    const requiredHeaders = ['content', 'requester_name', 'category'];
    
    // Check for either 'name' or 'title' column (backward compatibility)
    const titleColumnIndex = headers.indexOf('name') !== -1 ? headers.indexOf('name') : headers.indexOf('title');
    
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0 || titleColumnIndex === -1) {
      const missing = titleColumnIndex === -1 ? [...missingHeaders, 'name_or_title'] : missingHeaders;
      return c.redirect(`/admin/import?error=missing_headers&headers=${missing.join(',')}`);
    }

    const prayers: PrayerRequestForm[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      
      if (values.length >= headers.length) {
        const prayer: PrayerRequestForm = {
          title: values[titleColumnIndex] || '',
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