# PRD — @ashenaiybot | ربات تلگرامی چت ناشناس با فیچرهای Tinder-وار ساده‌شده

**نسخه:** ۱.۰ (Draft برای شروع اسپرینت اول)
**تاریخ:** ۵ تیر ۱۴۰۵ / Jul 5, 2026
**مالک محصول:** مهدی
**هدف سند:** یک PRD کامل + Backlog اپیک‌به‌اپیک که مستقیماً قابل کپی و دادن به Claude Code باشه، به ترتیبی که هر اپیک روی اپیک قبلی سوار بشه.

---

## ۱. خلاصه اجرایی

**Ashenaiy (@ashenaiybot)** یک ربات تلگرامی برای چت ناشناس با غریبه‌هاست که به‌جای تطبیق تصادفی محض (مدل Omegle)، یک لایه‌ی سبک‌شده از تجربه‌ی Tinder روی آن سوار می‌شود: کاربر یک پروفایل مینیمال می‌سازد، پروفایل‌های دیگران را به‌صورت کارت می‌بیند، Like/Pass می‌زند، در صورت Like متقابل یک «چت ناشناس» باز می‌شود که پیام‌ها بدون افشای هویت تلگرامی (username، شماره، آیدی عددی) بین دو طرف رله می‌شود.

محصول در دو لایه ارائه می‌شود:
1. **حالت ساده (Bot-native):** کاملاً داخل چت تلگرام، فقط با Inline Keyboard — بدون نیاز به باز کردن هیچ صفحه‌ای.
2. **حالت غنی (Mini App):** با زدن دکمه‌ی Mini App بعد از `/start`، همان قابلیت‌ها در یک وب‌اپ داخل تلگرام (طراحی‌شده با Next.js + Geist) با تجربه‌ی بصری بهتر (کارت‌های سوایپ، فرم پروفایل، تنظیمات) در دسترس است.

هر دو لایه روی **یک بک‌اند و یک دیتابیس مشترک** کار می‌کنند؛ کاربر می‌تواند هر لحظه بین این دو حالت جابه‌جا شود بدون از دست دادن state.

یک **پنل ادمین** جدا (Next.js) هم برای مدیریت کاربران، بررسی گزارش‌ها (Reports)، بن کردن، و مشاهده‌ی متریک‌های کلی محصول ساخته می‌شود.

---

## ۲. مفروضات (Assumptions) — لطفاً قبل از شروع تأیید/اصلاح کن

چون ایده در حد یک خط بود، برای این‌که بشه اپیک/استوری نوشت، این مفروضات رو در نظر گرفتم. هرکدوم غلط بود، فقط خط مربوطه رو اصلاح کن، بقیه‌ی سند دست‌نخورده می‌مونه چون مستقل نوشته شده:

| # | مفروضه | چرا این‌طور فرض شد |
|---|---|---|
| A1 | "ناشناس" یعنی هویت تلگرامی (username, id, شماره) هیچ‌وقت لو نمی‌ره — نه این‌که عکس/بیو هم مخفی باشه | چون فیچر Tinder-وار بدون دیدن پروفایل معنی نداره؛ ناشناس‌بودن در سطح هویت تلگرامیه نه در سطح ظاهر پروفایل |
| A2 | احراز هویت = همون احراز هویت تلگرام (chat_id / initData). نیازی به OTP یا شماره‌ی جدا نیست | چون کل تعامل داخل تلگرامه و این خودش یک لایه تأیید هویت واقعیه |
| A3 | حداقل سن مجاز ۱۸ سال، با self-attestation (چک‌باکس تعهد سن + تاریخ تولد) در onboarding | استاندارد پایه‌ی هر پلتفرم چت با غریبه؛ در بخش ریسک‌ها توضیح داده شده که self-attestation کافی نیست و باید با گزارش/بن تقویت بشه |
| A4 | نوع پیام‌های مجاز در چت ناشناس v1: متن، عکس، voice message، استیکر. ویدیو/فایل/لوکیشن در v1 نیست | برای کنترل ریسک محتوا (خصوصاً عکس/ویدیو) و پیچیدگی relay در فاز اول |
| A5 | تطبیق (matching) بر اساس جنسیت مدنظر + بازه‌ی سنی + (اختیاری) زبان/علاقه‌مندی‌هاست، نه لوکیشن جغرافیایی دقیق | لوکیشن دقیق ریسک حریم خصوصی بالایی داره و برای v1 حذف شده |
| A6 | مانتیزیشن (اشتراک ویژه، Boost، Coin) **در scope این سند نیست** — این یک سند جداست بعد از اینکه core loop جواب داد | طبق حرف خودت چیزی درباره پول درنیومدن نگفتی؛ اضافه‌کردنش الان scope رو منفجر می‌کنه |
| A7 | هاست روی یک VPS/سرور داخل ایران که خودت داری، با Docker Compose؛ دیتابیس و Redis هم self-hosted روی همون زیرساخت | طبق درخواست صریح خودت |
| A8 | پنل ادمین فعلاً تک‌نقشی (Admin) نیست — دو نقش: `admin` (دسترسی کامل) و `moderator` (فقط صف گزارش‌ها و بن موقت) | جداسازی مسئولیت مدیریت محصول از مدیریت مدراسیون روزانه، حتی اگر روز اول یک نفر هر دو نقش رو داشته باشه |

اگر هرکدوم از این‌ها با چیزی که تو ذهنت بود فرق داره، بگو تا فقط همون بخش رو اصلاح کنم.

---

## ۳. Goals

- **G1 — Activation:** ≥70% از کاربرانی که `/start` می‌زنن، پروفایل حداقلی (جنسیت، بازه‌ی سنی، تعهد ۱۸+) رو در همون سشن اول کامل کنن.
- **G2 — Time-to-first-match:** با فرض عرضه‌ی کافی، میانه‌ی زمان رسیدن به اولین Match زیر ۵ دقیقه باشه (Baseline بعد از ۲ هفته اول داده واقعی مشخص می‌شه — الان فرضیه‌ست).
- **G3 — Safety SLA:** ۹۵٪ از گزارش‌های کاربران (Report) ظرف ۲۴ ساعت توسط تیم مدراسیون بررسی بشن؛ گزارش‌های با severity بالا (مثل مشکوک‌به‌محتوای غیرقانونی/کودک‌آزاری) ظرف کمتر از ۱ ساعت.
- **G4 — Retention loop:** نرخ بازگشت کاربر برای چت دوم ظرف ۷۲ ساعت اول، قابل اندازه‌گیری و بهبود باشه (بدون هدف عددی قطعی در v1 — Open Question).
- **G5 — Dual-surface parity:** هر کاری که در Mini App میشه کرد، معادلش (حداقل نسخه‌ی ساده‌ترش) از طریق Inline Keyboard هم قابل انجام باشه، تا کاربرهایی که Mini App رو باز نمی‌کنن هم از MVP جا نمونن.

## ۴. Non-Goals (v1)

- **مانتیزیشن/پرداخت** — اسپک جداگانه بعد از اعتبارسنجی core loop.
- **تماس صوتی/تصویری زنده** — پیچیدگی WebRTC/زیرساخت real-time جدا از scope فعلیه.
- **اپ نیتیو iOS/Android** — فقط Bot + Telegram Mini App.
- **افشای متقابل هویت (Mutual Reveal)** — فیچر جذابیه ولی v2؛ برای v1 فقط سطح ناشناس.
- **تطبیق مبتنی بر لوکیشن دقیق (GPS)** — فقط بازه‌ی سنی/جنسیت/زبان.
- **پشتیبانی چندپلتفرمی (واتساپ/اینستاگرام)** — فقط تلگرام.
- **AI ice-breaker / پیشنهاد پیام خودکار** — ایده‌ی خوبیه برای v2، نه v1.

