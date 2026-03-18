const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

module.exports = {
  apps: [
    {
      name: 'tg-automation-web',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/telegram-automation',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        ...process.env
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'tg-automation-bot',
      script: 'tsx',
      args: 'src/bot/index.ts',
      cwd: '/var/www/telegram-automation',
      env: {
        NODE_ENV: 'production',
        ...process.env
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000
    },
    {
      name: 'tg-automation-scheduler',
      script: 'tsx',
      args: 'src/scheduler/index.ts',
      cwd: '/var/www/telegram-automation',
      env: {
        NODE_ENV: 'production',
        ...process.env
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000
    }
  ]
}
