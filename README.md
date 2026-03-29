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

## Работа с PDF

Проект умеет конвертировать Markdown в PDF и автоматически рендерить `mermaid`-блоки как `SVG` внутри итогового документа.

### Один файл

```bash
npm run md:pdf -- --input ./student-project/README.md
```

С указанием выходного файла:

```bash
npm run md:pdf -- \
  --input ./student-project/courses/16582-it-recruitment/lab-4-profstandard-mindmaps.md \
  --output ./tmp/lab-4-profstandard-mindmaps.pdf
```

### Вся папка

```bash
npm run md:pdf -- --dir ./student-project --out-dir ./pdfs
```

Команда:

- рекурсивно находит все `.md` внутри папки;
- создает `.pdf` с той же вложенной структурой;
- добавляет подпись внизу документа;
- рендерит `mermaid`-диаграммы прямо в PDF.

### Полезные параметры

```bash
npm run md:pdf -- --dir ./student-project --out-dir ./pdfs --format A4
npm run md:pdf -- --dir ./student-project --out-dir ./pdfs --signature "Выполнил: Нахатакян Артур"
npm run md:pdf -- --dir ./student-project --out-dir ./pdfs --mermaid-theme neutral
```

### Отдельный рендер Mermaid

Если нужно получить сами диаграммы отдельно в `SVG` или `PNG`, можно использовать пакетный рендер:

```bash
npm run mermaid:render -- --dir ./student-project --out-dir ./diagrams
```

По умолчанию он сохраняет `SVG` и повторяет структуру исходных Markdown-файлов.

## Работа с PPTX

Проект поддерживает генерацию презентаций в `PowerPoint (.pptx)` из Markdown.

### Один файл

```bash
npm run md:pptx -- --input ./student-project/courses/31896-research-project/slides/01-task-1-4-itmo.md
```

С указанием выходного файла:

```bash
npm run md:pptx -- \
  --input ./student-project/courses/31896-research-project/slides/01-task-1-4-itmo.md \
  --output ./presentations/itmo.pptx
```

### Вся папка со слайдами

```bash
npm run md:pptx -- \
  --dir ./student-project/courses/31896-research-project/slides \
  --out-dir ./presentations/31896-research-project
```

Команда:

- рекурсивно ищет `.md`;
- по умолчанию конвертирует только slide-файлы (frontmatter `marp: true` или с разделителями `---`);
- создает `.pptx` с той же вложенной структурой;
- добавляет подпись внизу каждого слайда.

### Полезные параметры

```bash
npm run md:pptx -- --dir ./slides --out-dir ./presentations --signature "Выполнил: Нахатакян Артур"
npm run md:pptx -- --dir ./student-project --out-dir ./presentations --all-md
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