---

## ۵. Personas

1. **کاربر ناشناس (End User)** — یک کاربر تلگرام، معمولاً موبایل، که دنبال یک گفتگوی سبک و بدون ریسک لو رفتن هویتشه. صبرش برای فرم‌های طولانی کمه؛ با Inline Keyboard راحت‌تره تا فرم‌های وب.
2. **مدراتور (Moderator)** — مسئول رسیدگی به Reportها، بن موقت/دائم، بررسی عکس‌های پرچم‌خورده.
3. **ادمین محصول (Admin/PM — خودت)** — نیاز به دید کلی روی متریک‌ها، مدیریت تنظیمات (فیلترهای کلمه‌ی ممنوعه، بازه‌های سنی مجاز، پیام‌های broadcast) داره.

---

## ۶. معماری کلی

```
                     ┌────────────────────┐
                     │   Telegram Client   │
                     │ (Chat UI + WebApp)  │
                     └─────────┬───────────┘
                               │ Bot API (webhook, HTTPS)
                               ▼
                     ┌────────────────────┐
                     │   Nginx (reverse    │  ← TLS termination, rate-limit
                     │   proxy + static)   │
                     └──┬────────┬─────────┘
                        │        │
            ┌───────────┘        └────────────┐
            ▼                                  ▼
  ┌───────────────────┐              ┌──────────────────────┐
  │  Node.js Backend   │              │  Next.js Apps         │
  │  - Bot layer       │◄────REST────►│  - Mini App (WebApp)  │
  │    (grammY)        │    /tRPC     │  - Admin Panel        │
  │  - API layer       │              └──────────────────────┘
  │    (Fastify)       │
  │  - Matching engine │
  │  - Chat relay      │
  │  - Moderation jobs │
  │    (BullMQ)        │
  └────┬───────┬───────┘
       │       │
       ▼       ▼
 ┌──────────┐ ┌───────────┐
 │PostgreSQL│ │  Redis     │  ← matchmaking queue, sessions,
 │ (Prisma) │ │ (ioredis)  │    rate-limit counters, BullMQ
 └──────────┘ └───────────┘
```

همه‌چیز پشت یک Docker Compose واحد روی همون سرور ایرانی بالا میاد: `nginx`, `api` (شامل bot + REST)، `web-miniapp`، `web-admin`، `postgres`، `redis`، `worker` (BullMQ processor).

### مدل داده (خلاصه — مرجع اپیک ۱)

- **User** — telegramId (unique), gender, birthDate, languageCode, status (active/banned/deleted), createdAt
- **Profile** — userId, displayBio, interests[], photoUrl (nullable), photoModerationStatus
- **SwipeAction** — actorUserId, targetUserId, action (like/pass), createdAt
- **Match** — userAId, userBId, status (active/ended), createdAt, endedReason
- **ChatSession** — matchId, startedAt, endedAt, endedBy
- **Message** — sessionId, senderUserId, type (text/photo/voice/sticker), contentRef, sentAt, moderationFlag
- **Report** — reporterId, reportedUserId, sessionId (nullable), reason, severity, status (pending/reviewed/actioned), createdAt
- **Block** — blockerId, blockedId, createdAt
- **AdminUser** — username, passwordHash, role (admin/moderator)
- **BanRecord** — userId, reason, type (temporary/permanent), expiresAt, issuedBy

---

## ۷. استک تکنولوژی (با تمرکز روی "دیتای زیاد برای مدل‌های AI کدنویس")

همه‌ی گزینه‌های زیر عمداً از میان **پرکاربردترین و مستندترین** ابزارهای اکوسیستم انتخاب شدن — یعنی جایی که مدل‌هایی مثل Claude Code به‌خاطر حجم بالای کد Open Source و مستندات، بیشترین دقت رو دارن. از چیزهای نیش (niche) که دیتای کمی دارن پرهیز شده.

| لایه | تکنولوژی | چرا |
|---|---|---|
| **Bot Framework** | **grammY** (TypeScript-first، سبک، مستندات عالی) — جایگزین: Telegraf | هردو خیلی پرکاربردن؛ grammY تایپ‌سیفتی بهتری داره و برای backend شما با TS هم‌خانواده‌تره |
| **Backend API** | **Node.js (LTS) + TypeScript + Fastify** | Fastify سبک‌تر و سریع‌تر از Express ولی هنوز خیلی مستند و پرمصرفه؛ اگر ترجیح می‌دی Express هم به همون اندازه امن انتخابه (داده‌ی آموزشی حتی بیشتر) |
| **ORM** | **Prisma** + PostgreSQL | از پرمصرف‌ترین ORM های نود با بهترین Type inference؛ Migration و Schema-as-code خیلی خوب باهاش کد میشه |
| **Database** | **PostgreSQL 16** | دقیقاً همونی که خواستی؛ برای relational data (User/Match/Report) انتخاب درستیه |
| **Cache / Queue** | **Redis (ioredis) + BullMQ** | Redis برای matchmaking queue، session state، rate-limit counter؛ BullMQ (روی همون Redis) برای job های async مثل moderation عکس، پاک‌سازی سشن‌های idle |
| **Validation** | **Zod** | مشترک بین بک‌اند و فرانت (Mini App/Admin) برای schema validation، خیلی well-documented |
| **Frontend (Mini App + Admin)** | **Next.js 15 (App Router) + TypeScript** | دقیقاً همونی که خواستی؛ از پرداده‌ترین فریم‌ورک‌های فرانت برای AI code-gen |
| **Design System** | **Geist** — پکیج فونت رسمی `geist` (Geist Sans/Mono) از ورسل + توکن‌های رنگ/spacing/radius رسمی Geist + **Tailwind CSS v4** + **shadcn/ui** به‌عنوان لایه‌ی کامپوننت | نکته‌ی مهم: کتابخونه‌ی قدیمی کامپوننت `geist-ui` (community) رسماً **آرشیو شده** و دیگه توسعه نمی‌خوره؛ مسیر فعلی خود ورسل هم Tailwind + shadcn روی توکن‌های Geist هست، پس دقیقاً همین مسیر رو دنبال می‌کنیم |
| **State/Data-fetching** | **TanStack Query** + **Zustand** (برای UI state سبک) | هردو استاندارد بازار React، دیتای زیاد برای AI |
| **Forms** | **React Hook Form + Zod resolver** | ترکیب پرتکرار در کدهای Next.js |
| **Telegram Mini App SDK** | **@telegram-apps/sdk + @telegram-apps/sdk-react** (جانشین مدرن `@twa-dev/sdk`) — تمپلیت رسمی Next.js موجوده | جامعه‌ی فعال، مستندات و مثال‌های Next.js آماده |
| **Web Server / Reverse Proxy** | **Nginx** | دقیقاً همونی که خواستی — TLS termination، rate-limit در لایه‌ی edge، serve کردن static build های Next |
| **Containerization** | **Docker + Docker Compose** | برای بالا آوردن یکجای همه‌ی سرویس‌ها روی سرور ایران، خیلی مستند و قابل تکرار |
| **Process/CI** | **GitHub Actions** برای CI (build/test) + **self-hosted runner** روی همون سرور یا سروری خارج از ایران برای publish/pull ایمیج | ⚠️ نکته‌ی ریسک: دسترسی به GitHub از IP ایران گاهی محدودیت داشته (به‌خاطر تحریم)؛ اگر با GitLab self-hosted کار می‌کنی (که قبلاً باهاش کار کردی)، همون مسیر امن‌تره — این رو به‌عنوان Open Question زیر گذاشتم |
| **Logging/Monitoring** | **Pino** (structured logs) + **Grafana + Prometheus** (self-hosted) به‌جای Sentry SaaS | Sentry SaaS و بعضی ابزارهای مانیتورینگ خارجی ممکنه از ایران در دسترس نباشن/کند باشن؛ استک self-hosted مطمئن‌تره. اگر state خواستی، GlitchTip (جایگزین اوپن‌سورس Sentry) هم گزینه‌ست |
| **Auth (Admin Panel)** | **NextAuth (Auth.js) با Credentials Provider + bcrypt** یا JWT ساده‌ی خودنوشته | برای پنل ادمین کافیه؛ نیازی به OAuth خارجی (که ممکنه در ایران کند/فیلتر باشه) نیست |

