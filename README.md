# Translation Tool

Лёгкий веб-CAT для фрилансеров и малого бизнеса: перевод DOCX в браузере с сохранением разметки.

## Статус (фаза A — MVP)

Работает локально в браузере:

1. Открыть DOCX → сегменты по абзацам (тело, таблицы, колонтитулы)
2. Перевод в двухпанельном редакторе (маркеры форматирования `{1}…{2}`)
3. Автосохранение в IndexedDB + скачивание файла проекта `.tcat.zip`
4. Экспорт DOCX с прежней структурой/форматированием

Спека: [`docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md`](docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md)  
План: [`PLAN.md`](PLAN.md)

## Запуск

```bash
npm install
npm run dev
```

Откройте http://localhost:5173

```bash
npm test      # unit-тесты DOCX/маркеров
npm run build # production-сборка в dist/
```

## Стек

Vue 3 + TypeScript + Vite + vue-i18n + JSZip + IndexedDB (`idb`). Всё на клиенте, без сервера.

## Дальше

- **B:** TM / TMX  
- **C:** Глоссарий  
- **D:** Платное облако на мини-ПК  
