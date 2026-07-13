# План разработки Translation Tool (appzac)

Спека: [`docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md`](docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md)

## Сделано (фаза A — MVP)

- [x] Снос старого драфта, Vue 3 + Vite + TS с нуля
- [x] DOCX → сегменты (абзацы, таблицы, колонтитулы) → редактор → экспорт DOCX с сохранением разметки
- [x] IndexedDB + копия проекта `.tcat.zip`
- [x] Автосейв (~3 с), статусы «есть/нет перевода» + «сохранено»
- [x] i18n ru/en, тёмная тема по умолчанию + переключатель
- [x] Desktop-first UI, выровненные панели оригинал/перевод
- [x] Unit-тесты round-trip / теги
- [x] Предпросмотр DOCX (`docx-preview`), связка превью ↔ редактор (клик, ховер, скролл)
- [x] Lease одной вкладки на проект (localStorage + `BroadcastChannel`) — fallback до серверного lock

## Дальше

### Полировка A (закрыть)

- [ ] Ручной чеклист в Word на реальных файлах (первый проход на appzac.ru — ок, нужен полный прогон)
- [x] Статический деплой SPA — Docker + CI, см. `docker-compose.prod.yml`, `deploy/CURSOR_MINI_PC.txt`
- [x] Мелкий UX по результатам тестов (основное — сделано; правки по чеклисту Word)

---

### Фаза B: Translation Memory + обмен форматами (локально, без сервера)

**TM (ядро B — сделано)**

- [x] Локальное хранилище TM (IndexedDB `appzac-tm`)
- [x] Запись подтверждённых (`done`) сегментов в TM при автосейве
- [x] Exact + fuzzy match в редакторе (порог 85%, Levenshtein по всей строке)
- [x] Импорт / экспорт **TMX 1.4**
- [x] UI: кнопка ТМ (янтарь), подчёркивание в превью, always-visible disabled state

**TM (B2 — ближе к стандартам Trados / memoQ / Smartcat, в рамках local-first)**

> Референс-поведение крупных CAT: exact → context (101%) → fuzzy с настраиваемым порогом; concordance / fragment recall; штрафы за теги и цифры; опции нормализации пунктуации. Реализуем поэтапно — без over-engineering на первом проходе.

**Приоритет 1 — то, что уже выявили тестами**

- [x] **Fragment / sub-segment match** — если сегмент длиннее записи TM, искать **вхождения** TM-фраз внутри сегмента (concordance-style), не только сравнение «вся строка ↔ вся строка»
  - MVP: разбивка source по `.?!…` + эвристика абзацев; для каждого фрагмента — exact/fuzzy по TM
  - UI: несколько подсказок или «лучший фрагмент» + %; в превью — подчёркивание только совпавшей части (позже)
  - Тест-кейс: «Вы нам нравитесь. … Вы нам нравитесь?» → match на каждое вхождение «Вы нам нравитесь.»
- [ ] **Нормализация пунктуации (опция)** — для fuzzy (и опционально exact):
  - игнор **конечной** пунктуации (`. , ; : ! ? …`)
  - опционально: нормализация `?` / `!` ↔ `.` при сравнении
  - настройка в UI или `localStorage`: «строго» (как сейчас) / «мягко» (ближе к CAT)
  - тест-кейс: «…нравитесь» и «…нравитесь.» → 100% в режиме «мягко»

**Приоритет 2 — типичные CAT-фичи, реалистичные локально**

- [ ] **Настраиваемый порог fuzzy** (slider 70–100%, дефолт 85% — как у многих CAT)
- [ ] **Context match (101%)** — ключ TM = source + id/hash **соседнего** сегмента (prev/next); показывать выше обычного 100%
- [ ] **Штраф за расхождение тегов** `{1}…{2}` — fuzzy score −N% если последовательность tag id не совпадает (inline tags уже есть)
- [ ] **Match metadata в UI** — exact / fuzzy / fragment / context, %; tooltip как в CAT
- [ ] **Concordance search** — отдельная панель «поиск по TM» по подстроке (read-only, без автоподстановки)

**Приоритет 3 — после D-lite / облачной TM**

- [ ] Несколько TM с приоритетом (project TM + global TM)
- [ ] Penalty за числа/единицы (упрощённо: разный digit-sequence → −%)
- [ ] TM maintainability: dedupe, merge on import, `updatedAt` conflict rules
- [ ] **SRX** / пользовательские правила сегментации (backlog — сильно ближе к enterprise CAT)

