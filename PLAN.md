# План разработки Translation Tool (appzac)

Спека: [`docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md`](docs/superpowers/specs/2026-07-13-web-cat-mvp-design.md)

## Сделано (фаза A — локальный MVP без аккаунта)

- [x] Снос старого драфта, Vue 3 + Vite + TS с нуля
- [x] DOCX → сегменты (абзацы, таблицы, колонтитулы) → редактор → экспорт DOCX с сохранением разметки
- [x] IndexedDB + копия проекта `.tcat.zip`
- [x] Автосейв (~3 с), статусы «есть/нет перевода» + «сохранено»
- [x] i18n ru/en, тёмная тема по умолчанию + переключатель
- [x] Desktop-first UI, выровненные панели оригинал/перевод
- [x] Unit-тесты round-trip / маркеры форматирования
- [x] Предпросмотр DOCX (`docx-preview`), связка превью ↔ редактор (клик, ховер, скролл)
- [x] Lease одной вкладки на проект (localStorage + `BroadcastChannel`) — fallback до серверного lock
- [x] Локальная TM (IndexedDB) + TMX + exact/fuzzy/fragment + soft punctuation

## Граница MVP (целевая)

В MVP входят: **sentence-сегменты + CAT-like TM UX**, **DOCX round-trip**, **аккаунт**, **облачная TM**, **бэкап**, Telegram-сброс пароля; атрибуция TU + просмотр контекста в пикере.

Не в MVP (после): другие форматы (XLIFF…), MT, multi-TM, SRX, **общий проект / team TM (фаза F)**, глоссарий TBX, админка ТМ, полный audit timeline.

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

- [x] Настраиваемый порог fuzzy (дефолт 75%, слайдер 50–100%)
- [x] Context match (101%)
- [x] Штраф за маркеры форматирования (`{n}` sequences)
- [x] Match metadata в UI
- [x] Segment edit audit
- [x] Concordance panel (`FEATURE_TM_CONCORDANCE` в `src/features.ts` — выключить = скрыть UI)
- [x] Undo/redo перевода на сегменте (RAM вкладки, ~30 шагов; не в `.tcat`)
- [x] Копирование target из concordance в буфер (без замены сегмента)
- [x] Предупреждение при экспорте DOCX, если проект ещё не сохранён (`!allSaved`)

**UX backlog (после B2 p2)**

- [ ] **Issues tray** в шапке редактора: must / recommended (числа). Must — блокирующие (напр. несбалансированные маркеры); recommended — советы (длинный source / короткий target и т.п.). Не делать сейчас — отдельный срез после styles/E или параллельно по приоритету.

**Обмен форматами (после MVP)**

- [ ] XLIFF 1.2; backlog XLIFF 2.0 / SDLXLIFF

#### Словарь: B2 (перед реализацией этих пунктов)

| Термин | Что это |
|--------|---------|
| **Context match (101%)** | Source совпал **и** совпал соседний сегмент (prev/next). Реже ошибочная подстановка одной и той же фразы в разном контексте. |
| **Штраф за маркеры** | Разные последовательности `{1}…{2}` (границы Word-runs) → понижаем % fuzzy (код: `tagMismatchPenalty`, max 0.15). Это **не** CAT-теги Trados/placeables и **не** bold/italic как стиль. В UI копирайт уже «маркеры»; имена функций в коде могут ещё говорить `tag*`. |
| **Concordance** | Поиск по памяти по подстроке, без автоподстановки. |
| **Audit** | История правок сегмента (ручной / ТМ / сброс). |

---

### Фаза E: стили ≠ «теги» (после B2 p2) ← **после audit + concordance**

> Обратная связь от практикующего переводчика. Сейчас в appzac `{1}…{2}` в редакторе = границы Word-runs (стили). В Trados/memoQ **«теги»** обычно = *повторяющийся/служебный* контент (колонтитулы, поля, иногда placeables), а стилизация текста — **отдельный слой** (панель форматирования), не «теги в строке». Исходник и перевод по умолчанию **не стилизуют** в поле ввода: берут преобладающий шрифт/стиль сегмента, нужное выделяют и стилизуют руками. Превью DOCX остаётся источником правды по внешнему виду.

Спека: [`docs/superpowers/specs/2026-07-15-styles-vs-tags-design.md`](docs/superpowers/specs/2026-07-15-styles-vs-tags-design.md) — перед кодом; править при расхождении с этим разделом.

#### Словарь (фаза E)

