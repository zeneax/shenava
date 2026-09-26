-- ═══════════════════════════════════════════════════════════════════════════
-- Shenava · seed
--
-- Run this after 01_schema.sql. It gives you two things:
--
--   1. The built-in proposal template — twelve sections, both languages.
--   2. ONE SAMPLE MEETING, already transcribed, already labelled by speaker,
--      already drafted. It exists so that a fresh fork shows you the whole
--      product on the first page load, BEFORE you have an OpenRouter key and
--      before you have recorded anything.
--
-- The sample is entirely invented: «کتاب‌فروشی نیلگون» / "Nilgoon Books" is a
-- fictional bookshop, the people are fictional, the figures are fictional.
-- Delete it from the dashboard whenever you like — the delete button on the
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
    {"key":"summary",       "label_en":"Summary",                              "label_fa":"خلاصهٔ پیشنهاد",              "kind":"text"},
    {"key":"understanding", "label_en":"What we heard",                        "label_fa":"درک ما از نیاز شما",          "kind":"lines"},
    {"key":"goals",         "label_en":"Goals of this engagement",             "label_fa":"اهداف این همکاری",            "kind":"lines"},
    {"key":"phases",        "label_en":"Phases and timeline",                  "label_fa":"مراحل و زمان‌بندی",           "kind":"phases"},
    {"key":"method",        "label_en":"How we work, together, and afterwards","label_fa":"روش اجرا، مشارکت و پشتیبانی","kind":"lines"},
    {"key":"deliverables",  "label_en":"Deliverables",                         "label_fa":"خروجی‌های تحویلی",            "kind":"lines"},
    {"key":"budget",        "label_en":"Budget and timing, as said",           "label_fa":"بودجه و زمان، آن‌طور که گفته شد","kind":"lines"},
    {"key":"exclusions",    "label_en":"What is not in this proposal",         "label_fa":"آنچه در این پیشنهاد نیست",    "kind":"lines"},
    {"key":"assumptions",   "label_en":"Assumptions",                          "label_fa":"پیش‌فرض‌ها",                  "kind":"lines"},
    {"key":"nextSteps",     "label_en":"Next steps",                           "label_fa":"گام‌های بعدی",                "kind":"lines"},
    {"key":"openQuestions", "label_en":"Open questions",                       "label_fa":"پرسش‌های باز",                "kind":"lines","optional":true}
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

  '[
    {"side":"consultant","text":"Thanks for making the time. Before we talk about what we could build, tell me how the shop runs today."},
    {"side":"client","text":"We have two people on the floor and me. The stock lives in a spreadsheet that my colleague updates on Saturdays, and the website is a page with our address and a phone number. Most orders come through Instagram direct messages."},
    {"side":"consultant","text":"How many of those a day?"},
    {"side":"client","text":"Between fifteen and forty, depending on the week. And every one of them is a conversation — is this in stock, how much is postage, can you send it today. My colleague spends most of her shift answering the same four questions."},
    {"side":"consultant","text":"So the cost is her shift, not the orders."},
    {"side":"client","text":"Yes. And we lose orders at night because nobody answers until ten in the morning."},
    {"side":"consultant","text":"Right. Two things are separable here. One is answering the four questions, which does not need anything clever — if the stock is in a place a program can read, a bot can answer stock and postage in a second, at three in the morning. The other is taking the order and the payment, which is a shop, and that is a bigger build. I would not do both at once."},
    {"side":"client","text":"What would you do first?"},
    {"side":"consultant","text":"The stock. Not because it is the interesting part but because nothing else works without it — a bot that guesses at stock is worse than no bot. So the first phase is moving the spreadsheet into a real table your colleague still edits the same way, and then the bot reads it."},
    {"side":"client","text":"How long?"},
    {"side":"consultant","text":"Three weeks for the stock and the bot, if the spreadsheet is as tidy as you say. Then we look at the shop."},
    {"side":"client","text":"And the budget — I should say now that I do not have a number in mind."},
    {"side":"consultant","text":"That is fine, I will put what we said in the proposal and we settle it after."},
    {"side":"client","text":"What about the shop we already have?"},
    {"side":"consultant","text":"Nothing changes there. The page stays as it is, we do not touch your Instagram, and your colleague keeps her spreadsheet. If any of that has to change, the project has gone wrong."},
    {"side":"client","text":"Good. One thing — we run a stall at the book fair in November and it would be good to have the bot by then."},
    {"side":"consultant","text":"Noted, I will write that down as said rather than as a promise."}
  ]'::jsonb,
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

commit;
