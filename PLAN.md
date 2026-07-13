# План разработки Translation Tool

Спека: [`docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md`](docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md)

## Сделано (фаза A — MVP)

- [x] Снос старого драфта, Vue 3 + Vite + TS с нуля
- [x] DOCX → сегменты (абзацы, таблицы, колонтитулы) → редактор → экспорт DOCX с сохранением разметки
- [x] IndexedDB + копия проекта `.tcat.zip`
- [x] Автосейв (~3 с), статусы «есть/нет перевода» + «сохранено»
- [x] i18n ru/en, тёмная тема по умолчанию + переключатель
- [x] Desktop-first UI, выровненные панели оригинал/перевод
- [x] Unit-тесты round-trip / теги

## Дальше

### Сейчас / ближайшее (полировка A)

- [ ] Ручной чеклист в Word на реальных файлах
- [x] Статический деплой (мини-ПК / любой хостинг) — Docker + CI, см. `docker-compose.prod.yml`, `deploy/CURSOR_MINI_PC.txt`
  - стек **appzac**, контейнер `appzac-prod-web`, NPM → `http://appzac-prod-web:80` (домен: appzac.ru)
  - nginx: `add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;` (в `deploy/nginx.conf`)
- [ ] Мелкий UX по результатам тестов

### Фаза B: Translation Memory

- [ ] Импорт / экспорт TMX
- [ ] Exact + fuzzy match в редакторе
- [ ] Запись подтверждённых сегментов в TM

### Фаза C: Глоссарий

- [ ] Простой termbase
- [ ] Подсветка терминов в source

### Фаза D: Облако (платное)

- [ ] Auth + синк проектов на мини-ПК
- [ ] Free = только локально / Paid = облако
