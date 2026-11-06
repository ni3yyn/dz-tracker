module.exports = {
  apps: [
    {
      name: 'tajertrack-push-worker',
      script: './dist/main.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

