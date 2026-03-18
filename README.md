# Telegram Automation System

## Описание
Система автоматизации Telegram-канала с Mini App для модерации контента в стиле Tinder.

## Требования
- Node.js 18+
- PostgreSQL 14+
- npm или yarn

## Установка

```bash
# Установка зависимостей
npm install

# Настройка переменных окружения
cp .env.example .env
# Заполните .env файл

# Миграция базы данных
npm run db:migrate
```

## Запуск

```bash
# Режим разработки
npm run dev

# Production сборка
npm run build
npm start

# Запуск бота (отдельный процесс)
npm run bot:start

# Запуск парсера (отдельный процесс)
npm run parser:run

# Запуск планировщика
npm run scheduler:start
```

## Переменные окружения

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/telegram_automation

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHANNEL_ID=@your_channel

# OpenRouter API
OPENROUTER_API_KEY=your_openrouter_key

# Admin Access (Telegram User IDs, comma-separated)
ADMIN_TELEGRAM_IDS=123456789,987654321

# App URL (для Mini App)
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Auto-publish settings
MORNING_WINDOW_START=09:00
MORNING_WINDOW_END=12:00
AUTO_PUBLISH_DELAY_HOURS=3
```

## Структура проекта

```
src/
├── app/                  # Next.js App Router
│   ├── api/             # API routes
│   ├── queue/           # Очередь постов (Tinder UI)
│   ├── plan/            # Контент-план
│   └── sources/         # Управление источниками
├── bot/                  # Telegram Bot
├── parser/              # HTML парсер t.me/s/
├── ai/                   # AI модуль (OpenRouter)
├── image/               # Генерация обложек
├── scheduler/           # Планировщик публикаций
├── lib/                 # Утилиты
└── components/          # React компоненты
```

## API Endpoints

### Посты
- `GET /api/posts/queue` - Получить очередь на модерацию
- `POST /api/posts/:id/approve` - Одобрить пост
- `POST /api/posts/:id/reject` - Отклонить пост
- `POST /api/posts/:id/regenerate` - Перегенерировать контент

### Источники
- `GET /api/sources` - Список источников
- `POST /api/sources` - Добавить источник
- `DELETE /api/sources/:id` - Удалить источник

### Контент-план
- `GET /api/plan` - Получить план публикаций
- `PATCH /api/plan/:id` - Изменить дату публикации
- `DELETE /api/plan/:id` - Удалить из плана

## Деплой на VPS

```bash
# На сервере Ubuntu 22.04

# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка PostgreSQL
sudo apt install postgresql postgresql-contrib

# Клонирование проекта
git clone <repo> /var/www/telegram-automation
cd /var/www/telegram-automation

# Установка зависимостей
npm install --production

# Настройка PM2
npm install -g pm2
pm2 start ecosystem.config.js

# Настройка Nginx + SSL
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```
