// PM2 Configuration for Prayer App Development
module.exports = {
  apps: [
    {
      name: 'prayer-app',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=prayer-app-production --local --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false, // Disable PM2 file monitoring (wrangler has its own)
      instances: 1, // Development mode uses only one instance
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G'
    }
  ]
};