---

## ۸. اصول UX Writing (باید در همه‌ی اپیک‌ها رعایت بشه)

لحن Ashenaiy باید **گرم، محترمانه، مطمئن و بدون شوخی زیاده‌روی** باشه — چون هم موضوع (چت با غریبه) حساسه، هم بستر (تلگرام در ایران) نیاز به احساس امنیت داره. چند قاعده‌ی ثابت:

1. **CTA همیشه با فعل شروع می‌شه** و نتیجه‌ی عمل رو دقیق می‌گه: «شروع گفتگو» نه «ادامه»، «گزارش این کاربر» نه «تأیید».
2. **پیام خطا = چه‌اتفاقی + چرا + چطور حل کنش.** هیچ خطای خشک فنی (مثل کد ارور) مستقیم به کاربر نشون داده نمی‌شه.
3. **دیالوگ‌های حساس (بن، پایان چت، گزارش) باید عواقب رو صریح بگن**، نه فقط «مطمئنی؟». مثلاً «این گفتگو برای هر دو طرف تمام می‌شه» نه «ادامه بدیم؟».
4. **هیچ‌وقت به کاربر القا نشه که طرف مقابل واقعی نیست یا ربات‌ه** (transparency) — و هیچ‌وقت هم جزئیات هویتی طرف مقابل حدس زده نشه.
5. یک واژه‌نامه‌ی ثابت داشته باشیم: همیشه «هم‌صحبت» برای طرف مقابل در چت، نه «پارتنر»/«یار»/چیزهای متغیر.

### نمونه‌ی کپی‌های کلیدی (برای استفاده در استوری‌های زیر)

| لحظه | نوع | متن پیشنهادی |
|---|---|---|
| اولین `/start` | Welcome | «به آشنایی خوش اومدی 👋 اینجا می‌تونی بدون این‌که کسی بفهمه تو کی هستی، با یه نفر جدید گپ بزنی. برای شروع، چند سؤال کوتاه ازت می‌پرسم.» |
| تعهد سن | Confirmation (حیاتی) | «آشنایی فقط برای افراد بالای ۱۸ ساله. با ادامه، تأیید می‌کنی که ۱۸ سال یا بیشتر داری.» دکمه‌ها: «تأیید می‌کنم، ۱۸+ هستم» / «انصراف» |
| در صف انتظار Match | Loading state | «داریم برات یه هم‌صحبت مناسب پیدا می‌کنیم… معمولاً چند دقیقه طول می‌کشه.» (نه بی‌نهایت "لطفاً صبر کنید" خشک) |
| Match پیدا شد | Success | «یه هم‌صحبت جدید پیدا شد! هویت هیچ‌کدومتون برای اون یکی نمایش داده نمی‌شه. هر وقت خواستی، می‌تونی گفتگو رو تموم کنی.» |
| هم‌صحبت گفتگو رو ترک کرد | Empty/neutral | «هم‌صحبتت از گفتگو خارج شد. می‌خوای هم‌صحبت بعدی رو پیدا کنیم؟» |
| گزارش کاربر — تأیید | Confirmation | «این کاربر گزارش می‌شه و گفتگو بلافاصله تمام می‌شه. تیم ما ظرف ۲۴ ساعت بررسی می‌کنه.» دکمه: «گزارش و پایان گفتگو» / «انصراف» |
| Rate limit پیام | Warning | «کمی سریع پیام می‌فرستی. چند ثانیه صبر کن و دوباره امتحان کن.» |
| بن موقت/دائم | Error (سخت‌ترین لحن، ولی محترمانه) | «دسترسی حساب تو به‌خاطر نقض قوانین آشنایی محدود شده. [مدت/دائم]. اگه فکر می‌کنی اشتباهیه، از دکمه‌ی زیر درخواست بازبینی بده.» |
| عکس رد شد (مدراسیون) | Error | «این عکس معیارهای آشنایی رو نداره و منتشر نشد. لطفاً یه عکس دیگه بفرست یا بدون عکس ادامه بده.» |

---

## ۹. ریسک‌ها و ملاحظات (قبل از شروع کدنویسی بخون)

- **ریسک محتوا/ایمنی (بحرانی):** هر پلتفرم چت-با-غریبه با امکان ارسال عکس، ریسک سوءاستفاده (آزار، محتوای غیرقانونی) داره. Epic 4 و 5 نباید عقب بیفتن یا "بعداً اضافه می‌کنیم" بشن — گزارش/بلاک باید از روز اول همراه چت باشه، نه فیچر جداگانه‌ی بعدی.
- **self-attestation سن کافی نیست:** تعهد ۱۸+ صرفاً یک لایه‌ست؛ باید با سیستم گزارش قوی و واکنش سریع تیم مدراسیون تقویت بشه (Epic 5).
- **دسترسی زیرساخت از ایران:** GitHub/Sentry/بعضی CDNها ممکنه از IP ایران محدود باشن. پیشنهاد: از GitLab self-hosted (که قبلاً استفاده می‌کردی) یا یک relay/runner خارج از ایران برای CI/CD استفاده کن.
- **پایداری اتصال به Telegram Bot API:** اگر فیلترینگ تلگرام در بازه‌هایی برای کاربران ایرانی پیش بیاد، این خارج از کنترل این پروژه‌ست، ولی از نظر فنی خود سرور شما (چه در ایران چه خارج) باید بتونه بدون وقفه به `api.telegram.org` وصل باشه — این رو به‌عنوان یک Open Question زیر گذاشتم چون ممکنه نیاز به یک relay/پراکسی خروجی مطمئن داشته باشی.
- **ملاحظات حقوقی/قانونی داخل ایران** برای یک سرویس چت-با-غریبه/آشنایی — این خارج از تخصص من به‌عنوان دستیار محصوله؛ توصیه می‌کنم قبل از عرضه‌ی عمومی با یک مشاور حقوقی محلی چک کنی (Open Question — Legal).

---

## ۱۰. ترتیب پیشنهادی برای دادن اپیک‌ها به Claude Code

قاعده‌ی کلی: **هر اپیک رو کامل با همه‌ی استوری‌هاش یک‌جا بده، صبر کن ران بشه/تست بشه/ریویو کنی، بعد برو سراغ اپیک بعدی.** توصیه می‌کنم بین اپیک‌ها یک کامیت جدا و یک پرامپت جدید به Claude Code بدی (context تمیز)، نه این‌که همه رو در یک session بریزی.

