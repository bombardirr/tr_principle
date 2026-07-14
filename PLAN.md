# План разработки Translation Tool (appzac)

Спека: [`docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md`](docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md)

## Сделано (фаза A — локальный MVP без аккаунта)

- [x] Снос старого драфта, Vue 3 + Vite + TS с нуля
- [x] DOCX → сегменты (абзацы, таблицы, колонтитулы) → редактор → экспорт DOCX с сохранением разметки
- [x] IndexedDB + копия проекта `.tcat.zip`
- [x] Автосейв (~3 с), статусы «есть/нет перевода» + «сохранено»
- [x] i18n ru/en, тёмная тема по умолчанию + переключатель
- [x] Desktop-first UI, выровненные панели оригинал/перевод
- [x] Unit-тесты round-trip / теги
- [x] Предпросмотр DOCX (`docx-preview`), связка превью ↔ редактор (клик, ховер, скролл)
- [x] Lease одной вкладки на проект (localStorage + `BroadcastChannel`) — fallback до серверного lock
- [x] Локальная TM (IndexedDB) + TMX + exact/fuzzy/fragment + soft punctuation

## Граница MVP (целевая)

В MVP входят: **sentence-сегменты + CAT-like TM UX**, **DOCX round-trip**, **аккаунт**, **облачная TM**, **бэкап**, Telegram-сброс пароля; атрибуция TU + просмотр контекста в пикере.

Не в MVP (после): другие форматы (XLIFF…), MT, multi-TM, SRX, полный sync проектов, глоссарий TBX, админка ТМ, полный audit timeline.

---

## Дальше

### Полировка A (не блокирует auth)

- [ ] Ручной чеклист в Word на реальных файлах
- [x] Статический деплой SPA
- [x] Мелкий UX по тестам

---

### Фаза B: локальная TM — сделано

- [x] IndexedDB `appzac-tm`, автосейв done-сегментов
- [x] Exact + fuzzy (85%) + fragment + soft punct
- [x] TMX import/export, UI-кнопка ТМ

**B2 p2 — после auth + облачной TM** (перед стартом — словарь ниже)

- [ ] Настраиваемый порог fuzzy
- [ ] Context match (101%)
- [ ] Штраф за теги
- [ ] Match metadata в UI
- [ ] Segment edit audit
- [ ] Concordance panel

**Обмен форматами (после MVP)**

- [ ] XLIFF 1.2; backlog XLIFF 2.0 / SDLXLIFF

#### Словарь: B2 (перед реализацией этих пунктов)

| Термин | Что это |
|--------|---------|
| **Context match (101%)** | Source совпал **и** совпал соседний сегмент (prev/next). Реже ошибочная подстановка одной и той же фразы в разном контексте. |
| **Штраф за теги** | Разные `{1}…{2}` у TM и сегмента → понижаем % fuzzy. |
| **Concordance** | Поиск по памяти по подстроке, без автоподстановки. |
| **Audit** | История правок сегмента (ручной / ТМ / сброс). |

#### Словарь: отложено после MVP (расшифровка)

| Термин | Что это | Зачем / когда |
|--------|---------|----------------|
| **Облачная TM** | Память переводов на сервере у аккаунта; браузер кэширует локально и синкает. | **В MVP** — одна TM на пользователя на всех устройствах. |
| **MT** | Machine Translation — подсказка из движка (DeepL/Google/…), не из вашей памяти. | После MVP; отдельный ключ API, квоты, UI «вставить из MT». |
| **multi-TM** | Несколько памятей сразу (проектная + общая + клиентская) с приоритетом и штрафами. | После MVP; в MVP достаточно **одной** облачной TM на user. |
| **SRX** | Правила, *где* резать текст на сегменты (не «после каждой точки» вслепую). | После MVP / enterprise; сейчас режем по абзацам Word. |

---

### Фаза C: Глоссарий (после MVP-auth)

- [ ] Локальный termbase + подсветка в source
- [ ] Backlog: TBX

---

### Перед D-lite: модель сегментов / ТМ как у CAT ← **сейчас**

Спека: [`docs/superpowers/specs/2026-07-14-sentence-tm-ux-design.md`](docs/superpowers/specs/2026-07-14-sentence-tm-ux-design.md)

- [x] Sentence-сегменты на импорте (`paragraphKey` + `sentenceIndex`); экспорт склеивает абзац
- [x] `findTmMatches` + multi-variant upsert; attribution/context на TU
- [x] ParagraphBlock + TmVariantPicker (бейдж → список); mid-toolbar без ТМ
- [x] Шапка: TM coverage + done %; дефолт fuzzy 100%, autosave TM off
- [x] Первый open — попап языковой пары + порог
- [x] Миграция: «Пересегментировать?»
- [x] Порог в тулбаре (`%`); автосейв ТМ только для новых/изменённых; ручная запись в ТМ кнопкой у бейджа
- [ ] Убрать лишние ТМ-кнопки в тулбаре (punct soft и т.п. — по необходимости)
- [ ] Админка ТМ — после MVP

---

### Фаза D-lite / MVP-cloud ← после модели сегментов / ТМ UX

**Цель:** аккаунт → облачная TM → lock/backup. Без SMTP.

#### 1) Auth + лендинг (не голый login)

Референс по духу (не копипаст): `disput`, `peerling` — спокойные анимации, бренд-первый экран, наш визуальный язык (IBM Plex / тема appzac).

