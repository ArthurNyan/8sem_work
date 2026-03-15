# Moodle Exporter

Локальный экспортёр материалов из Moodle для курсов РГПУ им. А. И. Герцена. Он использует твою уже авторизованную сессию браузера и сохраняет курсы в удобную структуру для дальнейшей автоматизации: разбор заданий, генерация решений, сборка репозитория.

## Что умеет

- заходит в курс по `course id`
- сохраняет HTML и Markdown-снимок страницы курса
- проходит по секциям и активностям
- сохраняет отдельные страницы заданий
- пытается скачать прикрепленные файлы
- формирует `index.json` и `course.json` для дальнейшей машинной обработки

## Быстрый старт

### 1. Установить зависимости

```bash
npm install
npx playwright install chromium
```

### 2. Сохранить авторизованную сессию

Команда откроет браузер. Нужно войти в Moodle, убедиться, что курсы открываются, вернуться в терминал и нажать `Enter`.

```bash
npm run auth
```

Файл сессии будет сохранен в:

`/Users/arthur/Documents/Playground/playwright/.auth/herzen.json`

### 3. Выгрузить курсы

```bash
npm run export -- \
  --course=6086 \
  --course=6087 \
  --course=31896 \
  --course=16583 \
  --course=16582 \
  --course=36120 \
  --course=31154
```

### 4. Результат

Экспорт появится в:

`/Users/arthur/Documents/Playground/exports`

Пример структуры:

```text
exports/
  index.json
  6086-course-name/
    course.html
    course.md
    course.json
    files/
    activities/
      01-assignment-name/
        page.html
        page.md
        metadata.json
        files/
```

## Полезные опции

```bash
npm run export -- --course=6086 --no-downloads
npm run export -- --course=6086 --headed
npm run export -- --course=6086 --output ./tmp/export
npm run export -- --course=6086 --storage ./playwright/.auth/herzen.json
```

## Ограничения

- если Moodle запросит логин снова, нужно пересоздать storage state через `npm run auth`
- некоторые ресурсы Moodle открываются через промежуточные страницы, поэтому часть файлов может не скачаться с первого прохода
- если внутри курса есть контент, который подгружается динамически после кликов, экспортёр может его не увидеть без отдельной доработки

## Что дальше

После выгрузки материалов следующий шаг такой:

1. Я читаю `exports/index.json` и все `course.json`
2. Строю карту предметов, тем, заданий и дедлайнов
3. Создаю структуру GitHub-репозитория
4. Начинаю выполнять задания по очереди и складывать результаты в единый проект