| ترتیب | اپیک | چرا الان و نه زودتر/دیرتر |
|---|---|---|
| 1 | EPIC 0 — Infrastructure & Project Foundation | بدون این، هیچ کد دیگه‌ای قابل اجرا نیست |
| 2 | EPIC 1 — Core Data Model & Backend API Skeleton | همه‌ی اپیک‌های بعدی به این schema وابسته‌ن |
| 3 | EPIC 2 — Bot Onboarding & Profile (Inline Keyboard) | اولین چیزی که باید "زنده" بشه تا قابل تست دستی باشه |
| 4 | EPIC 3 — Matching Engine (Swipe Queue) | روی پروفایل‌های Epic 2 کار می‌کنه |
| 5 | EPIC 4 — Anonymous Chat Relay + Baseline Safety (Report/Block/Next) | هسته‌ی اصلی محصول؛ safety پایه از همین‌جا اجباریه، نه اختیاری |
| 6 | EPIC 5 — Trust & Safety Hardening (Auto-moderation, Bans, Rate-limit) | بعد از این‌که relay کار می‌کنه، قبل از باز کردن دسترسی عمومی گسترده‌تر |
| 7 | EPIC 6 — Telegram Mini App (Next.js + Geist) | یک لایه‌ی UI اضافه روی API که تا اینجا پایدار شده |
| 8 | EPIC 7 — Admin Panel (Next.js) | به داده‌های Report/Ban از Epic 5 نیاز داره تا معنی داشته باشه |
| 9 | EPIC 8 — Analytics & Observability | بعد از این‌که فیچرها هستن، حالا باید بشه اندازه‌شون گرفت |
| 10 | EPIC 9 — Growth Backlog (Phase 2, فقط برای مرجع) | عمداً آخر و کم‌جزئیات — این‌ها بعد از یادگیری از v1 دوباره اسپک می‌شن |

---

# Epics & User Stories

> از این‌جا به بعد، عنوان اپیک‌ها، متن استوری‌ها و Acceptance Criteria به‌صورت کامل **انگلیسی** نوشته شده تا مستقیم قابل کپی به Claude Code باشه. توضیح فارسیِ زیر هر اپیک فقط برای خودته و لازم نیست کپی بشه.

---

## EPIC 0 — Infrastructure & Project Foundation

**فارسی:** پایه‌ی مانوریپو، Docker Compose کامل (postgres/redis/nginx/api/web-miniapp/web-admin/worker)، env management، و یک "hello world" روی هر سرویس که ثابت کنه همه به هم وصل می‌شن. هیچ منطق محصولی اینجا نیست.

**US-0.1 — Monorepo scaffolding**
As a developer, I want a monorepo structure (apps/bot-api, apps/web-miniapp, apps/web-admin, packages/db, packages/shared) so that code is organized and shareable across apps.
Acceptance Criteria:
- [ ] Monorepo uses a workspace tool (pnpm workspaces or Turborepo)
- [ ] `packages/db` exports the Prisma client and schema, importable by `apps/bot-api`
- [ ] `packages/shared` exports shared Zod schemas/types usable by both backend and frontend apps
- [ ] Root README documents how to install, run, and build each app locally

**US-0.2 — Docker Compose for local + production**
As a developer, I want a docker-compose setup for postgres, redis, api, worker, web-miniapp, web-admin, and nginx so that the whole stack runs with one command.
Acceptance Criteria:
- [ ] `docker-compose.yml` for production and `docker-compose.dev.yml` for local dev (with hot reload) both exist
- [ ] Postgres and Redis use named volumes so data survives container restarts
- [ ] All services start successfully with `docker compose up` on a clean machine
- [ ] Environment variables are injected via `.env` files, never hardcoded

**US-0.3 — Nginx reverse proxy skeleton**
As a developer, I want Nginx configured to route `/api/*` to the backend, `/` to the mini app, and `/admin/*` to the admin panel, with TLS termination, so that all services are reachable through one domain.
Acceptance Criteria:
- [ ] Nginx config routes each path prefix to the correct upstream container
- [ ] HTTPS is enforced (HTTP redirects to HTTPS) once a certificate is configured
- [ ] Basic rate-limiting zone is defined in Nginx for `/api/*` (to be tuned later in Epic 5)
- [ ] Gzip/Brotli compression enabled for static assets

**US-0.4 — Environment & secrets management**
As a developer, I want a documented, validated environment variable schema so that misconfiguration fails fast instead of causing silent bugs.
Acceptance Criteria:
- [ ] A Zod schema validates all required env vars at process startup; the process exits with a clear error if any are missing
- [ ] `.env.example` lists every variable with a one-line description
- [ ] Bot token, database URL, and Redis URL are never logged, even in debug mode

**US-0.5 — CI pipeline (build + typecheck + lint)**
As a developer, I want CI to run typecheck, lint, and unit tests on every push so that broken code cannot be merged.
Acceptance Criteria:
- [ ] Pipeline runs on every push/PR: install, typecheck, lint, test
- [ ] Pipeline fails the build if any step fails
- [ ] Pipeline is documented as either GitHub Actions or self-hosted GitLab CI (decision tracked in Open Questions)

**US-0.6 — Health check endpoints**
As an operator, I want a `/health` endpoint on the API that checks DB and Redis connectivity so that uptime monitoring can detect real failures.
Acceptance Criteria:
- [ ] `GET /health` returns 200 with `{db: "ok", redis: "ok"}` when both are reachable
- [ ] Returns 503 with details on which dependency failed, if any
- [ ] Endpoint is excluded from rate-limiting and authentication

---

## EPIC 1 — Core Data Model & Backend API Skeleton

**فارسی:** ساخت Prisma schema کامل (بخش ۶.۱ همین سند)، migration اول، و یک لایه‌ی API خیلی نازک (بدون منطق محصولی هنوز) که CRUD پایه‌ی User/Profile رو expose کنه — صرفاً تا Epic 2 روش بایسته.

**US-1.1 — Prisma schema for core entities**
As a developer, I want a Prisma schema covering User, Profile, SwipeAction, Match, ChatSession, Message, Report, Block, AdminUser, and BanRecord so that all future epics have a stable data foundation.
Acceptance Criteria:
- [ ] All entities from the "Data Model Overview" section exist with correct field types and relations
- [ ] `age` is never stored as a raw number that goes stale — store `birthDate` and derive age at query time
- [ ] Enums are used for status fields (e.g., `MatchStatus`, `ReportStatus`, `BanType`) instead of free strings
- [ ] Initial migration runs cleanly against a fresh Postgres instance

**US-1.2 — Seed script for local development**
As a developer, I want a seed script that creates sample users, matches, and reports so that I can develop and demo features without manually creating data through the bot.
Acceptance Criteria:
- [ ] Seed script creates at least 20 fake users with varied gender/age/interests
- [ ] Seed script creates a few active matches and a few ended ones
- [ ] Seed script creates at least one pending report for admin panel testing
- [ ] Seed script is idempotent (safe to re-run without duplicating data)

**US-1.3 — Internal API module structure**
As a developer, I want the backend split into clear modules (users, profiles, matching, chat, moderation, admin) so that bot handlers and REST endpoints share the same business logic instead of duplicating it.
Acceptance Criteria:
- [ ] Each module exposes a service layer (pure functions/classes) independent of Telegram or HTTP transport
- [ ] Bot handlers (grammY) call the same service functions that REST endpoints (Fastify, used by Mini App/Admin) call
- [ ] No business logic lives directly inside a grammY handler or a Fastify route handler — only orchestration