| Термин | Что это у нас |
|--------|----------------|
| **Маркеры форматирования** | Внутренние `{n}` / `RunSpan` для round-trip DOCX. Не называть «тегами» в UI. |
| **CAT-теги / placeables** | Повторяющийся служебный текст (колонтитулы уже как `kind`, поля/индексы — позже). Не смешивать с жирным/курсивом. |
| **Стилизация** | Bold/italic/underline/шрифт/размер на выделении в **активном** сегменте; запись стилей на target отдельно от «голой» строки перевода. |
| **Преобладающий стиль** | Доминирующий run исходного абзаца/сегмента → дефолт для всего target, пока переводчик не переопределит куски. |

#### Отсечь (бред / слишком рано)

- Ломать round-trip ради «красивого plain editor» без модели стилей на export.
- Второй полноэкранный Word-инспектор как в Figma (каждый глиф).
- Три превью сразу (док + попап оригинала + отсоединённый) без swap — визуальный шум.
- Жёстко «resize с сохранением пропорций страницы» как обязаловка: у длинного DOCX важнее зум + min-size, не letterbox страницы.
- Копировать CSS из `docx-preview` 1:1 в runs (хрупко) — только через нашу модель стилей → export.
#### Рекомендуемая архитектура (кратко)

1. **Редактор** — по умолчанию plain text (маркеры скрыты); опционально «показать маркеры» для отладки.
2. **Превью результата** остаётся главным; кнопка **swap оригинал ↔ перевод** в той же панели (дешевле отдельного окна).
3. **Отсоединённый оригинал** — pop-out той же панели (drag + resize), не третий независимый рендер с нуля.
4. **Панель стилей** — не в шапке страницы / topbar. Одна общая полоска **над колонкой перевода**, по центру этой колонки (рядом с meta target / над активным target-pane). Действует на выделение в **активном** сегменте; не дублировать B/I/U в каждом ряду.
5. Под капотом: `RunSpan` / fingerprint → эволюция к явным style props на target ranges; export пишет в DOCX. Превью по-прежнему через `buildTranslatedDocx`.

#### Подзадачи (мелкими чекбоксами)

**E0 — термины и граница**

- [x] Спека: стили vs маркеры vs колонтитулы; что остаётся в MVP UX → `2026-07-15-styles-vs-tags-design.md`
- [x] i18n: «маркеры форматирования» вместо «теги» где речь о `{n}`; kind header/footer не называть tags
- [x] В словаре B2: «штраф за маркеры» (не CAT-теги / не bold)

**E1 — plain editor + дефолтный стиль (минимальный сдвиг)**

- [ ] Режим отображения source/target без видимых `{n}` (toggle «маркеры»)
- [ ] При export без ручных override: весь target → преобладающий стиль source-сегмента
- [ ] Не ломать текущие проекты: миграция/совместимость spans

**E2 — панель стилизации (над переводом)**

- [ ] Toolbar B / I / U (+ размер/шрифт — по возможности из доступных в сегменте) **над колонкой target**, визуально по центру этой колонки; не в `#app-header` / toolbar-bar
- [ ] Активен только при focus/active сегменте + непустом selection в target
- [ ] Стили пишутся в модель сегмента (не «рисовать» только в contenteditable без persist)
- [ ] Round-trip: styled ranges → DOCX runs; тесты на simple bold/italic

**E3 — превью: swap + pop-out**

- [ ] В панели результата: кнопка swap «показать оригинал / перевод» (тот же viewport, тот же скролл по возможности)
- [ ] Pop-out: отсоединяемое окно/overlay превью (drag), resize с min-width/height; зум страницы важнее aspect-lock
- [ ] Сохранять положение/размер pop-out в session/localStorage на проект

**E4 — инспектор стилей с превью (после E2–E3)**

- [ ] Клик по элементу в превью → подсветка + краткая карточка стиля (font, size, bold/italic)
- [ ] «Применить к выделению» → target selection активного сегмента (через нашу style-модель, не сырой CSS)
- [ ] Связка клик превью → activate сегмента (уже частично есть) сохранить

**E5 — CAT-«теги» по-настоящему (позже, не блокирует E1–E4)**

- [ ] Не смешивать с маркерами: колонтитулы уже `kind`; дальше — lock-fields / non-translatable placeables по мере нужды
- [x] TM: копирайт penalty/маркеров в UI и словаре → «маркеры» (E0); structure-placeables — отдельно когда появятся

#### Порядок внутри E

`E0 → E1 → E2 → E3 → E4`; E5 параллельно/после. Не начинать E4 без стабильного E2.

---

### Фаза F: другие люди в истории / ТМ (после E, не блокер B2)

