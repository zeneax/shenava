-- ═══════════════════════════════════════════════════════════════════════════
-- Shenava · seed
--
-- Run this after 01_schema.sql. It gives you two things:
--
--   1. The built-in proposal template — twelve sections, both languages.
--   2. THREE SAMPLE MEETINGS, already transcribed, already labelled by speaker,
--      already drafted. They exist so that a fresh fork shows you the whole
--      product on the first page load, BEFORE you have an OpenRouter key and
--      before you have recorded anything.
--
--      They are three on purpose, because one meeting cannot show the range a
--      draft has to survive. A bookshop where no figure was ever said; a
--      distributor where both sides named figures and settled the weeks; a law
--      firm where almost nothing was settled at all and the draft is mostly
--      open questions. Different engagements, different languages spoken, and
--      between them every one of the twelve sections both full and empty.
--
-- All three are entirely invented — «کتاب‌فروشی نیلگون» / "Nilgoon Books",
-- «پخش رها» and "Daftari & Partners" are fictional, as are the people, the
-- figures and the dates.
-- Delete them from the dashboard whenever you like — the delete button on a
-- meeting page removes it and its pieces.
--
-- Safe to run twice: everything here is keyed and conflicts are ignored.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── The built-in template ──────────────────────────────────────────────────
insert into public.shenava_templates (id, name, name_fa, engagement, is_default, sections, house_lines)
values (
  '11111111-1111-4111-8111-111111111111',
  'Standard proposal',
  'پیشنهاد استاندارد',
  'unknown',
  true,
  '[
    {"key":"summary","label_en":"Summary","label_fa":"خلاصهٔ پیشنهاد","kind":"text","brief":"two or three sentences — what the client needs, what the studio proposes, and what changes for them afterwards."},
    {"key":"understanding","label_en":"What we heard","label_fa":"درک ما از نیاز شما","kind":"lines","brief":"the client''s situation as THEY described it — their business, their team, their tools, what goes wrong today and what it costs them. Their words where you can; their numbers exactly."},
    {"key":"goals","label_en":"Goals of this engagement","label_fa":"اهداف این همکاری","kind":"lines","brief":"what the client wants to be true afterwards. Outcomes, not features."},
    {"key":"phases","label_en":"Phases and timeline","label_fa":"مراحل و زمان‌بندی","kind":"phases","brief":"the stages the CONSULTANT proposed and the client accepted, each with a title and a line of detail; \"when\" only if the meeting settled it. scheduleNote: one line on the overall timing, only if it was discussed."},
    {"key":"method","label_en":"How we work, together, and afterwards","label_fa":"روش اجرا، مشارکت و پشتیبانی","kind":"lines","brief":"how the studio will work — discovery, iterations, what the client''s side provides, how handover and support happen. From what the consultant said and the client agreed to."},
    {"key":"deliverables","label_en":"Deliverables","label_fa":"خروجی‌های تحویلی","kind":"lines","brief":"what the client will hold at the end, one per line, concrete."},
    {"key":"budget","label_en":"Budget and timing, as said","label_fa":"بودجه و زمان، آن‌طور که گفته شد","kind":"lines","brief":"ONLY what was actually said about money and time, by whom, in their terms. Never a figure the studio did not say or the client did not say."},
    {"key":"exclusions","label_en":"What is not in this proposal","label_fa":"آنچه در این پیشنهاد نیست","kind":"lines","brief":"what was named as out of scope, and what the client said should not change."},
    {"key":"assumptions","label_en":"Assumptions","label_fa":"پیش‌فرض‌ها","kind":"lines","brief":"what the studio would be relying on — accesses, data, a person on their side, a tool staying as it is — said or plainly implied."},
    {"key":"whyUs","label_en":"Why us","label_fa":"چرا ما","kind":"lines","optional":true,"brief":"why this studio and why this way — ONLY from what the consultant said in the room about how they work, what they have built before, or why they proposed it in this shape. Never a year count, a client list, a track record or a credential the meeting did not contain. If nothing of the kind was said, leave it empty: a studio''s standing lines belong on its template, not in a draft."},
    {"key":"nextSteps","label_en":"Next steps","label_fa":"گام‌های بعدی","kind":"lines","brief":"what the two sides agreed to do next, in order."},
    {"key":"openQuestions","label_en":"Open questions","label_fa":"پرسش‌های باز","kind":"lines","optional":true,"brief":"everything the meeting left unsettled that the proposal will need — as questions, one per line."}
  ]'::jsonb,
  '{"fa":[],"en":[]}'::jsonb
) on conflict (id) do nothing;