**US-1.4 — Telegram identity resolution middleware**
As a developer, I want a shared function that resolves a Telegram user (from bot context or from validated Mini App initData) into an internal `User` record, creating one if it doesn't exist, so that both surfaces authenticate consistently.
Acceptance Criteria:
- [ ] Given a valid Telegram bot update, the middleware returns the matching `User`, creating it on first contact
- [ ] Given a Mini App request, the middleware validates the `initData` HMAC signature before trusting any user info
- [ ] Given an invalid/forged `initData`, the request is rejected with 401 and no user is created or modified
- [ ] Telegram username/first name is never persisted in a way that gets shown to other users (only used for the user's own experience, e.g., admin panel display)

**US-1.5 — REST API skeleton for Mini App/Admin**
As a developer, I want a versioned REST API (`/api/v1/...`) with request validation and consistent error responses so that frontend apps have a predictable contract.
Acceptance Criteria:
- [ ] All endpoints validate input with Zod and return 400 with field-level errors on invalid input
- [ ] All error responses follow one consistent shape (`{error: {code, message}}`)
- [ ] OpenAPI or a generated type contract is available for the frontend to consume types from

---

## EPIC 2 — Telegram Bot: Onboarding & Profile (Inline Keyboard mode)

**فارسی:** این اپیک، حالت "ساده" رو زنده می‌کنه: کاربر با `/start` وارد میشه، با چند تا Inline Keyboard پروفایلش رو می‌سازه، و می‌تونه بعداً ویرایشش کنه — همه بدون خروج از چت تلگرام.

**US-2.1 — `/start` command & welcome flow**
As a first-time Telegram user, I want to see a warm welcome message with a clear next step when I run `/start`, so that I immediately understand what the bot does and what to do next.
Acceptance Criteria:
- [ ] `/start` shows the welcome copy (see UX Writing section) with an inline button "شروع ساخت پروفایل"
- [ ] If the user already has a complete profile, `/start` instead shows their main menu (Find a match / Edit profile / Settings)
- [ ] `/start` also sends the Mini App launch button (`web_app` inline button) alongside the inline-keyboard flow
- [ ] Returning users who ran `/start` mid-onboarding resume exactly where they left off, not from scratch

**US-2.2 — Age gate (18+ attestation)**
As a new user, I want to explicitly confirm I am 18 or older before anything else, so that the platform's age policy is enforced from the first interaction.
Acceptance Criteria:
- [ ] Age-gate message and two buttons ("تأیید می‌کنم، ۱۸+ هستم" / "انصراف") are shown before any other onboarding step
- [ ] Given the user taps "انصراف", the bot ends onboarding with a respectful message and does not create a profile
- [ ] Given the user taps "تأیید می‌کنم", the attestation timestamp is stored on the User record
- [ ] This step cannot be skipped or bypassed by sending arbitrary text instead of tapping the button

**US-2.3 — Gender & birth date collection**
As a new user, I want to select my gender and enter my birth date through simple inline buttons/prompts, so that matching can use this data.
Acceptance Criteria:
- [ ] Gender is selected via inline buttons (not free text) from a fixed set of options
- [ ] Birth date is collected via a guided prompt (e.g., three sequential inline pickers or a single formatted text input with validation)
- [ ] Given a birth date implying age under 18, the bot rejects it with a clear message and ends onboarding per the age policy
- [ ] Given invalid/unparseable input, the bot re-prompts with a specific example of the expected format

**US-2.4 — Bio & interests**
As a new user, I want to optionally write a short bio and pick a few interest tags, so that my profile feels more like "me" without revealing identity.
Acceptance Criteria:
- [ ] Bio has a max length (e.g., 300 characters) enforced with a clear message if exceeded
- [ ] Interests are picked from a predefined multi-select inline keyboard (not free text), max N selectable
- [ ] Both bio and interests are optional; the user can tap "رد شدن" to skip and still complete onboarding
- [ ] Bio text is passed through the profanity/keyword filter (see Epic 5) before being saved

**US-2.5 — Optional profile photo with moderation queue**
As a new user, I want to optionally add a profile photo, so that my card is more engaging during swiping, while trusting it will be checked before being shown to others.
Acceptance Criteria:
- [ ] Given the user sends a photo, it is stored and marked `photoModerationStatus = pending`
- [ ] The photo is not shown to any other user until moderation status becomes `approved`
- [ ] Given the user skips this step, their profile is still considered complete (photo is optional)
- [ ] Given a photo is rejected by moderation, the user receives the "عکس رد شد" copy and can upload a replacement

**US-2.6 — Profile completion confirmation & main menu**
As a user who finished onboarding, I want a clear confirmation and a main menu, so that I know what to do next.
Acceptance Criteria:
- [ ] Given all required fields (age-gate, gender, birth date) are set, the bot shows a summary card of the profile and a main menu: "پیدا کردن هم‌صحبت", "ویرایش پروفایل", "تنظیمات"
- [ ] The main menu is also reachable at any time via a `/menu` command
- [ ] Optional fields (bio/interests/photo) missing do not block reaching the main menu

**US-2.7 — Edit profile flow**
As an existing user, I want to edit any part of my profile (gender, birth date, bio, interests, photo) after onboarding, so that I can keep it current.
Acceptance Criteria:
- [ ] "ویرایش پروفایل" shows a menu of editable fields, each reusing the same input flow as onboarding
- [ ] Editing birth date re-validates the 18+ rule
- [ ] Editing a photo re-triggers moderation and hides the old photo until the new one is approved
- [ ] User cannot end up in an inconsistent state (e.g., partial edit saved without validation)

---

## EPIC 3 — Matching Engine (Swipe / Queue, Inline Keyboard mode)

**فارسی:** موتور تطبیق — صف Redis که پروفایل‌های مناسب رو بر اساس فیلترها به کاربر نشون می‌ده، Like/Pass می‌گیره، و وقتی Like متقابل شد یک Match می‌سازه که Epic 4 روش چت باز می‌کنه.

**US-3.1 — Match preference settings**
As a user, I want to set who I'm interested in seeing (gender, age range) so that the cards I get shown are relevant.
Acceptance Criteria:
- [ ] Preferences are editable from "تنظیمات" via inline buttons
- [ ] Default preferences are sensible (e.g., opposite of declared gender, age range ±5 years) but always overridable
- [ ] Preferences are validated (e.g., min age in range cannot be under 18)

**US-3.2 — Candidate queue generation**
As a user who taps "پیدا کردن هم‌صحبت", I want to be shown one candidate profile at a time that matches my preferences and hasn't been shown to me recently, so that browsing feels fresh.
Acceptance Criteria:
- [ ] Candidates are filtered by: matches the requester's stated preferences, requester matches the candidate's preferences, not already swiped by the requester, not blocked in either direction, `status = active` (not banned)
- [ ] Already-swiped candidates are not shown again within a rolling window (e.g., 30 days) even if re-queued
- [ ] Given no candidates are available, the bot shows an honest empty state (see UX copy) instead of an error or infinite loading
- [ ] Candidate selection logic lives in the matching service (Epic 1 module structure), not inline in the bot handler

**US-3.3 — Swipe actions (Like / Pass) via inline keyboard**
As a user viewing a candidate card, I want to tap Like or Pass, so that I can quickly express interest without typing.
Acceptance Criteria:
- [ ] Card shows: bio (if any), interests (if any), approved photo (if any) — never shows any Telegram identity field
- [ ] Tapping "Pass" records the swipe and immediately shows the next candidate
- [ ] Tapping "Like" records the swipe; if the candidate already liked this user, a Match is created (see US-3.4); otherwise, the next candidate is shown
- [ ] Double-tapping the same button rapidly does not create duplicate swipe records (idempotency)

**US-3.4 — Mutual like → Match creation**
As a user, I want to be notified immediately when a mutual like happens, so that I can start chatting right away.
Acceptance Criteria:
- Given user A already liked user B, when user B likes user A back, then a `Match` record is created with `status = active`
- Given a Match is created, then both users receive a "Match پیدا شد" notification in their chat with the bot, with a button to start chatting
- Given a Match already exists between two users, liking again does not create a duplicate Match
- [ ] Match creation and both notifications happen atomically enough that neither user is left without a notification if the other's message fails to send (log and retry, don't silently drop)

