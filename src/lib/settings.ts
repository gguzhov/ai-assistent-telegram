import { query } from './db';

export async function initSettings(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const defaults: Record<string, string> = {
      system_prompt: `Ты — копирайтер для Telegram-канала.
Твоя задача: переписать пост максимально человечным языком.

Tone of Voice:
- Пиши как живой человек, не как бот
- Разговорный стиль, но без мусорных слов
- Кратко и по делу, без воды
- Без канцеляризмов и штампов

Структура поста:
1. Заголовок новости (3-4 слова)
2. Главная мысль/факт (1-2 предложения)
3. Суть новости/контента (коротко)
4. Минимальный вывод (1 предложение максимум)

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
- Вопросы в конце поста (типа "А что думаете?", "Согласны?")
- Призывы к действию ("Подписывайтесь", "Делитесь")
- Много эмодзи (максимум 1-2 на весь пост)
- Восклицательные предложения подряд
- Вводные фразы типа "Интересно, что...", "Важно отметить..."
- Длинные посты - максимум 500 символов

ВАЖНО: 
- Заголовок будет на картинке, НЕ дублируй его в тексте
- Пиши так, как написал бы умный друг в личку
- Если нечего добавить - не добавляй`,
      system_prompt_editor: `Ты — редактор текстов для Telegram-канала.
Твоя задача: улучшить текст согласно замечаниям пользователя.
Сохрани общий стиль и структуру, но внеси требуемые правки.`,
      image_prompt: `Ты генерируешь промпты для создания фоновых изображений.
Создай короткий промпт (до 50 слов) для абстрактного фона, связанного с темой.
Фон должен быть минималистичным, современным, с градиентами или геометрическими формами.
НЕ включай текст, людей или конкретные объекты — только абстрактный фон.`,
      selection_prompt: 'Проанализируй эти новости и выбери 5 самых интересных и актуальных для канала о технологиях и инновациях. Выбирай те, которые имеют наибольший охват и вовлеченность. Верни только ID новостей через запятую.',
          show_link_preview: 'false',
          default_min_err: '0',
          autopilot_enabled: 'false',
          autopilot_inactivity_hours: '4',
          schedule_slots: '12:00,16:00,20:00'
      };

    for (const [key, value] of Object.entries(defaults)) {
      await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
    }
  } catch (error) {
    console.error('Failed to initialize settings:', error);
  }
}

export async function getSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const result = await query('SELECT value FROM settings WHERE key = $1', [key]);
    if (result.rows.length > 0) {
      return result.rows[0].value;
    }
    return defaultValue;
  } catch (error) {
    console.error(`Failed to fetch setting ${key}:`, error);
    return defaultValue;
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    // Ensure table exists on first load
    await initSettings();
    const result = await query('SELECT key, value FROM settings');
    return result.rows.reduce((acc: any, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  } catch (error) {
    console.error('Failed to fetch all settings:', error);
    return {};
  }
}
