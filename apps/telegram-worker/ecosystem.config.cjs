module.exports = {
  apps: [
    {
      name: 'tajertrack-telegram-worker',
      script: './dist/main.js',
      cwd: __dirname,
      instances: 1, // Strictly single instance for MTProto sender account safety
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