**Не цель MVP / B2 (явно отложить)**

- MT integration, adaptive MT, auto-propagation across files
- Perfect 101% / structure match с полным tree alignment
- Server-side TM index (Elasticsearch) — только при масштабе Pro

**Обмен сегментами (B+, не заменяет DOCX round-trip)**

- [ ] Импорт / экспорт **XLIFF 1.2** (приоритет для агентств)
- [ ] Backlog: XLIFF 2.0, SDLXLIFF — по спросу

> DOCX сохраняет вёрстку Word. TMX/XLIFF — текст, статусы, теги; отдельные пункты UI «Импорт / Экспорт».

---

### Фаза C: Глоссарий

- [ ] Простой termbase (локально)
- [ ] Подсветка терминов в source
- [ ] Backlog: **TBX** import/export

---

### Фаза D-lite: аккаунт, API, серверная сессия (бесплатно с логином)

**Цель:** логин для всех; local-first редактор; сервер — auth, lock, бэкап. Pro — расширения (sync, лимиты, облачная TM).

#### Backend (новый сервис, по мотивам disput)

Референс: `d:\DEV\AG\disput` — bcrypt, rate limit, JWT Bearer, коды ошибок, reset password (хеш токена в БД).

**Добавить поверх disput-паттерна (в disput этого нет):**

- [ ] `users.session_version` + claim `sv` в JWT → одна активная auth-сессия на аккаунт
- [ ] `project_locks` (user, project_id, session_id, expires_at) + heartbeat → один редактор проекта онлайн
- [ ] При логине: bump `session_version` (старые JWT недействительны)
- [ ] Роли: `user` | `admin`; **admin = все Pro-фичи включены** без подписки
- [ ] Первый admin: создать пользователя вручную на проде + `UPDATE users SET is_admin = true` (или CLI `appzac-admin promote`)

**Минимальные эндпоинты v1**

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/auth/register` | регистрация (пока invite-only или open — решить) |
| POST | `/api/auth/login` | login + новый JWT + bump session |
| GET | `/api/auth/me` | профиль, `is_admin`, flags Pro |
| POST | `/api/auth/logout` | bump session / invalidate |
| POST | `/api/projects/{id}/lock` | heartbeat lock (редактирование) |
| DELETE | `/api/projects/{id}/lock` | release |
| PUT | `/api/projects/{id}/backup` | загрузка `.tcat.zip` (encrypted at rest — позже) |
| GET | `/api/projects/{id}/backup` | скачать бэкап **только своего** user_id |
| GET | `/api/health` | `jwt_ready`, версия API |

**Клиент (SPA)**

- [ ] Экран login/register (Bearer в localStorage, как disput)
- [ ] Офлайн: редактор на IndexedDB; баннер «Нет сети»; очередь `sync_outbox`
- [ ] Онлайн + auth: серверный project lock вместо/поверх tab-lease
- [ ] Tab-lease **оставить** для гостя / офлайн / API недоступен
- [ ] Feature flags: `canPreview`, `canCloudSync`, … — `is_admin` → все `true`

#### Docker: локальная разработка API

- [ ] `docker-compose.local.yml` — **postgres + api** (SPA по-прежнему `npm run dev` на хосте)
- [ ] `.env.local.example` — `DATABASE_URL`, `JWT_SECRET`, `VITE_API_BASE=http://localhost:8080`
- [ ] Команда: `docker compose -f docker-compose.local.yml up -d`
- [ ] Миграции: `db/migrations/` ( golang-migrate или аналог, как disput)

Стек local (план):

```text
appzac-local-db   → postgres:16
appzac-local-api  → Go API :8080
```

#### Docker: прод (мини-ПК)

Текущий `docker-compose.prod.yml` — только **статический SPA**. После D-lite:

- [ ] `docker-compose.prod.yml` — сервисы `web` + `api` + `db` (или db на хосте)
- [ ] NPM: `appzac.ru` → web; `api.appzac.ru` (или `/api` reverse proxy) → api
- [ ] `.env.prod.example` — секреты, `JWT_SECRET`, `DATABASE_URL`, `TRUST_PROXY=1`
- [ ] Инструкция деплоя — дополнить `deploy/CURSOR_MINI_PC.txt` (шаги после появления API)

