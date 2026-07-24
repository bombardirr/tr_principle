# Translation Tool (appzac)

Лёгкий веб-CAT для фрилансеров и малого бизнеса: перевод DOCX в браузере с сохранением разметки, облачный аккаунт, общие работы и живые TM/глоссарии.

## Статус

**Cloud MVP tagged:** [`v1.0.0`](https://github.com/bombardirr/tr_principle/releases/tag/v1.0.0) (2026-07-24).

Работает:

1. Auth-first лендинг → проекты / общие работы → редактор
2. DOCX import → sentence-сегменты → стили → экспорт с сохранением разметки
3. Локальный IndexedDB + `.tcat.zip`; cloud lock/backup
4. Именованные **TM** и **глоссарии** + attach на job (R/W/E/C) + sync
5. Shared work: invites, прогресс, шаринг оригинала DOCX

Актуальный план: [`PLAN.md`](PLAN.md)  
Корневая спека фазы A: [`docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md`](docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md)

## Запуск

```bash
npm install
npm run dev          # SPA http://localhost:5173
```

API (локально): см. `api/` и `docker-compose.local.yml` / `.env.local.example`.

```bash
npm test
npm run build
```

## Стек

- **Клиент:** Vue 3 + TypeScript + Vite + vue-i18n + IndexedDB (`idb`) + JSZip
- **Сервер:** Go (chi) + Postgres; JWT; SPA может отдаваться из того же бинаря в prod

## Дальше

См. блок **«Осталось до tag MVP»** в [`PLAN.md`](PLAN.md).