**US-3.5 — "Next" / skip during browsing**
As a user, I want a way to stop browsing at any time and return to the main menu, so that I'm never stuck in an endless swipe loop.
Acceptance Criteria:
- [ ] A persistent "بازگشت به منو" option is available during browsing
- [ ] Exiting browsing does not affect swipes already recorded

**US-3.6 — Rate limiting on swipes**
As a platform operator, I want swipe actions rate-limited per user, so that no single user can spam the matching system.
Acceptance Criteria:
- [ ] A user cannot exceed N swipes per minute (configurable); exceeding it shows the rate-limit copy
- [ ] Rate-limit counters are stored in Redis with a TTL, not in Postgres

---

## EPIC 4 — Anonymous Chat Relay + Baseline Safety

**فارسی:** قلب محصول. وقتی Match فعاله، پیام‌های دو طرف از طریق بات رله می‌شن بدون افشای هویت. گزارش/بلاک/پایان‌گفتگو باید همین‌جا و همزمان با relay ساخته بشن — نه فیچر بعدی.

**US-4.1 — Start chat session on active match**
As a matched user, I want to tap "شروع گفتگو" and immediately be in an active chat with my match, so that the transition from matching to chatting is seamless.
Acceptance Criteria:
- [ ] Tapping "شروع گفتگو" creates a `ChatSession` linked to the `Match` and shows the "Match پیدا شد" copy
- [ ] The bot enters a mode where the next messages from this user are treated as chat content, not commands (except explicit control commands like "پایان گفتگو")
- [ ] If a session is already active for this match, tapping the button again resumes it instead of creating a duplicate

**US-4.2 — Message relay (text)**
As a user in an active chat session, I want my text messages delivered to my anonymous match, so that we can have a conversation.
Acceptance Criteria:
- Given user A sends a text message while session is active, when the message passes moderation checks (Epic 5 keyword filter), then it is forwarded to user B as a new message from "the bot", never as a Telegram forward that would reveal A's identity
- [ ] Message latency from send to relay is under 2 seconds under normal load
- [ ] Messages are persisted in the `Message` table with sender, session, and timestamp for moderation/audit purposes
- [ ] Given the session has ended (by either party), further messages are not relayed and the sender is told the session is over

**US-4.3 — Message relay (photo, voice, sticker)**
As a user, I want to send photos, voice messages, and stickers to my match, so that the conversation isn't limited to text.
Acceptance Criteria:
- [ ] Photos and voice messages are re-uploaded/relayed by the bot (not forwarded) so no metadata pointing to the sender's Telegram account leaks
- [ ] Photos sent in-chat pass through the same moderation pipeline as profile photos before being relayed (async is acceptable, but the recipient must not see un-moderated content — hold and relay after a pass/fail decision, with a short "در حال بررسی…" state if needed)
- [ ] Stickers are relayed directly (low risk, no moderation delay needed)
- [ ] Unsupported message types (video, documents, location) receive a clear "این نوع پیام پشتیبانی نمی‌شه" response and are not relayed

**US-4.4 — End chat / "Next"**
As a user, I want to end the current chat at any time, so that I control my own experience.
Acceptance Criteria:
- [ ] "پایان گفتگو" ends the session for both users immediately; the other user is notified with the "هم‌صحبتت از گفتگو خارج شد" copy
- [ ] After ending, the user is offered "پیدا کردن هم‌صحبت بعدی" which re-enters the matching queue (Epic 3)
- [ ] Ended sessions are marked with `endedBy` and `endedReason` for later analysis

**US-4.5 — Report user (available at all times during chat)**
As a user, I want to report my match if something feels wrong, so that unsafe behavior gets reviewed.
Acceptance Criteria:
- [ ] A "گزارش" option is always available during an active chat session
- [ ] Reporting requires selecting a reason from a fixed list (harassment, unwanted content, suspected minor, spam, other) via inline buttons — not free text only, to make triage fast
- [ ] Given a report is submitted, the chat session ends immediately for both users and a `Report` record is created, linked to the session and its last N messages for context
- [ ] Reports with reason "suspected minor" or similar high-severity categories are flagged `severity = high` and surfaced to moderators immediately (see Epic 5)

**US-4.6 — Block user**
As a user, I want to block someone so that I never get matched with them again.
Acceptance Criteria:
- [ ] Blocking is available from the chat screen and ends the current session if one is active
- [ ] A blocked user is permanently excluded from the blocker's candidate queue (Epic 3) in both directions
- [ ] Blocking does not notify the blocked user (to avoid retaliation)

**US-4.7 — Idle session cleanup**
As a platform operator, I want chat sessions with no activity for a long time to auto-expire, so that stale sessions don't consume resources or confuse users.
Acceptance Criteria:
- [ ] A background job (BullMQ) ends sessions with no messages for more than a configurable idle period (e.g., 24 hours)
- [ ] Both users are notified their session ended due to inactivity, using neutral, non-blaming copy

---

## EPIC 5 — Trust & Safety Hardening

**فارسی:** بعد از این‌که relay پایه کار می‌کنه، این اپیک لایه‌های دفاعی رو تقویت می‌کنه: فیلتر کلمات، سیستم بن، صف مدراسیون برای عکس، و rate-limit سخت‌گیرانه‌تر روی پیام‌ها. این اپیک، دیتای لازم برای Admin Panel (Epic 7) رو هم آماده می‌کنه.

**US-5.1 — Keyword/profanity filter**
As a platform operator, I want messages and bios checked against a configurable banned-word/pattern list before being shown to anyone, so that clearly prohibited content is blocked automatically.
Acceptance Criteria:
- [ ] The filter list is stored in the database (or config) and editable without a code deploy
- [ ] Given a message matches a high-severity pattern (e.g., indicating a minor), the message is blocked, the session is auto-flagged for moderator review, and the sender is not shown a specific reason that would help them evade the filter
- [ ] Given a message matches a lower-severity pattern (e.g., generic profanity), it is blocked with the generic error copy and the sender can rephrase
- [ ] False-positive rate is monitored; the filter list is reviewable/editable from the Admin Panel (Epic 7)

**US-5.2 — Photo moderation queue**
As a moderator, I want an automated first pass on uploaded photos (NSFW/inappropriate detection) plus a manual review queue for anything flagged or uncertain, so that harmful images don't reach other users.
Acceptance Criteria:
- [ ] Every uploaded photo (profile or in-chat) goes through an automated classifier before `photoModerationStatus` can become `approved`
- [ ] Photos flagged by the classifier (or all photos, if no reliable classifier is available yet) enter a manual review queue visible in the Admin Panel
- [ ] A photo stays `pending` (not shown to anyone) until a decision is made
- [ ] Moderators can approve/reject with one click, and rejection triggers the "عکس رد شد" copy to the uploader

**US-5.3 — Report triage queue & SLA tracking**
As a moderator, I want all pending reports in one prioritized queue (high severity first), so that I can meet the response SLA (G3).
Acceptance Criteria:
- [ ] Reports are sorted by severity then by creation time (oldest first within the same severity)
- [ ] Each report shows: reporter (internal ID only), reported user's history (past reports/bans), reason, and relevant message context
- [ ] Moderators can resolve a report with an action: no action / warn / temporary ban / permanent ban
- [ ] Time-to-resolution is tracked per report for the G3 SLA metric