> Сейчас аккаунт изолирован: облачная **TM = один user**, **backup/lock проекта = один user**. Attribution («Вы» / ник / «Инкогнито»+цвет) уже готово на клиенте, но *другие актёры* появятся только когда данные начнут пересекаться между аккаунтами.

**Как вообще «появиться другому человеку»**

| Путь | Что шарится | Где видны «другие» | Сложность |
|------|-------------|--------------------|-----------|
| A. Передача файла | `.tcat.zip` / TMX вручную | История в проекте; авторы TU в ТМ после импорта | Уже почти есть (файл), слабый UX |
| B. **Общий проект** (рекомендуем первым) | Один cloud-project +members | Audit сегментов, при записи в ТМ — их ник/`anon:id` | Средняя: ACL + sync проекта |
| C. Общая / team ТМ | Shared TM memory | Пикер вариантов с чужими авторами | Выше: multi-TM + права |

**Рекомендация:** сначала **B (общий проект)** — переводчики работают над одним документом; история правок и lock обретают смысл. Team-ТМ (C) — отдельным шагом (или invite «подключить ТМ коллеги»). Не делать «просто открой мой backup под другим логином» без модели members.

#### Подзадачи F

**F0 — спека**

- [ ] Спека: members, роли (owner / editor / viewer), invite по email или link-token, что синкается (проект ± опционально личная ТМ не утекает)
- [ ] Явно: email в audit/TM по-прежнему не пишем; только ник / `anon:userId`

**F1 — минимальный обмен без полного collab** (быстрый wins)

- [ ] UX: «Поделиться проектом» → скачать `.tcat.zip` + короткая подсказка «откройте в другом аккаунте через импорт»
- [ ] При импорте чужого проекта: сохранить `audit[].by` / TM actors как есть (Инкогнито+цвета / ники)
- [ ] (Опц.) экспортировать/импортировать только TMX с attribution notes

**F2 — cloud shared project**

- [ ] Таблица `project_members` (`project_id`, `user_id`, `role`)
- [ ] Invite: создать invite → принять → member
- [ ] Sync проекта (не только snapshot backup): сегменты + meta; конфликт-политика (LWW или «последний lock wins» — решить в спеке)
- [ ] Lock: один editor или queue; viewer read-only
- [ ] UI: список участников; в истории/ТМ сразу «Вы» vs ник vs Инкогнито

**F3 — shared / team TM** (после F2 или с multi-TM)

- [ ] Workspace TM или «присоединить ТМ пользователя X» с opt-in
- [ ] Пикер: авторы из нескольких аккаунтов; приоритет памятей

**Отсечь**

- Общий пароль от одного аккаунта «на двоих»
- Автоматически светить email в UI коллаба
- Realtime OT/CRDT в первой версии (хватит sync + lock)

#### Порядок внутри F

`F0 → F1 → F2 → F3`. F1 можно сразу после текущей attribution-полировки.

---

#### Словарь: отложено после MVP (расшифровка)

| Термин | Что это | Зачем / когда |
|--------|---------|----------------|
| **Облачная TM** | Память переводов на сервере у аккаунта; браузер кэширует локально и синкает. | **В MVP** — одна TM на пользователя на всех устройствах. |
| **MT** | Machine Translation — подсказка из движка (DeepL/Google/…), не из вашей памяти. | После MVP; отдельный ключ API, квоты, UI «вставить из MT». |
| **multi-TM** | Несколько памятей сразу (проектная + общая + клиентская) с приоритетом и штрафами. | После MVP; в MVP достаточно **одной** облачной TM на user. |
| **Общий проект** | Один `.tcat` / cloud-project на нескольких `user_id` (invite). История сегментов общая → «Вы» / ник / Инкогнито имеет смысл. | После MVP; сейчас backup/lock только своего user. |
| **Общая ТМ (team)** | Память не «только моя», а workspace/team — варианты и `createdBy` от коллег. | После / вместе с multi-TM; не путать с личным sync. |
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
- [x] Шапка: TM coverage + done %; дефолт fuzzy 75%, autosave TM off
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
- [ ] Admin promote через SQL/CLI (пока достаточно SQL)

#### 2) Облачная TM (в MVP) ← сейчас

Одна память на `user_id`. Локальный IndexedDB — кэш; сервер — источник правды для аккаунта.

- [x] Таблица `tm_units` (row-per-unit)
- [x] `GET/POST /api/tm/sync` (pull since + push upserts, LWW, tombstones)
- [x] Клиент: после login — pull/merge; при записи/удалении — dirty push
- [x] Офлайн: работа из кэша; при online — sync (silent retry)
- [x] Конфликт MVP: LWW по `updatedAt`

#### 3) Lock + backup проекта