- [x] **Лендинг** — только презентация + вход/регистрация (auth-first; **без гостевого CAT**)
- [x] `users`: UUID `id`, `email`, `password_hash`, `session_version`, `is_admin`, `telegram_id` (nullable)
- [x] Register / login / me / logout; JWT + claim `sv`; IndexedDB scoped by opaque UUID
- [ ] Admin promote через SQL/CLI

#### 2) Сброс пароля через Telegram (без почты)

**Зачем `telegram_id`:** это не «логин в Telegram», а числовой ID чата пользователя в Telegram (`123456789`). Бот умеет писать **только** в чаты, которые ему известны. Мы один раз связываем аккаунт appzac ↔ этот ID и дальше шлём код сброса туда.

Да, **хранить надо** (в таблице `users`, поле `telegram_id`):
- без него бот не знает, *кому* из миллионов чатов отправить код, когда в SPA ввели login;
- храним только числовой id + факт привязки; username Telegram не обязателен;
- отвязка / смена — в профиле.

Поток:
1. В профиле: «Привязать Telegram» → ссылка `t.me/bot?start=link_<token>` → бот сохраняет `telegram_id` у пользователя.
2. «Забыл пароль» → API (по login) находит user → если есть `telegram_id`, шлёт код в этот чат.
3. Код + новый пароль в SPA.

Если не привязан — сброс только админом.

- [ ] Link / unlink Telegram
- [ ] password-reset request/confirm + webhook бота
- [ ] Rate limit; `{ ok: true }` без enumeration

#### 3) Облачная TM (в MVP)

Одна память на `user_id`. Локальный IndexedDB — кэш; сервер — источник правды для аккаунта.

- [ ] Таблица `tm_units` (или blob snapshot + дельта — выбрать при реализации; старт: row-per-unit как локально)
- [ ] `GET/PUT /api/tm` или sync: pull since `updated_at` + push upserts
- [ ] Клиент: после login — merge/pull; при записи done — local + queue upload
- [ ] Офлайн: работа из кэша; при online — sync
- [ ] Конфликт MVP: побеждает больший `updated_at` (или last-write-wins по unit id)

#### 4) Lock + backup проекта

- [ ] `project_locks` + heartbeat
- [ ] Backup `.tcat.zip` API (свой user_id)
- [ ] Tab-lease остаётся для гостя / офлайн

#### Эндпоинты v1 (сжато)

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/auth/register` | регистрация |
| POST | `/api/auth/login` | JWT + bump session |
| GET | `/api/auth/me` | профиль / flags |
| POST | `/api/auth/logout` | invalidate |
| POST | `/api/auth/password-reset/request` | → Telegram |
| POST | `/api/auth/password-reset/confirm` | новый пароль |
| POST | `/api/telegram/webhook` | бот |
| GET/PUT | `/api/tm` (или `/api/tm/sync`) | облачная TM |
| POST/DELETE | `/api/projects/{id}/lock` | lock |
| PUT/GET | `/api/projects/{id}/backup` | бэкап |
| GET | `/api/health` | health |

#### Клиент

- [x] Лендинг + auth UI (auth-first, без гостя); привязка Telegram — позже
- [ ] TM sync после login + при автосейве
- [ ] Баннер offline; позже outbox
- [ ] Feature flags; admin = Pro

#### Docker

- [x] `docker-compose.local.yml` — postgres + api
- [x] `.env.local.example` — `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `VITE_API_BASE`
- [ ] Prod: web + api + db; webhook на HTTPS; обновить `deploy/CURSOR_MINI_PC.txt`

---

### После MVP (фаза D / Pro и отложенное)

- [ ] **Ручная вставка / добавление тегов** в переводе (самостоятельно, не только из оригинала)
- [ ] MT (подсказки машинного перевода)
- [ ] multi-TM (несколько памятей с приоритетом)
- [ ] SRX (правила сегментации)
- [ ] Двусторонний sync **проектов** (не только TM + backup snapshot)
- [ ] Лимиты free; Pro-пакеты
- [ ] Penalty за числа; TM dedupe/merge; Elasticsearch при масштабе

---

## Безопасность (перед prod auth)

- [ ] JWT на защищённых маршрутах; TM/backup только своего `user_id`
- [ ] Rate limit auth / reset / telegram link
- [ ] `session_version`; хранить `telegram_id` + hash токенов link/reset с TTL
- [ ] Не логировать bot token / JWT
- [ ] IndexedDB per-user prefix после login
- [ ] HTTPS; webhook только на свой API

---

## Порядок реализации (актуальный)

1. **Модель sentence-сегментов + ТМ UX** ✓
2. **Auth API + лендинг (auth-first)** ✓
3. Telegram: link + password reset ← сейчас
4. **Облачная TM** sync (MVP)
5. Project lock + backup
6. Prod + security pass
7. B2 p2 (context / tags / concordance / audit) — по словарю выше
8. Глоссарий; форматы; MT; multi-TM; SRX; админка ТМ

---

## Архитектура (MVP-cloud)

```text
[Browser SPA]
  ├─ IndexedDB (projects, TM cache)
  ├─ Tab lease (guest / offline)
  └─ HTTPS → API (JWT + session_version)
         ├─ Postgres (users.telegram_id, tm_units, locks, backups)
         └─ Telegram Bot (link + password reset)
```