-- ── The sample meeting ─────────────────────────────────────────────────────
insert into public.shenava_meetings (
  id, title, client_name, language,
  audio_name, audio_bytes, audio_sha256, duration_ms, segment_count,
  status, transcript, dialogue, dialogue_model, dialogue_at,
  notes, notes_model, notes_at, draft_status, cost_usd, created_at
) values (
  '22222222-2222-4222-8222-222222222222',
  'Nilgoon Books — first consultation',
  'Nilgoon Books',
  'english',
  'sample-consultation.m4a', 4187392, '', 372000, 2,
  'transcribed',

  'Thanks for making the time. Before we talk about what we could build, tell me how the shop runs today. We have two people on the floor and me. The stock lives in a spreadsheet that my colleague updates on Saturdays, and the website is a page with our address and a phone number. Most orders come through Instagram direct messages. How many of those a day? Between fifteen and forty, depending on the week. And every one of them is a conversation — is this in stock, how much is postage, can you send it today. My colleague spends most of her shift answering the same four questions. So the cost is her shift, not the orders. Yes. And we lose orders at night because nobody answers until ten in the morning. Right. Two things are separable here. One is answering the four questions, which does not need anything clever — if the stock is in a place a program can read, a bot can answer stock and postage in a second, at three in the morning. The other is taking the order and the payment, which is a shop, and that is a bigger build. I would not do both at once. What would you do first? The stock. Not because it is the interesting part but because nothing else works without it — a bot that guesses at stock is worse than no bot. So the first phase is moving the spreadsheet into a real table your colleague still edits the same way, and then the bot reads it. How long? Three weeks for the stock and the bot, if the spreadsheet is as tidy as you say. Then we look at the shop. And the budget — I should say now that I do not have a number in mind. That is fine, I will put what we said in the proposal and we settle it after. What about the shop we already have? Nothing changes there. The page stays as it is, we do not touch your Instagram, and your colleague keeps her spreadsheet. If any of that has to change, the project has gone wrong. Good. One thing — we run a stall at the book fair in November and it would be good to have the bot by then. Noted, I will write that down as said rather than as a promise.',

  '{
    "consultant": {"name": "", "evidence": "separates the work into pieces and quotes three weeks"},
    "client": {"name": "Nilgoon Books", "evidence": "describes the shop, the spreadsheet and the message volume"},
    "turns": [
      {"who": "consultant", "text": "Thanks for making the time. Before we talk about what we could build, tell me how the shop runs today."},
      {"who": "client", "text": "We have two people on the floor and me. The stock lives in a spreadsheet that my colleague updates on Saturdays, and the website is a page with our address and a phone number. Most orders come through Instagram direct messages."},
      {"who": "consultant", "text": "How many of those a day?"},
      {"who": "client", "text": "Between fifteen and forty, depending on the week. And every one of them is a conversation — is this in stock, how much is postage, can you send it today. My colleague spends most of her shift answering the same four questions."},
      {"who": "consultant", "text": "So the cost is her shift, not the orders."},
      {"who": "client", "text": "Yes. And we lose orders at night because nobody answers until ten in the morning."},
      {"who": "consultant", "text": "Right. Two things are separable here. One is answering the four questions, which does not need anything clever — if the stock is in a place a program can read, a bot can answer stock and postage in a second, at three in the morning. The other is taking the order and the payment, which is a shop, and that is a bigger build. I would not do both at once."},
      {"who": "client", "text": "What would you do first?"},
      {"who": "consultant", "text": "The stock. Not because it is the interesting part but because nothing else works without it — a bot that guesses at stock is worse than no bot. So the first phase is moving the spreadsheet into a real table your colleague still edits the same way, and then the bot reads it."},
      {"who": "client", "text": "How long?"},
      {"who": "consultant", "text": "Three weeks for the stock and the bot, if the spreadsheet is as tidy as you say. Then we look at the shop."},
      {"who": "client", "text": "And the budget — I should say now that I do not have a number in mind."},
      {"who": "consultant", "text": "That is fine, I will put what we said in the proposal and we settle it after."},
      {"who": "client", "text": "What about the shop we already have?"},
      {"who": "consultant", "text": "Nothing changes there. The page stays as it is, we do not touch your Instagram, and your colleague keeps her spreadsheet. If any of that has to change, the project has gone wrong."},
      {"who": "client", "text": "Good. One thing — we run a stall at the book fair in November and it would be good to have the bot by then."},
      {"who": "consultant", "text": "Noted, I will write that down as said rather than as a promise."}
    ]
  }'::jsonb,
  'sample', now(),

  '{
    "facts": [
      "CLIENT: three people — the owner and two on the shop floor",
      "CLIENT: stock lives in a spreadsheet, updated on Saturdays by one colleague",
      "CLIENT: the website is one page with an address and a phone number",
      "CLIENT: most orders arrive as Instagram direct messages",
      "CLIENT: fifteen to forty messages a day depending on the week",
      "CLIENT: the same four questions — stock, postage, same-day sending",
      "CLIENT: nobody answers before ten in the morning, so night orders are lost",
      "CONSULTANT: answering the four questions needs no model if the stock is machine-readable",
      "CONSULTANT: taking orders and payment is a separate, larger build",
      "CONSULTANT: stock comes first — a bot that guesses at stock is worse than no bot",
      "CONSULTANT: three weeks for the stock table and the bot, if the spreadsheet is tidy",
      "CLIENT: no budget figure in mind, to be settled after the proposal",
      "CLIENT: the existing page, Instagram and the colleague''s spreadsheet must not change",
      "CLIENT: a book fair stall in November; the bot by then would be good"
    ],
    "en": {
      "title": "Stock table and an answering bot for Nilgoon Books",
      "engagement": "project",
      "summary": "Nilgoon Books answers fifteen to forty Instagram messages a day, most of them the same four questions, and loses the orders that arrive overnight. We propose putting the stock into a table a program can read and putting a bot in front of it, so stock and postage are answered in a second at any hour. Taking orders and payment is a separate, later build.",
      "understanding": [
        "Three people run the shop: you and two colleagues on the floor.",
        "Your stock lives in a spreadsheet one colleague updates each Saturday, and your website is a single page with an address and a phone number.",
        "Most orders arrive as Instagram direct messages — between fifteen and forty a day.",
        "Nearly all of them are the same four questions: is this in stock, what is the postage, can it go today.",
        "One colleague spends most of her shift answering them, and messages that arrive overnight wait until ten in the morning, by which time some of them are gone."
      ],
      "goals": [
        "The four routine questions are answered immediately, at any hour, without a person.",
        "Your colleague''s shift goes to customers in the shop rather than to repeated questions.",
        "An order that arrives at three in the morning is still there in the morning."
      ],
      "phases": [
        {"title":"Stock in a readable table","when":"","detail":"The spreadsheet becomes a table a program can read, edited exactly as it is edited today, so nothing about your colleague''s Saturday changes."},
        {"title":"The answering bot","when":"","detail":"A bot reads that table and answers stock, postage and same-day sending in the message thread, at any hour."},
        {"title":"Reviewing the shop","when":"","detail":"Once the first two are running, we look at taking orders and payment as its own piece of work."}
      ],
      "scheduleNote": "Three weeks for the stock table and the bot together, on the condition that the spreadsheet is as tidy as described.",
      "method": [
        "We start with your spreadsheet as it stands and build the table around it rather than asking you to change how you work.",
        "The bot is put in front of you before it is put in front of a customer, and you tell us where its answers are wrong.",
        "Your colleague keeps editing the stock the way she does now; nothing in her Saturday changes."
      ],
      "deliverables": [
        "A stock table your colleague edits as she edits the spreadsheet today.",
        "A bot on your Instagram messages that answers stock, postage and same-day sending.",
        "A short written note on what the bot answers and what it hands to a person."
      ],
      "budget": [
        "No figure was named in the meeting. You said you did not have a number in mind and that it would be settled after this proposal.",
        "The timing named was three weeks for the stock table and the bot together."
      ],
      "exclusions": [
        "Taking orders and taking payment are not in this proposal. They were discussed as a separate, larger piece of work to look at afterwards.",
        "Your existing website page is not changed.",
        "Your Instagram account is not restructured.",
        "Your colleague''s spreadsheet workflow is not replaced."
      ],
      "assumptions": [
        "The spreadsheet is consistent enough to import without cleaning it by hand.",
        "One person on your side is available for short questions during the three weeks.",
        "Access to the Instagram account for messaging is granted by you."
      ],
      "whyUs": [
        "We separate the work and do one piece first: a bot that guesses at stock is worse than no bot, and nothing else works until the stock is somewhere a program can read.",
        "What was said in the meeting is written down as it was said, not as a promise."
      ],
      "nextSteps": [
        "We send this proposal with a figure for the first two phases.",
        "You send us the spreadsheet as it stands so we can confirm the three weeks.",
        "We agree a start date."
      ]
    },
    "fa": {
      "title": "جدول موجودی و رباتِ پاسخ برای کتاب‌فروشی نیلگون",
      "engagement": "project",
      "summary": "کتاب‌فروشی نیلگون روزی پانزده تا چهل پیام اینستاگرام را جواب می‌دهد که بیشترشان همان چهار پرسش تکراری‌اند، و سفارش‌هایی که شب می‌رسند از دست می‌روند. پیشنهاد ما این است که موجودی در جدولی بنشیند که یک برنامه بتواند بخواند و رباتی جلوی آن قرار بگیرد، تا موجودی و هزینهٔ ارسال در هر ساعتی از شبانه‌روز در یک ثانیه جواب بگیرد. گرفتن سفارش و پرداخت کار جداگانه و بعدی است.",
      "understanding": [
        "سه نفر مغازه را می‌گردانند: شما و دو همکار در فروشگاه.",
        "موجودی شما در صفحه‌گسترده‌ای است که یکی از همکاران هر شنبه به‌روزش می‌کند، و وب‌سایت شما یک صفحه با نشانی و یک شمارهٔ تلفن است.",
        "بیشتر سفارش‌ها به شکل پیام مستقیم اینستاگرام می‌آیند — روزی پانزده تا چهل پیام.",
        "تقریباً همه‌شان همان چهار پرسش‌اند: موجود است، هزینهٔ ارسال چند است، امروز فرستاده می‌شود.",
        "بخش بیشتر شیفت یکی از همکاران به جواب‌دادن همین‌ها می‌گذرد، و پیامی که شب می‌رسد تا ساعت ده صبح منتظر می‌ماند و تا آن موقع بخشی از آن‌ها رفته‌اند."
      ],
      "goals": [
        "چهار پرسش تکراری بی‌درنگ و در هر ساعتی، بدون حضور یک نفر، جواب بگیرند.",
        "شیفت همکار شما به مشتری داخل مغازه برسد نه به پرسش‌های تکراری.",
        "سفارشی که ساعت سهِ بامداد می‌رسد، صبح هنوز سر جایش باشد."
      ],
      "phases": [
        {"title":"موجودی در جدولی خواندنی","when":"","detail":"صفحه‌گسترده به جدولی تبدیل می‌شود که یک برنامه بتواند بخواند، و ویرایشش دقیقاً همان است که امروز هست؛ پس چیزی در شنبهٔ همکار شما عوض نمی‌شود."},
        {"title":"رباتِ پاسخ","when":"","detail":"ربات همان جدول را می‌خواند و موجودی و هزینهٔ ارسال و ارسال همان‌روز را در خود گفت‌وگو جواب می‌دهد، در هر ساعتی."},
        {"title":"بازنگری فروشگاه","when":"","detail":"وقتی آن دو کار افتاد، گرفتن سفارش و پرداخت را به عنوان کاری مستقل بررسی می‌کنیم."}
      ],
      "scheduleNote": "سه هفته برای جدول موجودی و ربات با هم، به شرط آن‌که صفحه‌گسترده همان‌قدر مرتب باشد که گفته شد.",
      "method": [
        "از همان صفحه‌گستردهٔ فعلی شما شروع می‌کنیم و جدول را دور آن می‌سازیم، نه این‌که از شما بخواهیم روش کارتان را عوض کنید.",
        "ربات پیش از آن‌که جلوی مشتری برود جلوی خود شما می‌رود و شما می‌گویید کجا جوابش غلط است.",
        "همکار شما موجودی را همان‌طور که امروز ویرایش می‌کند ویرایش می‌کند؛ چیزی در شنبه‌اش عوض نمی‌شود."
      ],
      "deliverables": [
        "جدول موجودی، که همکار شما همان‌طور که امروز صفحه‌گسترده را ویرایش می‌کند ویرایشش می‌کند.",
        "رباتی روی پیام‌های اینستاگرام شما که موجودی و هزینهٔ ارسال و ارسال همان‌روز را جواب می‌دهد.",
        "یک یادداشت کوتاه نوشتاری از این‌که ربات چه چیزی را جواب می‌دهد و چه چیزی را به یک نفر می‌سپارد."
      ],
      "budget": [
        "در جلسه هیچ عددی گفته نشد. شما گفتید عددی در ذهن ندارید و پس از این پیشنهاد تعیین می‌شود.",
        "زمانی که گفته شد سه هفته بود، برای جدول موجودی و ربات با هم."
      ],
      "exclusions": [
        "گرفتن سفارش و دریافت پرداخت در این پیشنهاد نیست. در جلسه به عنوان کاری جداگانه و بزرگ‌تر مطرح شد که بعداً بررسی می‌شود.",
        "صفحهٔ فعلی وب‌سایت شما تغییر نمی‌کند.",
        "حساب اینستاگرام شما بازسازی نمی‌شود.",
        "روش کار همکار شما با صفحه‌گسترده جایگزین نمی‌شود."
      ],
      "assumptions": [
        "صفحه‌گسترده به اندازه‌ای یکدست است که بدون پاک‌سازی دستی وارد شود.",
        "یک نفر از طرف شما در آن سه هفته برای پرسش‌های کوتاه در دسترس است.",
        "دسترسی به پیام‌های حساب اینستاگرام از طرف شما داده می‌شود."
      ],
      "whyUs": [
        "کار را جدا می‌کنیم و یکی را اول می‌بریم: رباتی که موجودی را حدس بزند از نبودن ربات بدتر است، و تا موجودی جایی نباشد که یک برنامه بتواند بخواند، هیچ‌چیز دیگری کار نمی‌کند.",
        "آنچه در جلسه گفته شد همان‌طور که گفته شد نوشته می‌شود، نه به شکل یک قول."
      ],
      "nextSteps": [
        "این پیشنهاد را با عددی برای دو مرحلهٔ اول می‌فرستیم.",
        "شما صفحه‌گسترده را همان‌طور که هست می‌فرستید تا سه هفته را تأیید کنیم.",
        "تاریخ شروع را توافق می‌کنیم."
      ]
    },
    "openQuestions": {
      "en": [
        "What figure is acceptable for the stock table and the bot together?",
        "Which four questions exactly should the bot answer, and which should always reach a person?",
        "Is the November book fair a deadline or a preference?",
        "Who on your side owns the spreadsheet if your colleague is away?",
        "Does postage have fixed rates, or does it depend on the destination?"
      ],
      "fa": [
        "چه عددی برای جدول موجودی و ربات با هم پذیرفتنی است؟",
        "دقیقاً کدام چهار پرسش را ربات جواب بدهد و کدام همیشه به یک نفر برسد؟",
        "نمایشگاه کتاب آبان یک مهلت است یا یک ترجیح؟",
        "اگر همکار شما نبود، صفحه‌گسترده دست کیست؟",
        "هزینهٔ ارسال نرخ ثابت دارد یا به مقصد بستگی دارد؟"
      ]
    }
  }'::jsonb,
  'sample', now(), 'pending', 0, now()
) on conflict (id) do nothing;