- [x] `project_locks` + heartbeat
- [x] Backup `.tcat.zip` API (свой user_id)
- [x] Tab-lease остаётся локально; cloud lock — cross-device

#### 4) Сброс пароля через Telegram (без почты) — в конце MVP

Отложено: до бота сброс пароля только админом. Поле `telegram_id` в схеме оставляем nullable.

**Зачем `telegram_id`:** числовой ID чата. Бот пишет только в известные чаты; связываем аккаунт ↔ ID, шлём код сброса.

Поток:
1. В профиле: «Привязать Telegram» → `t.me/bot?start=link_<token>` → бот сохраняет `telegram_id`.
2. «Забыл пароль» → API → код в Telegram.
3. Код + новый пароль в SPA.

- [ ] Link / unlink Telegram
- [ ] password-reset request/confirm + webhook бота
- [ ] Rate limit; `{ ok: true }` без enumeration

#### Эндпоинты v1 (сжато)

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/auth/register` | регистрация |
| POST | `/api/auth/login` | JWT + bump session |
| GET | `/api/auth/me` | профиль / flags |
| PATCH | `/api/auth/me` | display_name |
| POST | `/api/auth/logout` | invalidate |
| GET/PUT | `/api/tm` (или `/api/tm/sync`) | облачная TM |
| POST/DELETE | `/api/projects/{id}/lock` | lock |
| PUT/GET | `/api/projects/{id}/backup` | бэкап |
| GET | `/api/health` | health |
| POST | `/api/auth/password-reset/request` | → Telegram (позже) |
| POST | `/api/auth/password-reset/confirm` | новый пароль (позже) |
| POST | `/api/telegram/webhook` | бот (позже) |

#### Клиент

- [x] Лендинг + auth UI (auth-first, без гостя); привязка Telegram — позже
- [x] TM sync после login + dirty push при записи в ТМ
- [ ] Баннер offline; позже outbox
- [ ] Feature flags; admin = Pro

#### Docker

- [x] `docker-compose.local.yml` — postgres + api
- [x] `.env.local.example` — `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `VITE_API_BASE`
- [x] Prod: один Go-app (SPA+API) + db; webhook HTTPS — когда появится бот

---

### После MVP (фаза D / Pro и отложенное)

- [ ] **Ручная стилизация перевода** (фаза E) — вместо «ручная вставка маркеров `{n}`»
- [ ] **Фаза F: общий проект / другие люди** (invite, sync проекта; затем team TM)
- [ ] MT (подсказки машинного перевода)
- [ ] multi-TM (несколько памятей с приоритетом) — стыкуется с F3
- [ ] SRX (правила сегментации)
- [ ] Двусторонний sync **проектов** — см. F2 (заменяет голый «только backup»)
- [ ] Лимиты free; Pro-пакеты
- [ ] Penalty за числа; TM dedupe/merge; Elasticsearch при масштабе

---

## Безопасность (перед / после prod auth)

- [x] JWT на защищённых маршрутах; TM/lock/backup только своего `user_id`
- [x] Rate limit auth (login/register); reset/telegram — когда появятся
- [x] `session_version` на login/logout + middleware; telegram tokens — позже
- [x] Не логировать JWT / тела бэкапов; токен lock только в JSON body
- [x] IndexedDB per-user prefix после login
- [x] Лимиты тел (auth/TM/lock/backup), таймауты сервера, `JWT_SECRET` ≥ 32, CSP/headers
- [ ] HTTPS на NPM (операционно); webhook только на свой API (когда будет бот)

---

## Порядок реализации (актуальный)

1. **Модель sentence-сегментов + ТМ UX** ✓
2. **Auth API + лендинг (auth-first)** ✓
3. **Облачная TM** sync (MVP) ✓
4. Project lock + backup ✓
5. Prod + security pass ✓
6. Telegram: link + password reset (конец MVP) — отложено
7. B2 p2: audit + concordance ✓ (concordance — флаг `FEATURE_TM_CONCORDANCE`)
8. **Фаза E: стили ≠ маркеры** ← дальше
9. **Фаза F: общий проект / другие аккаунты** (F1 файл → F2 invite+sync → F3 team TM)
10. Глоссарий; форматы; MT; multi-TM; SRX; админка ТМ; CAT placeables (E5)

---

## Архитектура (MVP-cloud)

```text
[Browser SPA]
  ├─ IndexedDB (projects, TM cache)
  ├─ Tab lease + cloud lock / backup
  └─ HTTPS → API (JWT + session_version)
         ├─ Postgres (users, tm_units, locks, backups)
         └─ Telegram Bot — позже (link + password reset)
```
