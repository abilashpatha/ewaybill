module.exports = {
  apps: [
    {
      name: 'ewaybill',
      script: 'src/index.js',
      cwd: '/var/www/ewaybill/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