insert into public.shenava_segments (meeting_id, idx, start_ms, end_ms, status, text, model, cost_usd, attempts, finished_at)
values
  ('22222222-2222-4222-8222-222222222222', 0,      0, 186000, 'done', '(sample)', 'sample', 0, 1, now()),
  ('22222222-2222-4222-8222-222222222222', 1, 186000, 372000, 'done', '(sample)', 'sample', 0, 1, now())
on conflict (meeting_id, idx) do nothing;

-- ── Second sample: numbers said out loud, timing settled, a refusal ───────
-- Persian, `project`. Everything the bookshop leaves untouched: figures from
-- BOTH sides, a `when` on every phase, the consultant declining what the
-- client asked for (AI forecasting on data that cannot carry it), and a piece
-- the client deferred. Its `budget` is full where the bookshop's is a shrug.
insert into public.shenava_meetings (
  id, title, client_name, language,
  audio_name, audio_bytes, audio_sha256, duration_ms, segment_count,
  status, transcript, dialogue, dialogue_model, dialogue_at,
  notes, notes_model, notes_at, draft_status, cost_usd, created_at
) values (
  '33333333-3333-4333-8333-333333333333',
  'پخش رها — جلسهٔ اول',
  'پخش مواد غذایی رها',
  'farsi',
  'raha-consultation.m4a', 7340032, '', 648000, 3,
  'transcribed',

  'ممنون که وقت گذاشتید. پیش از آن‌که دربارهٔ ساختن حرف بزنیم، بگویید پخش امروز چطور کار می‌کند. دوازده ویزیتور داریم، هر کدام یک منطقه. سفارش را روی کاغذ می‌نویسند یا در واتساپ برای دفتر می‌فرستند. یک نفر در دفتر همه را در اکسل وارد می‌کند و بعد به انبار می‌دهد. روزی چند سفارش؟ بین صد تا صد و پنجاه. شنبه‌ها بیشتر. آن یک نفر چقدر وقت می‌گذارد؟ تمام روزش، و تا شش عصر هم تمام نمی‌شود. اشتباه هم زیاد دارد؛ ماهی حدود سی سفارش غلط وارد می‌شود و بار اشتباه می‌رود. سی تا در ماه چه هزینه‌ای برایتان دارد؟ مرجوعی و حمل دوباره. ماهی حدود هجده میلیون تومان. من می‌خواهم یک هوش مصنوعی داشته باشیم که پیش‌بینی کند هر منطقه ماه بعد چقدر سفارش می‌دهد. نه. الان نه. پیش‌بینی به دو سال دادهٔ تمیز نیاز دارد و دادهٔ شما اکسلی است که ماهی سی خطا دارد. مدلی که روی این آموزش ببیند با اطمینان به شما دروغ می‌گوید، و آن از نداشتنش بدتر است. پس چه؟ ورود سفارش. ویزیتور سفارش را همان‌جا که ایستاده در یک فرم ثبت کند و همان فرم قیمت و موجودی را نشانش بدهد. آن وقت آن سی خطا تقریباً صفر می‌شود و آن یک نفر در دفتر آزاد می‌شود. و این هوش مصنوعی نمی‌خواهد. یک فرم است و یک جدول. هر چه ساده‌تر، کمتر خراب می‌شود. میانگین سنی ویزیتورهای ما بالاست. بعضی‌هایشان با گوشی راحت نیستند. پس فرم روی همان واتساپی بنشیند که امروز استفاده می‌کنند، نه یک اپلیکیشن تازه که باید نصب کنند. آن بهتر است. ولی واتساپ را کنار نمی‌گذاریم؛ ویزیتورها با مشتری‌ها همان‌جا حرف می‌زنند. کنار گذاشته نمی‌شود. سفارش از واتساپ به جدول می‌رود و گفت‌وگوها همان‌جا می‌ماند. بودجه چقدر می‌شود؟ برای ورود سفارش و جدول و اتصالش به انبار، صد و بیست میلیون تومان. داشبورد فروش سی میلیون بیشتر. ماهانه چطور؟ ترجیح می‌دهم ماهانه باشد تا یکجا. ماهی بیست میلیون تومان برای شش ماه، که پشتیبانی و تغییرها را هم شامل می‌شود. این را می‌پسندم. زمان‌بندی: هفتهٔ اول و دوم فرم و جدول. هفتهٔ سوم با دو ویزیتور آزمایش. هفتهٔ چهارم تا ششم بقیهٔ ده نفر. باید پیش از عید تمام شود. عید حدود دوازده هفتهٔ دیگر است؛ شش هفته جا دارد. انبار چه می‌شود؟ نرم‌افزار انبار ما قدیمی است و شرکتش دیگر وجود ندارد. دست نمی‌زنیم. جدول سفارش‌ها را در قالبی که همان نرم‌افزار می‌خواند بیرون می‌دهد. اگر مجبور شویم داخلش برویم، پروژه بد پیش رفته است. داشبورد فروش را فعلاً نمی‌خواهم. اول همین را ببینیم. باشد، می‌نویسم که خارج از این مرحله است. یک چیز دیگر: ما این کار را پیش‌تر برای یک پخش دارو انجام داده‌ایم و آنجا هم مسئله همین بود — مردم فرم تازه را پر نمی‌کنند اگر جای همیشگی‌شان نباشد. برای همین از واتساپ شروع می‌کنیم نه از یک اپ. منطقی است. و ما نتیجه را تضمین نمی‌کنیم. اگر ویزیتورها استفاده نکنند، خطا کم نمی‌شود. کاری که می‌کنیم این است که استفاده‌نکردن را سخت‌تر از استفاده‌کردن کنیم.',

  '{
  "turns": [
    {
      "who": "consultant",
      "text": "ممنون که وقت گذاشتید. پیش از آن‌که دربارهٔ ساختن حرف بزنیم، بگویید پخش امروز چطور کار می‌کند."
    },
    {
      "who": "client",
      "text": "دوازده ویزیتور داریم، هر کدام یک منطقه. سفارش را روی کاغذ می‌نویسند یا در واتساپ برای دفتر می‌فرستند. یک نفر در دفتر همه را در اکسل وارد می‌کند و بعد به انبار می‌دهد."
    },
    {
      "who": "consultant",
      "text": "روزی چند سفارش؟"
    },
    {
      "who": "client",
      "text": "بین صد تا صد و پنجاه. شنبه‌ها بیشتر."
    },
    {
      "who": "consultant",
      "text": "آن یک نفر چقدر وقت می‌گذارد؟"
    },
    {
      "who": "client",
      "text": "تمام روزش، و تا شش عصر هم تمام نمی‌شود. اشتباه هم زیاد دارد؛ ماهی حدود سی سفارش غلط وارد می‌شود و بار اشتباه می‌رود."
    },
    {
      "who": "consultant",
      "text": "سی تا در ماه چه هزینه‌ای برایتان دارد؟"
    },
    {
      "who": "client",
      "text": "مرجوعی و حمل دوباره. ماهی حدود هجده میلیون تومان."
    },
    {
      "who": "client",
      "text": "من می‌خواهم یک هوش مصنوعی داشته باشیم که پیش‌بینی کند هر منطقه ماه بعد چقدر سفارش می‌دهد."
    },
    {
      "who": "consultant",
      "text": "نه. الان نه. پیش‌بینی به دو سال دادهٔ تمیز نیاز دارد و دادهٔ شما اکسلی است که ماهی سی خطا دارد. مدلی که روی این آموزش ببیند با اطمینان به شما دروغ می‌گوید، و آن از نداشتنش بدتر است."
    },
    {
      "who": "client",
      "text": "پس چه؟"
    },
    {
      "who": "consultant",
      "text": "ورود سفارش. ویزیتور سفارش را همان‌جا که ایستاده در یک فرم ثبت کند و همان فرم قیمت و موجودی را نشانش بدهد. آن وقت آن سی خطا تقریباً صفر می‌شود و آن یک نفر در دفتر آزاد می‌شود."
    },
    {
      "who": "consultant",
      "text": "و این هوش مصنوعی نمی‌خواهد. یک فرم است و یک جدول. هر چه ساده‌تر، کمتر خراب می‌شود."
    },
    {
      "who": "client",
      "text": "میانگین سنی ویزیتورهای ما بالاست. بعضی‌هایشان با گوشی راحت نیستند."
    },
    {
      "who": "consultant",
      "text": "پس فرم روی همان واتساپی بنشیند که امروز استفاده می‌کنند، نه یک اپلیکیشن تازه که باید نصب کنند."
    },
    {
      "who": "client",
      "text": "آن بهتر است. ولی واتساپ را کنار نمی‌گذاریم؛ ویزیتورها با مشتری‌ها همان‌جا حرف می‌زنند."
    },
    {
      "who": "consultant",
      "text": "کنار گذاشته نمی‌شود. سفارش از واتساپ به جدول می‌رود و گفت‌وگوها همان‌جا می‌ماند."
    },
    {
      "who": "client",
      "text": "بودجه چقدر می‌شود؟"
    },
    {
      "who": "consultant",
      "text": "برای ورود سفارش و جدول و اتصالش به انبار، صد و بیست میلیون تومان. داشبورد فروش سی میلیون بیشتر."
    },
    {
      "who": "client",
      "text": "ماهانه چطور؟ ترجیح می‌دهم ماهانه باشد تا یکجا."
    },
    {
      "who": "consultant",
      "text": "ماهی بیست میلیون تومان برای شش ماه، که پشتیبانی و تغییرها را هم شامل می‌شود."
    },
    {
      "who": "client",
      "text": "این را می‌پسندم."
    },
    {
      "who": "consultant",
      "text": "زمان‌بندی: هفتهٔ اول و دوم فرم و جدول. هفتهٔ سوم با دو ویزیتور آزمایش. هفتهٔ چهارم تا ششم بقیهٔ ده نفر."
    },
    {
      "who": "client",
      "text": "باید پیش از عید تمام شود."
    },
    {
      "who": "consultant",
      "text": "عید حدود دوازده هفتهٔ دیگر است؛ شش هفته جا دارد."
    },
    {
      "who": "client",
      "text": "انبار چه می‌شود؟ نرم‌افزار انبار ما قدیمی است و شرکتش دیگر وجود ندارد."
    },
    {
      "who": "consultant",
      "text": "دست نمی‌زنیم. جدول سفارش‌ها را در قالبی که همان نرم‌افزار می‌خواند بیرون می‌دهد. اگر مجبور شویم داخلش برویم، پروژه بد پیش رفته است."
    },
    {
      "who": "client",
      "text": "داشبورد فروش را فعلاً نمی‌خواهم. اول همین را ببینیم."
    },
    {
      "who": "consultant",
      "text": "باشد، می‌نویسم که خارج از این مرحله است."
    },
    {
      "who": "consultant",
      "text": "یک چیز دیگر: ما این کار را پیش‌تر برای یک پخش دارو انجام داده‌ایم و آنجا هم مسئله همین بود — مردم فرم تازه را پر نمی‌کنند اگر جای همیشگی‌شان نباشد. برای همین از واتساپ شروع می‌کنیم نه از یک اپ."
    },
    {
      "who": "client",
      "text": "منطقی است."
    },
    {
      "who": "consultant",
      "text": "و ما نتیجه را تضمین نمی‌کنیم. اگر ویزیتورها استفاده نکنند، خطا کم نمی‌شود. کاری که می‌کنیم این است که استفاده‌نکردن را سخت‌تر از استفاده‌کردن کنیم."
    }
  ],
  "client": {
    "name": "پخش مواد غذایی رها",
    "evidence": "describes the business and what it costs today"
  },
  "consultant": {
    "name": "",
    "evidence": "proposes the stages and names the figures"
  }
}'::jsonb,
  'sample', now(),

  '{
  "en": {
    "goals": [
      "Reduce order-entry errors from about 30 a month to near zero.",
      "Free the office person who today spends the whole day on manual entry.",
      "Enter orders on the same WhatsApp visitors already use, without installing a new app.",
      "Keep working with the existing warehouse software without changing it.",
      "Finish the work before Nowruz."
    ],
    "title": "WhatsApp Order Entry for Raha Food Distribution",
    "whyUs": [
      "We have done this before for a pharmaceutical distributor, where the same issue held: people won''t fill a new form if it isn''t in their usual place, which is why we start from WhatsApp rather than a new app.",
      "We do not guarantee the outcome; if visitors don''t use it, errors won''t drop, but what we build is meant to make not using it harder than using it."
    ],
    "budget": [
      "Order entry, table, and warehouse connection: 120 million tomans.",
      "Sales dashboard, if added later: 30 million tomans more (out of scope for now).",
      "Monthly payment: 20 million tomans per month for six months, including support and changes."
    ],
    "method": [
      "The order form is built on the same WhatsApp visitors already use, not a new app.",
      "Orders move from WhatsApp straight into the table, while the visitor''s conversation with the customer stays in WhatsApp.",
      "The order table exports in a format the existing warehouse software can read, without changing that software.",
      "Work starts with a small pilot on two visitors before expanding to the rest.",
      "The six-month monthly fee includes support and changes over that period."
    ],
    "phases": [
      {
        "when": "Weeks 1-2",
        "title": "Order form and table",
        "detail": "Build the order form on WhatsApp and the table that holds orders and shows price and stock."
      },
      {
        "when": "Week 3",
        "title": "Pilot with two visitors",
        "detail": "Two visitors use the form to test how it works before rolling it out further."
      },
      {
        "when": "Weeks 4-6",
        "title": "Rollout to all visitors",
        "detail": "Set up the form for the remaining 10 visitors to cover the full team of 12."
      }
    ],
    "summary": "Raha Food Distribution currently takes orders on paper and WhatsApp, and one office person manually enters them all into Excel, producing about 30 errors a month and roughly 18 million tomans in returns and re-shipping costs. We will build an order form on the same WhatsApp where visitors show price and stock and submit the order on the spot, feeding automatically into a table synced with the warehouse software. Once running, the office person is freed and order-entry error drops to near zero.",
    "nextSteps": [
      "Raha accepted the six-week schedule and the monthly payment arrangement.",
      "Your Studio will record the sales dashboard in the proposal as a later phase, out of scope for now."
    ],
    "engagement": "project",
    "exclusions": [
      "The sales dashboard is not built in this phase; Raha preferred to see order entry work first.",
      "The warehouse software will not be changed.",
      "WhatsApp will not be abandoned as the visitor''s channel with customers.",
      "AI-based order forecasting is not done in this phase because clean, sufficient data does not exist for it."
    ],
    "assumptions": [
      "The existing warehouse software can read the order table''s export format.",
      "Visitors will use the same WhatsApp they already use today for order entry as well.",
      "Two visitors are available for the week-3 pilot."
    ],
    "deliverables": [
      "A WhatsApp order-entry form for all 12 visitors.",
      "A table holding all orders, showing price and stock.",
      "An order export in a format readable by the existing warehouse software."
    ],
    "scheduleNote": "The whole build is planned for six weeks to finish before Nowruz, which is about twelve weeks away.",
    "understanding": [
      "Raha Food Distribution has 12 visitors, each covering one region.",
      "Visitors write orders on paper or send them via WhatsApp to the office.",
      "One person in the office manually enters all orders into Excel and then passes them to the warehouse.",
      "Between 100 and 150 orders are placed daily, with more on Saturdays.",
      "Manual entry takes that person''s entire day and is not finished until 6pm.",
      "About 30 orders a month are entered incorrectly, sending the wrong goods to customers.",
      "These errors cost Raha about 18 million tomans a month in returns and re-shipping.",
      "The average age of visitors is high, and some are not comfortable with phones.",
      "Raha''s warehouse software is old and the company that built it no longer exists."
    ]
  },
  "fa": {
    "goals": [
      "کاهش خطای ثبت سفارش از حدود سی مورد در ماه به نزدیک صفر.",
      "آزاد شدن وقت آن یک نفر در دفتر که امروز تمام روز صرف ورود دستی می‌شود.",
      "ثبت سفارش در همان واتساپی که ویزیتورها امروز با آن کار می‌کنند، بدون نصب اپلیکیشن تازه.",
      "ادامهٔ کار با نرم‌افزار انبار موجود بدون تغییر در آن.",
      "تکمیل کار پیش از عید."
    ],
    "title": "سیستم ثبت سفارش ویزیتورها روی واتساپ برای پخش رها",
    "whyUs": [
      "ما پیش‌تر همین کار را برای یک پخش دارو انجام داده‌ایم؛ مسئله همان‌جا هم این بود که مردم فرم تازه را پر نمی‌کنند اگر جای همیشگی‌شان نباشد، و برای همین از واتساپ شروع می‌کنیم نه از یک اپلیکیشن تازه.",
      "ما نتیجه را تضمین نمی‌کنیم؛ اگر ویزیتورها استفاده نکنند خطا کم نمی‌شود، اما کاری که می‌کنیم استفاده‌نکردن را سخت‌تر از استفاده‌کردن می‌کند."
    ],
    "budget": [
      "ورود سفارش، جدول و اتصال آن به انبار: صد و بیست میلیون تومان.",
      "داشبورد فروش، در صورت افزودن بعدی: سی میلیون تومان بیشتر (فعلاً خارج از این مرحله).",
      "پرداخت ماهانه: بیست میلیون تومان در ماه برای شش ماه، شامل پشتیبانی و تغییرها."
    ],
    "method": [
      "فرم ثبت سفارش روی همان واتساپی که ویزیتورها امروز استفاده می‌کنند ساخته می‌شود، نه در یک اپلیکیشن تازه.",
      "سفارش از واتساپ مستقیم به جدول منتقل می‌شود و گفت‌وگوی ویزیتور با مشتری همان‌جا در واتساپ باقی می‌ماند.",
      "جدول سفارش‌ها در قالبی خروجی می‌گیرد که نرم‌افزار انبار موجود می‌تواند بخواند، بدون تغییر در آن نرم‌افزار.",
      "کار با یک آزمایش کوچک روی دو ویزیتور شروع می‌شود پیش از گسترش به بقیه.",
      "هزینهٔ ماهانهٔ شش‌ماهه شامل پشتیبانی و تغییرهای لازم در طول همین دوره است."
    ],
    "phases": [
      {
        "when": "هفتهٔ اول و دوم",
        "title": "فرم ثبت سفارش و جدول",
        "detail": "ساخت فرم سفارش روی واتساپ و جدولی که سفارش‌ها را نگه می‌دارد و قیمت و موجودی را نشان می‌دهد."
      },
      {
        "when": "هفتهٔ سوم",
        "title": "آزمایش با دو ویزیتور",
        "detail": "استفادهٔ دو ویزیتور از فرم برای سنجش کارکرد پیش از گسترش به بقیهٔ تیم."
      },
      {
        "when": "هفتهٔ چهارم تا ششم",
        "title": "گسترش به همهٔ ویزیتورها",
        "detail": "راه‌اندازی فرم برای ده ویزیتور باقی‌مانده تا تکمیل تیم دوازده‌نفره."
      }
    ],
    "summary": "پخش رها امروز سفارش‌ها را روی کاغذ و واتساپ می‌گیرد و یک نفر در دفتر آن‌ها را دستی در اکسل وارد می‌کند که ماهی حدود سی خطا و هجده میلیون تومان هزینهٔ مرجوعی و حمل دوباره ایجاد می‌کند. ما یک فرم ثبت سفارش روی همان واتساپ می‌سازیم که ویزیتور در محل مشتری قیمت و موجودی را می‌بیند و سفارش را مستقیم ثبت می‌کند، و این سفارش به‌صورت خودکار در جدولی می‌نشیند که با نرم‌افزار انبار هماهنگ است. پس از اجرا، آن یک نفر در دفتر آزاد می‌شود و خطای ورود سفارش تقریباً به صفر می‌رسد.",
    "nextSteps": [
      "پخش رها زمان‌بندی شش‌هفته‌ای و پرداخت ماهانه را پذیرفت.",
      "استودیوی شما داشبورد فروش را در پیشنهاد به‌عنوان مرحلهٔ بعدی و خارج از محدودهٔ فعلی ثبت می‌کند."
    ],
    "engagement": "project",
    "exclusions": [
      "داشبورد فروش در این مرحله انجام نمی‌شود؛ پخش رها ترجیح داد اول ورود سفارش را ببیند.",
      "نرم‌افزار انبار تغییر نمی‌کند.",
      "واتساپ به‌عنوان ابزار ارتباط ویزیتور با مشتری کنار گذاشته نمی‌شود.",
      "پیش‌بینی سفارش با هوش مصنوعی در این مرحله انجام نمی‌شود چون داده تمیز و کافی برای آن وجود ندارد."
    ],
    "assumptions": [
      "نرم‌افزار انبار موجود می‌تواند قالب خروجی جدول سفارش‌ها را بخواند.",
      "ویزیتورها همان واتساپی که امروز استفاده می‌کنند را برای ثبت سفارش هم به کار می‌برند.",
      "دو ویزیتور برای آزمایش هفتهٔ سوم در دسترس هستند."
    ],
    "deliverables": [
      "فرم ثبت سفارش روی واتساپ برای هر دوازده ویزیتور.",
      "جدولی که همهٔ سفارش‌ها را نگه می‌دارد و قیمت و موجودی را نشان می‌دهد.",
      "خروجی سفارش‌ها در قالب قابل خوانش برای نرم‌افزار انبار موجود."
    ],
    "scheduleNote": "کل کار در شش هفته برنامه‌ریزی شده تا پیش از عید، که حدود دوازده هفتهٔ دیگر است، به پایان برسد.",
    "understanding": [
      "پخش رها دوازده ویزیتور دارد که هر کدام یک منطقه را پوشش می‌دهند.",
      "ویزیتورها سفارش را روی کاغذ می‌نویسند یا در واتساپ برای دفتر می‌فرستند.",
      "یک نفر در دفتر همهٔ سفارش‌ها را دستی در اکسل وارد می‌کند و سپس به انبار می‌دهد.",
      "روزانه بین صد تا صد و پنجاه سفارش ثبت می‌شود و شنبه‌ها تعداد بیشتر است.",
      "ورود دستی تمام روز آن یک نفر را می‌گیرد و تا شش عصر هم تمام نمی‌شود.",
      "ماهی حدود سی سفارش به اشتباه وارد می‌شود و بار اشتباه به مشتری می‌رود.",
      "این خطاها ماهی حدود هجده میلیون تومان هزینهٔ مرجوعی و حمل دوباره برای پخش رها دارد.",
      "میانگین سنی ویزیتورها بالاست و بعضی از آن‌ها با گوشی و اپلیکیشن‌های تازه راحت نیستند.",
      "نرم‌افزار انبار پخش رها قدیمی است و شرکت سازنده‌اش دیگر فعال نیست."
    ]
  },
  "facts": [
    "CLIENT: پخش مواد غذایی رها has 12 visitors (ویزیتور), each covering one region.",
    "CLIENT: orders are written on paper or sent via WhatsApp to the office.",
    "CLIENT: one person in the office manually enters all orders into Excel, then hands them to the warehouse.",
    "CLIENT: between 100 and 150 orders per day; more on Saturdays.",
    "CLIENT: that one person spends the whole day on entry, not finished until 6pm.",
    "CLIENT: about 30 orders per month are entered incorrectly, causing wrong shipments.",
    "CLIENT: those errors cost about 18 million tomans per month in returns and re-shipping.",
    "CLIENT: wants an AI to forecast next month''s orders per region.",
    "CONSULTANT: declined the forecasting request; forecasting needs two years of clean data, client''s data has 30 errors/month, a model trained on it would confidently mislead, worse than having none.",
    "CONSULTANT: proposed order entry instead — visitor fills a form on the spot showing price and inventory.",
    "CONSULTANT: this brings the 30 monthly errors to near zero and frees the office person.",
    "CONSULTANT: this doesn''t need AI, just a form and a table; simpler breaks less.",
    "CLIENT: visitors'' average age is high, some are not comfortable with phones.",
    "CONSULTANT: form should live on the WhatsApp they already use, not a new app to install.",
    "CLIENT: agrees WhatsApp is better, but won''t abandon WhatsApp since visitors talk to customers there.",
    "CONSULTANT: WhatsApp isn''t abandoned; the order goes from WhatsApp into the table, conversations stay in WhatsApp.",
    "CONSULTANT: budget for order entry + table + warehouse connection: 120 million tomans.",
    "CONSULTANT: sales dashboard: 30 million tomans more.",
    "CLIENT: asked about monthly payment, prefers monthly over lump sum.",
    "CONSULTANT: 20 million tomans/month for 6 months, includes support and changes.",
    "CLIENT: agreed to this monthly arrangement.",
    "CONSULTANT: schedule — weeks 1-2 form and table; week 3 test with 2 visitors; weeks 4-6 remaining 10 visitors.",
    "CLIENT: must finish before Nowruz (عید).",
    "CONSULTANT: Nowruz is about 12 weeks away; 6 weeks fits.",
    "CLIENT: warehouse software is old and its maker no longer exists.",
    "CONSULTANT: won''t touch the warehouse software; order table exports in a format it can read; going inside it would mean the project went badly.",
    "CLIENT: doesn''t want the sales dashboard for now, wants to see order entry work first.",
    "CONSULTANT: will note dashboard as out of scope for this phase.",
    "CONSULTANT: has done this before for a pharma distributor, same issue — people won''t fill a new form if it''s not their usual place; hence starting from WhatsApp not an app.",
    "CLIENT: found that reasonable.",
    "CONSULTANT: no guarantee on results; if visitors don''t use it, errors won''t drop; the aim is to make not-using harder than using."
  ],
  "openQuestions": {
    "en": [
      "Which two visitors will take part in the week-3 pilot?",
      "What is the exact export format needed to connect with the existing warehouse software?",
      "Will the sales dashboard be added later, and on what timeline?",
      "What exact date does week 1 of the project begin?"
    ],
    "fa": [
      "دو ویزیتور برای آزمایش هفتهٔ سوم چه کسانی خواهند بود؟",
      "قالب دقیق خروجی برای اتصال به نرم‌افزار انبار موجود چیست؟",
      "آیا داشبورد فروش در آینده اضافه خواهد شد و با چه زمان‌بندی؟",
      "شروع دقیق پروژه (هفتهٔ اول) از چه تاریخی خواهد بود؟"
    ]
  }
}'::jsonb,
  'sample', now(), 'pending', 0, now()
) on conflict (id) do nothing;