**US-5.4 — Ban system**
As a moderator, I want to issue temporary or permanent bans, so that repeat or severe offenders are removed from the platform.
Acceptance Criteria:
- Given a moderator issues a temporary ban, when the ban's `expiresAt` passes, then the user's `status` automatically reverts to `active` without manual intervention
- Given a moderator issues a permanent ban, when the banned user tries to interact with the bot, then they receive the ban copy and no further actions (matching, chatting) are possible
- [ ] All bans are logged with reason, issuing moderator, and timestamp for audit purposes
- [ ] A banned user's active chat sessions are ended immediately upon ban, and their match is notified via the neutral "left the chat" copy (not "this user was banned", to avoid revealing moderation actions to other users)

**US-5.5 — Ban appeal flow**
As a banned user, I want a way to request a review of my ban, so that mistaken or disputed bans can be reconsidered.
Acceptance Criteria:
- [ ] The ban message includes a button/command to submit an appeal (free text, limited length)
- [ ] Appeals appear in a separate Admin Panel queue from regular reports
- [ ] A user can submit at most one appeal per ban to prevent spam
- [ ] Appeal outcomes (upheld/reversed) are logged

**US-5.6 — Message-level rate limiting & spam detection**
As a platform operator, I want per-user message rate limits and basic spam-pattern detection (e.g., identical message sent to many different matches), so that the platform resists bot/spam abuse.
Acceptance Criteria:
- [ ] A user cannot exceed N messages per minute per session (configurable); exceeding it shows the rate-limit copy
- [ ] Sending the same message content to 3+ different active sessions within a short window flags the user for review
- [ ] Rate-limit and spam-flag logic lives in the moderation service, reusable by both bot and Mini App entry points

---

## EPIC 6 — Telegram Mini App (Next.js + Geist)

**فارسی:** لایه‌ی UI غنی‌تر که با همون بک‌اند کار می‌کنه. اینجا دقیقاً جاییه که Geist Design System معنی پیدا می‌کنه: فونت Geist Sans/Mono، پالت رنگی ink/gray-scale رسمی ورسل، و کامپوننت‌های shadcn/ui روی این توکن‌ها. حتماً قبل از پیاده‌سازی UI، Claude Code باید به‌ اسکیل `frontend-design` هم سر بزنه.