**Прод — чеклист (когда API готов)**

1. `cp .env.prod.example .env.prod`, задать `JWT_SECRET` (≥32 символа), пароль Postgres
2. `docker compose --env-file .env.prod -p appzac -f docker-compose.prod.yml up -d --build`
3. NPM: proxy `api.appzac.ru` → `appzac-prod-api:8080`, SPA → `appzac-prod-web:80`
4. Миграции: `docker compose exec api ./migrate up` (или init-контейнер)
5. Создать пользователя (register или SQL seed)
6. Выдать admin: `UPDATE users SET is_admin = true WHERE email = '...'`
7. Проверить `/api/health`, login, `/api/auth/me` → `is_admin: true`

---

### Фаза D / Pro (платное и расширения)

- [ ] Двусторонний sync проектов (не только backup snapshot)
- [ ] TM в облаке + sync между устройствами
- [ ] Лимиты free (число проектов, объём бэкапа) — admin без лимитов
- [ ] **Pro для обычных users:** облачный sync, облачная TM, расширенные лимиты
- [ ] Preview DOCX — сейчас всем; позже trial/free vs Pro (admin всегда on)

---

## Безопасность и приватность (обязательный чеклист перед D-lite prod)

### Принцип

IndexedDB **всегда локальна** в браузере пользователя. Сервер **не может** читать IndexedDB напрямую. Риски — утечка через API, XSS, общий компьютер, слабая изоляция SPA.

### Чеклист перед релизом auth

- [ ] **API:** без валидного JWT нельзя получить чужие проекты, бэкапы, TM, профиль
- [ ] **API:** все `GET/PUT/DELETE` по `project_id` проверяют `user_id` владельца (или ACL позже)
- [ ] **API:** rate limit на login/register/reset (как disput)
- [ ] **API:** generic `INVALID_CREDENTIALS`, reset — `{ ok: true }` без enumeration
- [ ] **JWT:** короткий access + `session_version`; logout / новый login отзывает старые
- [ ] **Клиент:** не логировать token; `Authorization` только на свой origin API
- [ ] **Клиент:** при logout — очистить token + чувствительные ключи sessionStorage
- [ ] **IndexedDB:** ключи с `userId` в имени БД или prefix (`appzac-u-{uuid}`), чтобы смена аккаунта на том же браузере не показывала чужие проекты
- [ ] **IndexedDB:** при logout — опционально «оставить локальные копии» vs «очистить» (UX + privacy)
- [ ] **Ручная проверка:** DevTools → Application → IndexedDB — после logout другой user не видит прошлые данные без явного «локальный гость»
- [ ] **Ручная проверка:** curl без token → 401 на все `/api/*` кроме health/register/login
- [ ] **CSP / XSS:** минимизировать `v-html`; санитизация; позже CSP headers в nginx
- [ ] **HTTPS** на проде (NPM + Let's Encrypt)

### Что IndexedDB **не** защищает

Любой с доступом к профилю браузера на машине может открыть DevTools. Это норма для local-first. Защита — OS-аккаунт + full-disk encryption; мы не храним пароль в IDB.

---

## Порядок реализации (рекомендуемый)

1. Закрыть чеклист Word (A)
2. ~~**B-local:** TM + TMX + match~~ ✅
3. ~~**B2:** fragment match + нормализация пунктуации + настраиваемый порог fuzzy~~ (fragment + punct ✅; порог — B2 p2)
4. **D-lite:** Go API, postgres, docker local, auth, session_version, project lock, backup API
5. **B+:** XLIFF 1.2; context match (101%); tag penalties
6. SPA: login, offline outbox, feature flags, admin = Pro
7. **Prod:** расширить compose + `deploy/CURSOR_MINI_PC.txt`, admin user
8. **Security pass** — чеклист выше
9. **C:** глоссарий
10. **D/Pro:** полный sync, облачная TM, concordance + multi-TM

---

## Архитектура (целевая)

```text
[Browser SPA]
  ├─ IndexedDB (projects, TM, outbox) — local-first, per-user namespace после login
  ├─ Tab lease (fallback)
  └─ HTTPS → API (JWT + session_version)
         ├─ Postgres (users, locks, backups meta, TM cloud later)
         └─ Blob storage (backup files) — FS или S3 позже
```

**Офлайн:** редактирование локально; sync_outbox; при reconnect — push/pull; конфликты — MVP «версия на сервере новее».