insert into public.shenava_segments (meeting_id, idx, start_ms, end_ms, status, text, model, cost_usd, attempts, finished_at)
values
  ('33333333-3333-4333-8333-333333333333', 0, 0, 216000, 'done', '(sample)', 'sample', 0, 1, now()),
  ('33333333-3333-4333-8333-333333333333', 1, 216000, 432000, 'done', '(sample)', 'sample', 0, 1, now()),
  ('33333333-3333-4333-8333-333333333333', 2, 432000, 648000, 'done', '(sample)', 'sample', 0, 1, now())
on conflict (meeting_id, idx) do nothing;

-- ── Third sample: a meeting that settles almost nothing ───────────────────
-- English, `training`. The shape a consultation usually has and the other two
-- do not: a price given as a range, no date anywhere, six open questions, and
-- exclusions the CLIENT set as conditions rather than the studio as scope.
-- A draft is still worth having. That is the point of keeping it here.
insert into public.shenava_meetings (
  id, title, client_name, language,
  audio_name, audio_bytes, audio_sha256, duration_ms, segment_count,
  status, transcript, dialogue, dialogue_model, dialogue_at,
  notes, notes_model, notes_at, draft_status, cost_usd, created_at
) values (
  '44444444-4444-4444-8444-444444444444',
  'Daftari & Partners — AI use in the firm',
  'Daftari & Partners',
  'english',
  'daftari-consultation.m4a', 5505024, '', 521000, 2,
  'transcribed',

  'You said on the phone that your people are already using these tools and you want to get ahead of it. That is the situation. We have thirty-one fee earners. I know for a fact that at least a dozen are pasting draft clauses into a chatbot. Nobody told them to and nobody told them not to. Do you know which tool? No. That is part of the problem. Has anything gone wrong yet? Not that we know of. Which is not the same as nothing having gone wrong. It is not. What is the worst case? A client''s unredacted contract sitting on somebody''s server in another country, and us hearing about it from the client. Then the training is not about prompting. It is about what may leave the building and what may not, and giving them something that is allowed so they stop reaching for what is not. We do not have an allowed thing yet. That is a separate piece of work and I would not fold it into the training. The training can teach the rule and the judgement; it cannot teach a tool you have not chosen. How long would the training be? For thirty people, two half-days a week apart rather than one full day, so they try it on real work in between and bring back what broke. A single day teaches less than people expect. Our partners will not sit through two half-days. Then a separate hour for the partners on the risk and the policy, and the two half-days for the fee earners. That could work. Who writes the policy? You do, with us in the room. A policy we write alone is a policy your people did not agree to. What does it cost? Somewhere between forty and sixty million toman, depending on whether the policy work is one session or three. I would rather give you a figure after I have read your engagement letters, because they may already say something about confidentiality that we should not contradict. Send me the range and I will take it to the management committee. I cannot commit today. Understood. One thing that is not negotiable. Client data does not go to any service we have not approved. Not for the training, not for the examples, not for anything. The exercises use invented matters. Your documents never leave your machines — including ours. And we are not replacing anyone. If this turns into a headcount conversation I will stop it. It is not that conversation. I will write that down. One more thing. We have run this for two other firms. Both times the useful part was not the teaching — it was the list the room produced of what people were already doing, which nobody had written down before. That I would like to see. When would you want to run it? After the committee meets. I do not know when that is.',

  '{
  "turns": [
    {
      "who": "consultant",
      "text": "You said on the phone that your people are already using these tools and you want to get ahead of it."
    },
    {
      "who": "client",
      "text": "That is the situation. We have thirty-one fee earners. I know for a fact that at least a dozen are pasting draft clauses into a chatbot. Nobody told them to and nobody told them not to."
    },
    {
      "who": "consultant",
      "text": "Do you know which tool?"
    },
    {
      "who": "client",
      "text": "No. That is part of the problem."
    },
    {
      "who": "consultant",
      "text": "Has anything gone wrong yet?"
    },
    {
      "who": "client",
      "text": "Not that we know of. Which is not the same as nothing having gone wrong."
    },
    {
      "who": "consultant",
      "text": "It is not. What is the worst case?"
    },
    {
      "who": "client",
      "text": "A client''s unredacted contract sitting on somebody''s server in another country, and us hearing about it from the client."
    },
    {
      "who": "consultant",
      "text": "Then the training is not about prompting. It is about what may leave the building and what may not, and giving them something that is allowed so they stop reaching for what is not."
    },
    {
      "who": "client",
      "text": "We do not have an allowed thing yet."
    },
    {
      "who": "consultant",
      "text": "That is a separate piece of work and I would not fold it into the training. The training can teach the rule and the judgement; it cannot teach a tool you have not chosen."
    },
    {
      "who": "client",
      "text": "How long would the training be?"
    },
    {
      "who": "consultant",
      "text": "For thirty people, two half-days a week apart rather than one full day, so they try it on real work in between and bring back what broke. A single day teaches less than people expect."
    },
    {
      "who": "client",
      "text": "Our partners will not sit through two half-days."
    },
    {
      "who": "consultant",
      "text": "Then a separate hour for the partners on the risk and the policy, and the two half-days for the fee earners."
    },
    {
      "who": "client",
      "text": "That could work. Who writes the policy?"
    },
    {
      "who": "consultant",
      "text": "You do, with us in the room. A policy we write alone is a policy your people did not agree to."
    },
    {
      "who": "client",
      "text": "What does it cost?"
    },
    {
      "who": "consultant",
      "text": "Somewhere between forty and sixty million toman, depending on whether the policy work is one session or three. I would rather give you a figure after I have read your engagement letters, because they may already say something about confidentiality that we should not contradict."
    },
    {
      "who": "client",
      "text": "Send me the range and I will take it to the management committee. I cannot commit today."
    },
    {
      "who": "consultant",
      "text": "Understood."
    },
    {
      "who": "client",
      "text": "One thing that is not negotiable. Client data does not go to any service we have not approved. Not for the training, not for the examples, not for anything."
    },
    {
      "who": "consultant",
      "text": "The exercises use invented matters. Your documents never leave your machines — including ours."
    },
    {
      "who": "client",
      "text": "And we are not replacing anyone. If this turns into a headcount conversation I will stop it."
    },
    {
      "who": "consultant",
      "text": "It is not that conversation. I will write that down."
    },
    {
      "who": "consultant",
      "text": "One more thing. We have run this for two other firms. Both times the useful part was not the teaching — it was the list the room produced of what people were already doing, which nobody had written down before."
    },
    {
      "who": "client",
      "text": "That I would like to see."
    },
    {
      "who": "consultant",
      "text": "When would you want to run it?"
    },
    {
      "who": "client",
      "text": "After the committee meets. I do not know when that is."
    }
  ],
  "client": {
    "name": "Daftari & Partners",
    "evidence": "describes the business and what it costs today"
  },
  "consultant": {
    "name": "",
    "evidence": "proposes the stages and names the figures"
  }
}'::jsonb,
  'sample', now(),

  '{
  "en": {
    "goals": [
      "Clarity on what data may leave the firm and what may not.",
      "An approved tool for staff to use instead of unknown ones.",
      "A written policy that the firm''s own people helped write and have agreed to.",
      "Partners informed of the risks without sitting through the full training."
    ],
    "title": "AI Use Training and Policy for Daftari & Partners",
    "whyUs": [
      "We have run this training for two other firms; in both cases, the most valuable output was not the teaching itself but the list the room produced of existing practices, which had never been written down before.",
      "We do not write the usage policy alone, because a policy staff did not help write is a policy they will not agree to."
    ],
    "budget": [
      "The cost falls between forty and sixty million toman, depending on whether the policy work is one session or three.",
      "A firm figure will be given after reviewing the firm''s engagement letters with its clients.",
      "Daftari & Partners will take this range to its management committee and could not commit at the meeting."
    ],
    "method": [
      "Training exercises use invented matters, not real client files.",
      "Firm documents never leave the firm''s own machines, including in dealings with us.",
      "The firm writes the usage policy itself, with us present; a policy we write alone is one the firm''s own people have not agreed to.",
      "Selecting the approved tool is separate work and is not folded into this training."
    ],
    "phases": [
      {
        "when": "",
        "title": "Partner session",
        "detail": "A separate one-hour session for partners, focused on risk and policy, without requiring attendance at the full training."
      },
      {
        "when": "",
        "title": "Policy drafting",
        "detail": "The firm writes the usage policy with us in the room; this runs as one session or three, depending on the firm''s decision."
      },
      {
        "when": "",
        "title": "Fee earner training",
        "detail": "Two half-days, a week apart, for around thirty people, so staff can try the material on real work between sessions and bring back what broke."
      }
    ],
    "summary": "Daftari & Partners has found that at least a dozen of its thirty-one fee earners are pasting draft clauses into a chatbot with no guidance either way. We propose a two-part training for fee earners and a separate session for partners, together with a session or sessions to write a usage policy with the firm''s own participation. Afterwards, the firm will hold a written, agreed policy for what may and may not leave the building.",
    "nextSteps": [
      "We will review the firm''s engagement letters with its clients.",
      "We will send the cost range to Daftari & Partners.",
      "Daftari & Partners will take the range to its management committee.",
      "Once the committee has decided, scheduling for the sessions and training will be set."
    ],
    "engagement": "training",
    "exclusions": [
      "Choosing the approved tool is not part of this training and is separate work.",
      "This work does not replace any staff member; the firm will stop it if it turns into a headcount conversation.",
      "No client data is sent to any unapproved service, not for the training, not for the examples, not for anything else."
    ],
    "assumptions": [
      "The firm''s engagement letters with its clients will be reviewed before a final figure is given.",
      "Those letters may already address confidentiality, and the new policy should not contradict them.",
      "The firm will not select an approved tool before the training runs; the training teaches rule and judgement, not a specific tool."
    ],
    "deliverables": [
      "A written policy on what may and may not leave the firm.",
      "Two half-day training sessions delivered to the firm''s fee earners.",
      "A one-hour session delivered to the partners.",
      "A written list of how fee earners are currently using AI tools, compiled during the training."
    ],
    "scheduleNote": "Exact timing depends on when the firm''s management committee meets, which had not yet been scheduled.",
    "understanding": [
      "Daftari & Partners has thirty-one fee earners.",
      "At least a dozen of them are pasting draft clauses into a chatbot.",
      "Nobody has told them to use it, and nobody has told them not to.",
      "The firm does not know which tool is being used.",
      "Nothing has been reported as going wrong yet, but that is not the same as nothing having gone wrong.",
      "The firm''s worst case is a client''s unredacted contract sitting on a server in another country, and the firm hearing about it from the client itself.",
      "The firm does not yet have an approved tool for this kind of work."
    ]
  },
  "fa": {
    "goals": [
      "روشن شدن این‌که چه داده‌ای مجاز است از دفتر خارج شود و چه داده‌ای مجاز نیست.",
      "داشتن ابزاری مجاز که کارکنان به‌جای ابزارهای ناشناخته از آن استفاده کنند.",
      "سیاستی مکتوب که خود کارکنان در تدوین آن مشارکت داشته باشند و آن را پذیرفته باشند.",
      "آگاهی شرکا از ریسک‌های موجود بدون نیاز به نشستن در دو نیم‌روز آموزشی."
    ],
    "title": "آموزش و سیاست استفاده از هوش مصنوعی برای دفتری و شرکا",
    "whyUs": [
      "ما این آموزش را پیش‌تر برای دو دفتر دیگر برگزار کرده‌ایم؛ در هر دو مورد، ارزشمندترین خروجی خود آموزش نبود، بلکه فهرستی بود که در جریان آن از رویه‌های موجود کارکنان تهیه شد و پیش از آن هرگز مکتوب نشده بود.",
      "سیاست استفاده را به‌تنهایی نمی‌نویسیم، چون سیاستی که کارکنان در نوشتنش شریک نبوده‌اند، سیاستی است که پذیرفته نمی‌شود."
    ],
    "budget": [
      "هزینه بین چهل تا شصت میلیون تومان است، بسته به این‌که کار سیاست‌نویسی در یک نشست یا سه نشست انجام شود.",
      "رقم قطعی پس از بررسی قراردادهای همکاری (engagement letters) دفتر با مشتریان ارائه می‌شود.",
      "دفتری و شرکا این بازه را به کمیتهٔ مدیریت خود می‌برد و امکان تعهد در همان جلسه وجود نداشت."
    ],
    "method": [
      "تمرین‌های آموزشی بر پروندهٔ ساخته‌شده و فرضی انجام می‌شود، نه پروندهٔ واقعی مشتریان.",
      "اسناد دفتر هیچ‌گاه از دستگاه‌های خود دفتر خارج نمی‌شود، از جمله در تعامل با ما.",
      "سیاست استفاده را خود دفتر می‌نویسد و ما در نشست حضور داریم؛ سیاستی که فقط ما بنویسیم، سیاستی است که کارکنان دفتر با آن همراه نشده‌اند.",
      "انتخاب ابزار مجاز، کاری جدا از آموزش است و در این آموزش گنجانده نمی‌شود."
    ],
    "phases": [
      {
        "when": "",
        "title": "نشست شرکا",
        "detail": "یک نشست یک‌ساعته جدا برای شرکا، با تمرکز بر ریسک و سیاست استفاده، بدون نیاز به حضور در آموزش کامل."
      },
      {
        "when": "",
        "title": "تدوین سیاست استفاده",
        "detail": "دفتر با حضور ما سیاست استفاده را می‌نویسد؛ این کار در یک نشست یا سه نشست انجام می‌شود، بسته به تصمیم دفتر."
      },
      {
        "when": "",
        "title": "آموزش وکلا",
        "detail": "دو نیم‌روز آموزشی با فاصلهٔ یک هفته برای حدود سی نفر، تا کارکنان میان دو جلسه روی کار واقعی تمرین کنند و مشکلات را با خود بیاورند."
      }
    ],
    "summary": "دفتری و شرکا با سی‌ویک وکیل فعال، متوجه شده‌اند که دست‌کم دوازده نفر از کارکنان بدون رهنمود مشخصی، متن‌های حقوقی را در چت‌بات‌ها وارد می‌کنند. ما آموزشی دو‌بخشی برای وکلا و یک نشست جدا برای شرکا پیشنهاد می‌دهیم، همراه با نشست یا نشست‌هایی برای نوشتن سیاست استفاده، با مشارکت خود دفتر. پس از این کار، دفتر رویه‌ای مکتوب و پذیرفته‌شده برای آنچه اجازه دارد یا ندارد از دفتر خارج شود در دست خواهد داشت.",
    "nextSteps": [
      "ما قراردادهای همکاری دفتر با مشتریان را بررسی می‌کنیم.",
      "بازهٔ هزینه را برای دفتری و شرکا ارسال می‌کنیم.",
      "دفتری و شرکا این بازه را به کمیتهٔ مدیریت می‌برد.",
      "پس از تصمیم کمیته، زمان‌بندی نشست‌ها و آموزش مشخص می‌شود."
    ],
    "engagement": "training",
    "exclusions": [
      "انتخاب و تعیین ابزار مجاز، بخشی از این آموزش نیست و کاری جداست.",
      "این کار جایگزینی هیچ نیرویی نیست؛ اگر به گفتگوی کاهش نیرو تبدیل شود، دفتر آن را متوقف می‌کند.",
      "داده‌ای متعلق به مشتریان دفتر، نه در آموزش، نه در مثال‌ها، نه در هیچ بخش دیگری، به هیچ سرویس تأییدنشده ارسال نمی‌شود."
    ],
    "assumptions": [
      "قراردادهای همکاری (engagement letters) دفتر با مشتریان پیش از ارائهٔ رقم نهایی بررسی می‌شود.",
      "این قراردادها ممکن است از پیش موضوع محرمانگی را پوشش داده باشند و سیاست جدید نباید با آن‌ها تناقض داشته باشد.",
      "دفتر تا زمان برگزاری آموزش، ابزار مجازی برنمی‌گزیند؛ آموزش بر پایهٔ قاعده و قضاوت است، نه ابزار مشخص."
    ],
    "deliverables": [
      "سیاست مکتوب دربارهٔ آنچه اجازه دارد از دفتر خارج شود و آنچه اجازه ندارد.",
      "دو نیم‌روز آموزشی برگزارشده برای وکلای دفتر.",
      "یک نشست یک‌ساعته برگزارشده برای شرکا.",
      "فهرستی مکتوب از روش‌های فعلی استفادهٔ کارکنان از هوش مصنوعی، که در جریان آموزش گردآوری می‌شود."
    ],
    "scheduleNote": "زمان‌بندی دقیق منوط به تصمیم کمیتهٔ مدیریت دفتر است که هنوز برگزار نشده است.",
    "understanding": [
      "دفتری و شرکا سی‌ویک وکیل فعال دارد.",
      "دست‌کم دوازده نفر از این وکلا متن‌های پیش‌نویس قراردادها را در یک چت‌بات وارد می‌کنند.",
      "هیچ‌کس به آن‌ها دستور استفاده یا منع استفاده نداده است.",
      "دفتر نمی‌داند کدام ابزار مورد استفاده قرار می‌گیرد.",
      "تا این لحظه مشکلی گزارش‌نشده، اما این با نبود مشکل یکسان نیست.",
      "بدترین حالت از نگاه دفتر، قرار گرفتن یک قرارداد ویرایش‌نشده مشتری روی سروری در کشوری دیگر است، و شنیدن این خبر از خود مشتری.",
      "دفتر هنوز ابزار مجاز و تعیین‌شده‌ای برای این کار ندارد."
    ]
  },
  "facts": [
    "CLIENT: firm is Daftari & Partners.",
    "CLIENT: firm has thirty-one fee earners.",
    "CLIENT: at least a dozen fee earners are pasting draft clauses into a chatbot.",
    "CLIENT: nobody told them to use it and nobody told them not to.",
    "CONSULTANT: asked which tool is being used.",
    "CLIENT: does not know which tool.",
    "CONSULTANT: asked whether anything has gone wrong yet.",
    "CLIENT: not that they know of.",
    "CLIENT: worst case is a client''s unredacted contract sitting on a server in another country, and the firm hearing about it from the client.",
    "CONSULTANT: training should teach what may leave the building and what may not, and give people something allowed to use.",
    "CLIENT: firm does not yet have an allowed tool.",
    "CONSULTANT: choosing a tool is separate work, not folded into the training.",
    "CONSULTANT: training cannot teach a tool the firm has not chosen.",
    "CLIENT: asked how long the training would be.",
    "CONSULTANT: proposed two half-days, a week apart, for thirty people, rather than one full day.",
    "CONSULTANT: reason: people try it on real work between sessions and bring back what broke.",
    "CONSULTANT: a single day teaches less than people expect.",
    "CLIENT: partners will not sit through two half-days.",
    "CONSULTANT: proposed a separate one-hour session for partners on risk and policy.",
    "CLIENT: agreed that could work.",
    "CLIENT: asked who writes the policy.",
    "CONSULTANT: client writes the policy, with the studio in the room.",
    "CONSULTANT: a policy written by the studio alone is a policy the client''s people did not agree to.",
    "CLIENT: asked what it costs.",
    "CONSULTANT: range is forty to sixty million toman, depending on whether the policy work is one session or three.",
    "CONSULTANT: wants to read the client''s engagement letters before giving a firm figure, since they may already address confidentiality.",
    "CLIENT: will take the range to the management committee and cannot commit today.",
    "CLIENT: non-negotiable: client data does not go to any unapproved service, not for training, not for examples, not for anything.",
    "CONSULTANT: training exercises use invented matters.",
    "CONSULTANT: client documents never leave client machines, including the studio''s own.",
    "CLIENT: this is not a headcount conversation; will stop it if it becomes one.",
    "CONSULTANT: confirmed it is not that conversation and will write it down.",
    "CONSULTANT: has run this training for two other firms.",
    "CONSULTANT: in both cases the most useful output was the list the room produced of what people were already doing, previously unwritten.",
    "CLIENT: would like to see that list.",
    "CONSULTANT: asked when the client would want to run it.",
    "CLIENT: after the management committee meets; does not know when that is."
  ],
  "openQuestions": {
    "en": [
      "Which specific tool or tools are fee earners currently using?",
      "What will the approved tool be, and when will it be chosen?",
      "Will the policy drafting run as one session or three?",
      "What is the final cost figure once the engagement letters have been reviewed?",
      "When will the management committee meet, and what will it decide?",
      "Do the firm''s current engagement letters already address confidentiality and AI use?"
    ],
    "fa": [
      "کدام ابزار یا ابزارهای مشخصی توسط وکلا استفاده می‌شود؟",
      "ابزار مجاز نهایی چه خواهد بود و چه زمانی انتخاب می‌شود؟",
      "کار سیاست‌نویسی در یک نشست انجام می‌شود یا سه نشست؟",
      "رقم نهایی هزینه پس از بررسی قراردادهای همکاری چه خواهد بود؟",
      "کمیتهٔ مدیریت دفتر چه زمانی تشکیل می‌شود و نتیجهٔ آن چیست؟",
      "آیا قراردادهای همکاری فعلی دفتر از پیش موضوع محرمانگی و استفاده از هوش مصنوعی را پوشش می‌دهند؟"
    ]
  }
}'::jsonb,
  'sample', now(), 'pending', 0, now()
) on conflict (id) do nothing;

insert into public.shenava_segments (meeting_id, idx, start_ms, end_ms, status, text, model, cost_usd, attempts, finished_at)
values
  ('44444444-4444-4444-8444-444444444444', 0, 0, 260500, 'done', '(sample)', 'sample', 0, 1, now()),
  ('44444444-4444-4444-8444-444444444444', 1, 260500, 521000, 'done', '(sample)', 'sample', 0, 1, now())
on conflict (meeting_id, idx) do nothing;

commit;