**US-6.1 — Mini App shell & Telegram SDK integration**
As a user who opens the Mini App, I want it to feel native inside Telegram (correct theme colors, safe-area handling, back button behavior), so that it doesn't feel like a random website.
Acceptance Criteria:
- [ ] App initializes `@telegram-apps/sdk` and reads Telegram theme params (dark/light) to set the initial theme
- [ ] Telegram's native BackButton is wired to in-app navigation instead of the browser back button
- [ ] `initData` is sent with every API request and validated server-side (reuses US-1.4)
- [ ] App gracefully shows an error state if opened outside of Telegram (per SDK's known behavior)

**US-6.2 — Geist design tokens setup**
As a developer, I want Geist fonts and design tokens (color, radius, spacing) configured as the Tailwind theme, so that every component in the Mini App and Admin Panel is visually consistent with Vercel's Geist system.
Acceptance Criteria:
- [ ] `geist` npm package is installed; `GeistSans`/`GeistMono` are applied at the root layout
- [ ] Tailwind theme config maps Geist's ink/gray-scale colors and spacing/radius scale as CSS variables
- [ ] shadcn/ui components are installed and themed with these tokens (no default shadcn slate/zinc palette left in place)
- [ ] Dark mode and light mode both render correctly using Telegram's theme signal from US-6.1

**US-6.3 — Profile creation/edit screens**
As a user, I want a richer form-based version of profile creation (same fields as Epic 2) in the Mini App, so that I can set up my profile with a better UI than inline keyboards.
Acceptance Criteria:
- [ ] All fields from Epic 2 (gender, birth date, bio, interests, photo) are editable here, using React Hook Form + Zod, sharing the same validation schema as the bot backend
- [ ] Saving from the Mini App updates the same `Profile` record the bot uses — no data divergence between surfaces
- [ ] The 18+ validation is enforced identically to the bot flow
- [ ] Photo upload shows a "در حال بررسی…" state while moderation is pending, consistent with Epic 5 status

**US-6.4 — Swipe deck UI**
As a user, I want a visual card-swipe interface (swipe or tap Like/Pass) in the Mini App, so that browsing candidates feels closer to a modern matching app.
Acceptance Criteria:
- [ ] Cards show the same data as the bot's card (US-3.3) — bio, interests, approved photo — no Telegram identity fields
- [ ] Swiping right = Like, left = Pass, with a clear tap-based alternative for accessibility
- [ ] Calls the same matching service endpoints as the bot flow — no separate matching logic implemented in the frontend
- [ ] Empty state (no candidates) matches the bot's empty-state tone, adapted for a visual layout

**US-6.5 — Active chat view**
As a user, I want to see and send messages to my current match inside the Mini App, so that I can chat with a richer UI than the Telegram chat itself.
Acceptance Criteria:
- [ ] Messages sync in near-real-time (polling via TanStack Query at a short interval, or a lightweight push mechanism if time allows)
- [ ] Sending text/photo/voice from the Mini App relays through the exact same backend relay logic as Epic 4 (no duplicate implementation)
- [ ] Report/Block actions are available here with the same confirmation copy as the bot
- [ ] A message sent from the Mini App and one sent from the bot chat for the same session appear correctly interleaved for both users, regardless of which surface each person uses

**US-6.6 — Settings screen**
As a user, I want to manage match preferences and account actions (delete account, view blocked users) from the Mini App, so that I have a full settings experience beyond what inline keyboards comfortably support.
Acceptance Criteria:
- [ ] Preferences (gender/age range) editable here update the same record used by Epic 3
- [ ] Blocked users list is viewable with an option to unblock
- [ ] "Delete account" requires explicit confirmation describing consequences (data deleted, cannot be undone) per the UX writing rules
- [ ] Deleting an account ends any active session and removes the user from future matching queues immediately

---

## EPIC 7 — Admin Panel (Next.js)

**فارسی:** پنل مدیریت جدا (روی همون توکن‌های Geist)، برای دو نقش: admin (دسترسی کامل) و moderator (فقط صف گزارش/بن). این اپیک به دیتای Epic 5 وابسته‌ست.

**US-7.1 — Admin authentication**
As an admin or moderator, I want to log in with a username/password, so that only authorized staff can access the panel.
Acceptance Criteria:
- [ ] Login uses NextAuth (Credentials provider) with bcrypt-hashed passwords stored in `AdminUser`
- [ ] Sessions expire after a configurable period of inactivity
- [ ] Failed login attempts are rate-limited to resist brute-force attempts
- [ ] Role (`admin`/`moderator`) is embedded in the session and enforced on every protected route

**US-7.2 — Report review queue UI**
As a moderator, I want a UI for the report triage queue from Epic 5 (US-5.3), so that I can review and act on reports without touching the database directly.
Acceptance Criteria:
- [ ] Queue view matches the sorting/prioritization defined in US-5.3
- [ ] Each report detail view shows reporter/reported history and message context, with one-click resolution actions
- [ ] Resolving a report updates its status and logs the acting moderator
- [ ] Moderator role can access this screen; both roles can, per US-1.4/7.1 role rules

**US-7.3 — Photo moderation queue UI**
As a moderator, I want a UI for the photo review queue from Epic 5 (US-5.2), so that I can approve/reject photos quickly.
Acceptance Criteria:
- [ ] Pending photos are shown in a grid with one-click approve/reject
- [ ] Rejecting requires no reason for internal ones but does trigger the user-facing rejection copy
- [ ] Queue updates in near-real-time as new photos arrive (polling is acceptable)

**US-7.4 — User management & ban actions**
As a moderator or admin, I want to search for a user and view their profile, history, and past reports, and issue a ban directly, so that I'm not limited to acting only from the report queue.
Acceptance Criteria:
- [ ] Search by internal user ID (never by raw Telegram ID exposed carelessly — access to identity-linking data should itself be role-gated)
- [ ] User detail view shows match/report/ban history
- [ ] Admin/moderator can issue temporary or permanent bans directly from this view, reusing the Epic 5 ban service
- [ ] Only `admin` role (not `moderator`) can reverse a permanent ban or delete a user record entirely

**US-7.5 — Banned-word list management**
As an admin, I want to view and edit the keyword/pattern filter list from Epic 5 (US-5.1) without a code deploy, so that the filter can be updated quickly as new evasion patterns appear.
Acceptance Criteria:
- [ ] Admin can add/edit/remove patterns and set their severity level
- [ ] Changes take effect for new messages without restarting the backend
- [ ] Only `admin` role can access this screen (not `moderator`, to limit who can weaken filters)

**US-7.6 — Dashboard: core metrics**
As an admin, I want a dashboard showing DAU, new signups, matches created, messages sent, and pending report count, so that I have a daily pulse on the platform.
Acceptance Criteria:
- [ ] Dashboard shows at least: DAU, new profiles today, matches created today, active chat sessions, pending reports count, pending photo-moderation count
- [ ] Each metric has a simple trend (e.g., last 7 days) visualization
- [ ] Dashboard loads within 2 seconds on typical data volumes for an early-stage product

**US-7.7 — Broadcast message tool**
As an admin, I want to send a one-off broadcast message to all active users (e.g., an announcement or policy update), so that I can communicate without manually messaging each user.
Acceptance Criteria:
- [ ] Broadcasts are queued (BullMQ) and sent with rate-limiting that respects Telegram's API limits, not sent all at once
- [ ] A preview is shown before sending, requiring explicit confirmation
- [ ] Delivery success/failure counts are shown after the broadcast completes
- [ ] Only `admin` role can trigger a broadcast

---

## EPIC 8 — Analytics, Observability & Notifications

**فارسی:** حالا که فیچرها هستن، این اپیک قابلیت اندازه‌گیری و مانیتورینگ عملیاتی اضافه می‌کنه.

**US-8.1 — Structured logging**
As an operator, I want structured JSON logs (via Pino) for all key events (signups, matches, reports, bans, errors), so that I can debug issues and audit behavior after the fact.
Acceptance Criteria:
- [ ] All services log in structured JSON with consistent fields (timestamp, level, service, event, userId when relevant)
- [ ] No PII beyond internal user IDs is logged (never raw Telegram username/phone in logs)
- [ ] Logs are shipped to a centralized location (e.g., Grafana Loki or equivalent self-hosted stack)

**US-8.2 — Metrics & dashboards (Prometheus + Grafana)**
As an operator, I want system-level metrics (request latency, error rate, queue depth, DB connection pool usage) visualized in Grafana, so that I can catch operational problems before users report them.
Acceptance Criteria:
- [ ] API exposes a `/metrics` endpoint in Prometheus format
- [ ] Grafana dashboards cover: request latency/error rate, BullMQ queue depth, Postgres/Redis health
- [ ] Basic alerting rules exist for critical thresholds (e.g., error rate spike, queue backlog growing unbounded)

**US-8.3 — Product event tracking**
As a product owner, I want key product events (signup completed, match created, chat ended, report submitted) tracked in a queryable event table, so that the Admin dashboard (US-7.6) and future analysis have real data.
Acceptance Criteria:
- [ ] An `Event` table (or equivalent) records event type, userId, timestamp, and minimal metadata
- [ ] Event tracking calls are added at each key point in the matching/chat/moderation services (not duplicated ad-hoc in handlers)
- [ ] Dashboard queries (US-7.6) read from this table rather than computing ad-hoc from operational tables

**US-8.4 — Idle/inactivity re-engagement notification**
As a user who hasn't opened the bot in a while, I want an occasional, respectful nudge (not spammy), so that I remember to come back.
Acceptance Criteria:
- [ ] A scheduled job identifies users inactive for a configurable period (e.g., 3 days) and sends at most one nudge per period
- [ ] Users can opt out of these notifications from Settings (Epic 6/2)
- [ ] Nudge copy follows the UX writing tone rules — no guilt-tripping or manipulative language

---

## EPIC 9 — Growth & Engagement Backlog (Phase 2 — reference only, out of v1 scope)

**فارسی:** این اپیک عمداً کم‌جزئیاته — فقط برای این‌که هنگام طراحی v1 معماری‌ای نسازیم که راه این‌ها رو ببنده. اسپک کامل هرکدوم بعد از یادگیری از v1 نوشته می‌شه.

- **US-9.1 (P2)** — Mutual identity reveal: both users opt in to reveal Telegram username after N messages exchanged.
- **US-9.2 (P2)** — Interest-weighted matching: prioritize candidates with overlapping interests instead of pure recency/filter matching.
- **US-9.3 (P2)** — "Boost" / premium visibility (ties into future monetization spec — Non-Goal A6).
- **US-9.4 (P2)** — AI-generated conversation starters shown after a match, to reduce awkward silence.
- **US-9.5 (P2)** — Daily streak / return-visit incentive mechanics.

---

## ۱۱. Success Metrics (خلاصه)

**Leading (روزها تا هفته‌ها):** نرخ تکمیل onboarding (G1)، نرخ خالی‌ماندن صف matching، نرخ استفاده از "Next"، نرخ گزارش به‌ازای هر ۱۰۰ چت.
**Lagging (هفته‌ها تا ماه‌ها):** بازگشت ۷۲ ساعته (G4)، میانگین تعداد چت در هفته به‌ازای کاربر فعال، نسبت کاربران بن‌شده به کل کاربران (باید پایین و رو به کاهش باشه).

## ۱۲. Open Questions

| سؤال | برای چه کسیه |
|---|---|
| CI/CD روی GitHub بمونه یا کامل به GitLab self-hosted منتقل بشه به‌خاطر ریسک دسترسی از ایران؟ | Engineering |
| آیا نیاز به مشاوره‌ی حقوقی محلی درباره‌ی مجاز بودن این نوع سرویس (چت ناشناس/آشنایی) در چارچوب قوانین ایران هست؟ | Legal / Stakeholder (خودت) |
| کلاسیفایر NSFW برای عکس (US-5.2) از یک API آماده استفاده بشه یا مدل self-hosted؟ گزینه‌های ابری ممکنه از ایران در دسترس نباشن. | Engineering |
| هدف عددی دقیق برای G2 (Time-to-first-match) و G4 (retention) چیه؟ بدون داده‌ی واقعی نمی‌شه قطعی گفت. | Data / Product (بعد از ۲ هفته‌ی اول) |
| اسم/برندینگ دقیق دکمه‌ی Mini App و توضیح کوتاهش در BotFather چی باشه؟ | Design (خودت) |

## ۱۳. Timeline Considerations

- بدون ددلاین قراردادی مشخص در این مرحله.
- وابستگی سخت: Epic 4 (Chat Relay) نباید بدون Epic 5 حداقلیِ safety (حتی نسخه‌ی خیلی ساده‌ی keyword filter + ban) به کاربران واقعی (غیر از تست داخلی) باز بشه.
- پیشنهاد فازبندی زمانی: Epic 0–5 = MVP قابل تست با یک گروه کوچک بسته (closed beta) فقط از طریق بات؛ Epic 6–8 = آماده‌سازی برای عرضه‌ی عمومی‌تر با Mini App و ابزار مدیریت.
