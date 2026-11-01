'use strict';

/* =========================================================
   صالح؟ — فحص صلاحية المنتجات الغذائية
   ملف واحد يحتوي على: البيانات المرجعية، الكاميرا (الباركود وقراءة التاريخ)،
   خوارزمية التحليل، وعرض النتيجة وسجل الفحوصات.
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------- البيانات المرجعية ---------------- */

// مسببات الحساسية الرئيسية مع أمثلة عليها ورموزها في قاعدة Open Food Facts
const ALLERGENS = [
  { id: 'milk', ar: 'حليب البقر ومنتجات الألبان', off: ['en:milk'] },
  { id: 'eggs', ar: 'بيض الدجاج', off: ['en:eggs'] },
  { id: 'peanuts', ar: 'الفول السوداني', off: ['en:peanuts'] },
  { id: 'nuts', ar: 'المكسرات الشجرية', ex: 'الجوز، البقان، اللوز', off: ['en:nuts'] },
  { id: 'fish', ar: 'الأسماك', ex: 'القاروص، السمك المفلطح', off: ['en:fish'] },
  { id: 'crustaceans', ar: 'الأسماك القشرية والمحار', ex: 'الروبيان، سرطان البحر، السلطعون', off: ['en:crustaceans', 'en:molluscs'] },
  { id: 'gluten', ar: 'القمح', off: ['en:gluten', 'en:wheat'] },
  { id: 'soy', ar: 'فول الصويا', off: ['en:soybeans'] },
  { id: 'sesame', ar: 'السمسم', off: ['en:sesame-seeds'] },
];

// خصائص كل نوع: طريقة الحفظ الافتراضية، هل هو سريع التلف، المدة الآمنة بعد الفتح، ومتى نعتبره «قريب الانتهاء»
const CATEGORIES = {
  dairy:     { ar: 'ألبان وأجبان', storage: 'fridge', perishable: true, openedDays: 4, nearDays: 2 },
  meat:      { ar: 'لحوم ودواجن طازجة', storage: 'fridge', perishable: true, openedDays: 2, nearDays: 1 },
  fish:      { ar: 'أسماك ومأكولات بحرية', storage: 'fridge', perishable: true, openedDays: 1, nearDays: 1 },
  eggs:      { ar: 'بيض', storage: 'fridge', perishable: true, openedDays: 2, nearDays: 3 },
  produce:   { ar: 'فواكه وخضروات طازجة', storage: 'fridge', perishable: true, openedDays: 3, nearDays: 1 },
  frozen:    { ar: 'أغذية مجمدة', storage: 'freezer', perishable: true, openedDays: 1, nearDays: 14 },
  baby:      { ar: 'أغذية الأطفال', storage: 'cool', perishable: true, openedDays: 2, nearDays: 14, fridgeAfterOpen: true },
  bakery:    { ar: 'مخبوزات', storage: 'room', perishable: false, openedDays: 4, nearDays: 1 },
  canned:    { ar: 'معلبات', storage: 'room', perishable: false, openedDays: 3, nearDays: 30, fridgeAfterOpen: true },
  sauces:    { ar: 'صلصات ومربيات', storage: 'cool', perishable: false, openedDays: 30, nearDays: 14, fridgeAfterOpen: true },
  beverages: { ar: 'عصائر ومشروبات', storage: 'cool', perishable: false, openedDays: 5, nearDays: 7, fridgeAfterOpen: true },
  dry:       { ar: 'حبوب ومعكرونة وبقوليات', storage: 'cool', perishable: false, openedDays: 90, nearDays: 30 },
  snacks:    { ar: 'حلويات ووجبات خفيفة', storage: 'cool', perishable: false, openedDays: 14, nearDays: 14 },
  other:     { ar: 'نوع آخر', storage: '', perishable: false, openedDays: 3, nearDays: 3 },
};

const STORAGE = {
  freezer: 'المجمّد (‎-18°م أو أقل)',
  fridge: 'الثلاجة (0 إلى 5°م)',
  cool: 'مكان بارد وجاف بعيد عن الشمس',
  room: 'حرارة الغرفة (أقل من 25°م)',
};

const SIGNS = [
  { id: 'swollen', ar: 'انتفاخ العلبة أو الغطاء', level: 'bad', msg: 'الانتفاخ علامة على نشاط بكتيري قد يسبب التسمم الوشيقي (البوتيوليزم). لا تفتح العبوة ولا تتذوقها.' },
  { id: 'dented', ar: 'صدأ أو انبعاج شديد', level: 'bad', msg: 'الصدأ أو الانبعاج عند حواف العلبة قد يسمح بدخول البكتيريا.' },
  { id: 'leak', ar: 'تسرّب أو تمزّق الغلاف', level: 'bad', msg: 'العبوة لم تعد محكمة، فالمنتج معرّض للتلوث.' },
  { id: 'seal', ar: 'الختم مفتوح أو تالف', level: 'bad', msg: 'قد يكون المنتج فُتح من قبل أو عُبث به.' },
  { id: 'smell', ar: 'رائحة غير طبيعية', level: 'bad', msg: 'الرائحة الحامضة أو الكريهة من أوضح علامات الفساد.' },
  { id: 'color', ar: 'تغيّر اللون', level: 'bad', msg: 'تغيّر اللون يدل غالبًا على نمو بكتيري أو أكسدة.' },
  { id: 'mold', ar: 'ظهور عفن', level: 'bad', msg: 'العفن قد يفرز سمومًا تمتد داخل الطعام حتى لو أزلت الجزء الظاهر.' },
  { id: 'texture', ar: 'لزوجة أو تغيّر القوام', level: 'bad', msg: 'اللزوجة على اللحوم أو الأجبان علامة على نمو البكتيريا.' },
  { id: 'fizz', ar: 'فوران أو فقاعات غير معتادة', level: 'bad', msg: 'الفوران في منتج غير غازي يعني تخمّرًا غير مقصود.' },
  { id: 'ice', ar: 'بلورات ثلج كثيفة', level: 'warn', msg: 'تدل على ذوبان ثم إعادة تجميد أو تخزين طويل، وقد تقل جودة المنتج.' },
];

// بادئات الباركود حسب منظمة GS1 (تبيّن بلد تسجيل الباركود، لا بلد التصنيع بالضرورة)
const GS1 = [
  [0, 139, 'الولايات المتحدة وكندا'], [300, 379, 'فرنسا'], [400, 440, 'ألمانيا'], [450, 459, 'اليابان'],
  [460, 469, 'روسيا'], [471, 471, 'تايوان'], [489, 489, 'هونغ كونغ'], [490, 499, 'اليابان'],
  [500, 509, 'المملكة المتحدة'], [520, 521, 'اليونان'], [528, 528, 'لبنان'], [529, 529, 'قبرص'],
  [540, 549, 'بلجيكا ولوكسمبورغ'], [560, 560, 'البرتغال'], [570, 579, 'الدنمارك'], [590, 590, 'بولندا'],
  [600, 601, 'جنوب أفريقيا'], [608, 608, 'البحرين'], [611, 611, 'المغرب'], [613, 613, 'الجزائر'],
  [616, 616, 'كينيا'], [619, 619, 'تونس'], [621, 621, 'سوريا'], [622, 622, 'مصر'], [624, 624, 'ليبيا'],
  [625, 625, 'الأردن'], [626, 626, 'إيران'], [627, 627, 'الكويت'], [628, 628, 'السعودية'],
  [629, 629, 'الإمارات'], [640, 649, 'فنلندا'], [690, 699, 'الصين'], [700, 709, 'النرويج'],
  [730, 739, 'السويد'], [750, 750, 'المكسيك'], [760, 769, 'سويسرا'], [789, 790, 'البرازيل'],
  [800, 839, 'إيطاليا'], [840, 849, 'إسبانيا'], [868, 869, 'تركيا'], [870, 879, 'هولندا'],
  [880, 880, 'كوريا الجنوبية'], [885, 885, 'تايلاند'], [888, 888, 'سنغافورة'], [890, 890, 'الهند'],
  [893, 893, 'فيتنام'], [896, 896, 'باكستان'], [899, 899, 'إندونيسيا'], [900, 919, 'النمسا'],
  [930, 939, 'أستراليا'], [940, 949, 'نيوزيلندا'], [955, 955, 'ماليزيا'],
];

const COUNTRIES = ['سلطنة عُمان', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'البحرين', 'مصر', 'الأردن', 'لبنان',
  'سوريا', 'العراق', 'المغرب', 'تونس', 'الجزائر', 'تركيا', 'الهند', 'باكستان', 'الصين', 'ماليزيا', 'تايلاند',
  'فرنسا', 'ألمانيا', 'إيطاليا', 'إسبانيا', 'هولندا', 'الدنمارك', 'المملكة المتحدة', 'الولايات المتحدة',
  'البرازيل', 'أستراليا', 'نيوزيلندا'];

const GROUPS = { dates: 'التواريخ', storage: 'الحفظ والتخزين', allergens: 'مسببات الحساسية', source: 'مصدر المنتج', signs: 'الفحص الظاهري' };
const VERDICT_SHORT = { good: 'صالح', warn: 'بشروط', bad: 'غير صالح' };

/* ---------------- أدوات التاريخ والنص ---------------- */

const DAY = 86400000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseISO = (s) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((b - a) / DAY);
const dateFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const fmt = (d) => dateFmt.format(d);

// صيغة العدد مع كلمة «يوم» حسب قواعد العربية
function days(n) {
  n = Math.abs(n);
  if (n === 0) return 'أقل من يوم';
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}
const joinAr = (arr) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join('، ') + ' و' + arr[arr.length - 1];
const allergenName = (id) => (ALLERGENS.find((a) => a.id === id) || {}).ar || id;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* التخزين غير متاح */ } },
};

/* ---------------- الباركود ---------------- */

// التحقق من رقم التحقق (آخر رقم) في باركود EAN-13 / EAN-8 / UPC-A
function validBarcode(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}
function withCheckDigit(base12) {
  for (let c = 0; c <= 9; c++) if (validBarcode(base12 + c)) return base12 + c;
  return base12 + '0';
}
function gs1Country(code) {
  if (code.length === 8) return null;
  const ean = code.length === 12 ? '0' + code : code;
  const p = Number(ean.slice(0, 3));
  const hit = GS1.find(([a, b]) => p >= a && p <= b);
  return hit ? hit[2] : null;
}

/* =========================================================
   خوارزمية التحليل
   تُرجع: الحكم النهائي + قائمة ملاحظات مصنّفة (good / info / warn / bad)
   ========================================================= */
function analyze(d) {
  const F = [];
  const add = (level, group, text) => F.push({ level, group, text });
  const cat = CATEGORIES[d.category] || CATEGORIES.other;
  const today = startOfToday();
  const prod = parseISO(d.prod);
  const exp = parseISO(d.exp);
  let effectiveExp = exp;

  // 1) التواريخ
  if (!exp) add('warn', 'dates', 'لم يُدخل تاريخ الانتهاء، فلا يمكن تأكيد الصلاحية. ابحث على العبوة عن EXP أو «ينتهي في».');
  if (prod && prod > today) add('warn', 'dates', 'تاريخ الإنتاج بعد تاريخ اليوم. راجع التاريخ؛ الملصق الذي يحمل تاريخًا مستقبليًا قد يدل على تلاعب.');
  if (prod && exp && prod >= exp) add('warn', 'dates', 'تاريخ الإنتاج ليس قبل تاريخ الانتهاء. ربما تبادل التاريخان أماكنهما.');

  if (exp) {
    const left = diffDays(today, exp);
    const bestBefore = d.dateType === 'bestBefore';
    if (left < 0) {
      if (bestBefore && !cat.perishable) {
        add('warn', 'dates', `تجاوز تاريخ «يُفضّل استهلاكه قبل» منذ ${days(left)}. هذا التاريخ يخص الجودة في المنتجات الجافة، فافحصه جيدًا ولا تأكله إذا لاحظت أي تغيّر.`);
      } else {
        add('bad', 'dates', `منتهي الصلاحية منذ ${days(left)} (${fmt(exp)}).`);
      }
    } else if (left === 0) {
      add('warn', 'dates', 'ينتهي اليوم. استهلكه اليوم أو تخلّص منه.');
    } else if (left <= cat.nearDays) {
      add('warn', 'dates', `يقترب من الانتهاء: بقي ${days(left)} (حتى ${fmt(exp)}).`);
    } else {
      add('good', 'dates', `ضمن مدة الصلاحية حتى ${fmt(exp)}.`);
    }
  }

  // العبوة المفتوحة لها مدة أقصر من التاريخ المطبوع
  if (d.opened) {
    const opened = parseISO(d.openedDate);
    if (!opened) add('warn', 'dates', 'حدّد تاريخ فتح العبوة لحساب المدة الآمنة بعد الفتح.');
    else if (opened > today) add('warn', 'dates', 'تاريخ فتح العبوة بعد تاريخ اليوم. راجع التاريخ.');
    else {
      const since = diffDays(opened, today);
      const limit = addDays(opened, cat.openedDays);
      if (!effectiveExp || limit < effectiveExp) effectiveExp = limit;
      if (since > cat.openedDays) {
        add('bad', 'dates', `فُتحت العبوة منذ ${days(since)}، والمدة الآمنة لـ«${cat.ar}» بعد الفتح نحو ${days(cat.openedDays)} فقط.`);
      } else {
        add(since === cat.openedDays ? 'warn' : 'good', 'dates', `فُتحت منذ ${days(since)}. يُستهلك خلال ${days(cat.openedDays)} من الفتح، أي حتى ${fmt(limit)}.`);
      }
      if (cat.fridgeAfterOpen) add('info', 'storage', 'بعد فتح هذا النوع يجب حفظه في الثلاجة.');
    }
  }

  // 2) ظروف التخزين
  const where = cat.storage ? ` الحفظ الصحيح لهذا النوع: ${STORAGE[cat.storage]}.` : '';
  if (d.storage === 'suitable') {
    add('good', 'storage', 'ظروف تخزين المنتج مناسبة.');
  } else if (d.storage === 'uncertain') {
    add('warn', 'storage', 'ظروف تخزين المنتج غير مؤكدة، فافحصه جيدًا قبل استهلاكه.' + where);
  } else if (d.storage === 'unsuitable') {
    add('bad', 'storage', 'حُفظ المنتج في ظروف غير مناسبة، مثل الحرارة أو الذوبان ثم إعادة التجميد، وهذا يسرّع نمو البكتيريا حتى قبل تاريخ الانتهاء.' + where);
  } else {
    add('info', 'storage', 'لم تحدد ظروف تخزين المنتج. طريقة الحفظ الخاطئة قد تفسده قبل تاريخ الانتهاء.');
  }

  // 3) مسببات الحساسية
  const mine = loadMyAllergies();
  const hits = d.allergens.filter((a) => mine.includes(a));
  const traceHits = d.traces.filter((a) => mine.includes(a) && !hits.includes(a));
  if (hits.length) add('bad', 'allergens', `يحتوي على ${joinAr(hits.map(allergenName))}، وهي ضمن الحساسية التي سجّلتها. لا تتناوله.`);
  if (traceHits.length) add('warn', 'allergens', `قد يحتوي على آثار من ${joinAr(traceHits.map(allergenName))}. تجنّبه إذا كانت حساسيتك شديدة.`);
  if (!hits.length && !traceHits.length) {
    if (d.allergens.length) {
      add('info', 'allergens', `يحتوي على: ${joinAr(d.allergens.map(allergenName))}.` +
        (mine.length ? ' لا يتعارض مع الحساسية التي سجّلتها.' : ' سجّل حساسيتك من زر «حساسيتي» لينبهك الموقع.'));
    } else {
      add('info', 'allergens', 'لم تُحدد مسببات حساسية. راجع قائمة المكونات المكتوبة على العبوة.');
    }
  }

  // 4) مصدر المنتج
  const code = (d.barcode || '').replace(/\D/g, '');
  if (code) {
    if (!validBarcode(code)) {
      add('warn', 'source', 'رقم الباركود غير صحيح (رقم التحقق الأخير لا يطابق). تأكد من إدخاله؛ الباركود غير الصحيح قد يدل على ملصق غير أصلي.');
    } else {
      const c = gs1Country(code);
      add('good', 'source', c ? `الباركود صحيح ومسجّل في ${c}. قد يختلف بلد تسجيل الباركود عن بلد التصنيع، وهذا طبيعي.` : 'الباركود صحيح.');
    }
  }
  if (!d.manufacturer && !d.origin) {
    add('warn', 'source', 'مصدر المنتج غير معروف. المنتجات المجهولة المصدر أكثر عرضة للغش، فاشترِ من مصادر موثوقة.');
  } else {
    add(d.manufacturer && d.origin ? 'good' : 'info', 'source', `المصدر: ${[d.manufacturer, d.origin].filter(Boolean).join('، ')}.` +
      (d.manufacturer && d.origin ? '' : ' أكمل بقية بيانات المصدر إن وُجدت على العبوة.'));
  }
  if (!d.batch) add('info', 'source', 'رقم التشغيلة (LOT) يساعدك على معرفة ما إذا كان المنتج ضمن دفعة مسحوبة من الأسواق.');

  // 5) الفحص الظاهري
  const signs = d.signs.map((id) => SIGNS.find((s) => s.id === id)).filter(Boolean);
  signs.forEach((s) => add(s.level, 'signs', `${s.ar}: ${s.msg}`));
  if (!signs.length) add('good', 'signs', 'لا توجد علامات فساد ظاهرة على المنتج أو العبوة.');

  // الحكم النهائي
  const bad = F.filter((f) => f.level === 'bad');
  const warn = F.filter((f) => f.level === 'warn');
  let verdict, title, advice;
  if (bad.length) {
    verdict = 'bad';
    if (bad.every((f) => f.group === 'allergens')) {
      title = 'غير مناسب لك';
      advice = 'المنتج سليم من حيث التاريخ والحفظ، لكنه يحتوي على مادة لديك حساسية منها.';
    } else if (bad.some((f) => f.group === 'signs')) {
      title = 'ظهرت عليه علامات فساد';
      advice = 'لا تتناوله ولا تتذوقه للتأكد. تخلّص منه في كيس مغلق.';
    } else if (bad.some((f) => f.group === 'dates')) {
      title = 'منتهي الصلاحية';
      advice = 'لا تتناوله. المنتج تجاوز المدة الآمنة للاستهلاك.';
    } else {
      title = 'غير صالح للاستهلاك';
      advice = 'طريقة حفظ المنتج جعلته غير آمن. لا تتناوله.';
    }
  } else if (warn.length) {
    verdict = 'warn';
    if (!exp) { title = 'تعذّر التأكد من الصلاحية'; advice = 'أدخل تاريخ الانتهاء أو صوّره ثم أعد الفحص.'; }
    else { title = 'صالح بشروط'; advice = 'يمكن استهلاكه بعد مراجعة الملاحظات المظللة أدناه.'; }
  } else {
    verdict = 'good';
    title = 'طازج وصالح للاستهلاك';
    advice = 'لم تظهر أي مشكلة في البيانات التي أدخلتها. احفظه بالطريقة المكتوبة على العبوة.';
  }

  return { verdict, title, advice, findings: F, today, prod, exp, effectiveExp, category: cat };
}

/* ---------------- بيانات النموذج ---------------- */

const form = $('#form');

function fillOptions() {
  $('#category').innerHTML = '<option value="">اختر النوع</option>' +
    Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${c.ar}</option>`).join('');
  const chip = (name, a) => `<label><input type="checkbox" name="${name}" value="${a.id}"><span>${a.ar}${a.ex ? ` <small>(${a.ex})</small>` : ''}</span></label>`;
  $('#allergens').innerHTML = ALLERGENS.map((a) => chip('allergens', a)).join('');
  $('#traces').innerHTML = ALLERGENS.map((a) => chip('traces', a)).join('');
  $('#myAllergies').innerHTML = ALLERGENS.map((a) => chip('mine', a)).join('');
  $('#signs').innerHTML = SIGNS.map((s) => chip('signs', s)).join('');
  $('#countries').innerHTML = COUNTRIES.map((c) => `<option value="${c}">`).join('');
}

function getData() {
  const v = (n) => (form.elements[n].value || '').trim();
  const checked = (n) => $$(`input[name="${n}"]:checked`, form).map((i) => i.value);
  return {
    name: v('name'), barcode: v('barcode'), category: v('category'),
    prod: v('prod'), exp: v('exp'),
    dateType: form.elements.dateType.value || 'useBy',
    opened: form.elements.opened.checked, openedDate: v('openedDate'),
    allergens: checked('allergens'), traces: checked('traces'),
    storage: form.elements.storage.value,
    manufacturer: v('manufacturer'), origin: v('origin'), batch: v('batch'),
    signs: checked('signs'),
    image: $('#productImg').hidden ? '' : $('#productImg').src,
  };
}

function setData(d) {
  ['name', 'barcode', 'category', 'prod', 'exp', 'openedDate', 'manufacturer', 'origin', 'batch']
    .forEach((n) => { form.elements[n].value = d[n] || ''; });
  form.elements.dateType.value = d.dateType || 'useBy';
  form.elements.opened.checked = !!d.opened;
  form.elements.storage.value = d.storage || '';
  ['allergens', 'traces', 'signs'].forEach((n) => {
    $$(`input[name="${n}"]`, form).forEach((i) => { i.checked = (d[n] || []).includes(i.value); });
  });
  setProductImage(d.image);
  syncOpened();
  syncStorageHint();
  markMyAllergies();
}

function setProductImage(src) {
  const img = $('#productImg');
  if (src) { img.src = src; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
}

// يعرض طريقة الحفظ الموصى بها حسب نوع المنتج
function syncStorageHint() {
  const c = CATEGORIES[form.elements.category.value];
  $('#storageHint').textContent = c && c.storage
    ? `الحفظ الموصى به لهذا النوع: ${STORAGE[c.storage]}. هل حُفظ المنتج بهذه الطريقة؟`
    : 'اتبع طريقة الحفظ المكتوبة على العبوة.';
}

function syncOpened() {
  const on = form.elements.opened.checked;
  $('#openedWrap').hidden = !on;
  if (on && !form.elements.openedDate.value) form.elements.openedDate.value = toISO(startOfToday());
}

/* ---------------- حساسيتي ---------------- */

const loadMyAllergies = () => store.get('salih.myAllergies', []).filter((id) => ALLERGENS.some((a) => a.id === id));

function markMyAllergies() {
  const mine = loadMyAllergies();
  $$('#allergens input, #traces input').forEach((i) => i.nextElementSibling.classList.toggle('mine', mine.includes(i.value)));
  const c = $('#myAllergyCount');
  c.textContent = mine.length;
  c.hidden = !mine.length;
}

function openAllergyDialog() {
  const mine = loadMyAllergies();
  $$('#myAllergies input').forEach((i) => { i.checked = mine.includes(i.value); });
  $('#allergyDialog').showModal();
}

/* ---------------- رسائل الحالة ---------------- */

function showStatus(text, type = 'info', progress = null) {
  const box = $('#status');
  box.hidden = false;
  box.className = 'status ' + type;
  $('#statusText').textContent = text;
  $('#statusBar').hidden = progress === null;
  if (progress !== null) $('#statusFill').style.width = Math.round(progress * 100) + '%';
}
const hideStatus = () => { $('#status').hidden = true; };

/* =========================================================
   الكاميرا 1: مسح الباركود (html5-qrcode)
   ========================================================= */

let scanner = null;
const scanFormats = () => {
  const F = window.Html5QrcodeSupportedFormats;
  return F ? [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.QR_CODE] : undefined;
};

async function openScanner() {
  if (!window.Html5Qrcode) {
    showStatus('تعذّر تحميل قارئ الباركود. تأكد من اتصال الإنترنت ثم أعد تحميل الصفحة.', 'error');
    return;
  }
  const dlg = $('#scanDialog');
  $('#scanMsg').textContent = 'ضع الباركود داخل الإطار وثبّت الجوال. سيُقرأ تلقائيًا.';
  dlg.showModal();
  try {
    scanner = new Html5Qrcode('reader', { formatsToSupport: scanFormats(), useBarCodeDetectorIfSupported: true, verbose: false });
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: (w, h) => ({ width: Math.floor(Math.min(w * 0.85, 340)), height: Math.floor(Math.min(h * 0.5, 170)) }) },
      (text) => { closeScanner().then(() => handleBarcode(text)); },
      () => {}
    );
  } catch (err) {
    scanner = null;
    const insecure = !window.isSecureContext;
    $('#scanMsg').textContent = insecure
      ? 'الكاميرا المباشرة تعمل فقط عندما يُفتح الموقع عبر رابط آمن (https). يمكنك الآن التقاط صورة للباركود بدلًا من ذلك.'
      : 'لم يُسمح باستخدام الكاميرا أو أنها غير متاحة. اسمح للمتصفح باستخدام الكاميرا، أو التقط صورة للباركود.';
  }
}

async function closeScanner() {
  const dlg = $('#scanDialog');
  if (scanner) {
    try { if (scanner.isScanning) await scanner.stop(); scanner.clear(); } catch { /* تجاهل */ }
    scanner = null;
  }
  if (dlg.open) dlg.close();
}

async function scanBarcodeFile(file) {
  if (!file || !window.Html5Qrcode) return;
  showStatus('جارٍ قراءة الباركود من الصورة…');
  try {
    const fileScanner = new Html5Qrcode('readerFile', { formatsToSupport: scanFormats(), useBarCodeDetectorIfSupported: true, verbose: false });
    const text = await fileScanner.scanFile(file, false);
    fileScanner.clear();
    handleBarcode(text);
  } catch {
    showStatus('لم أجد باركود واضحًا في الصورة. صوّر الباركود عن قرب وبإضاءة جيدة، أو اكتب رقمه يدويًا.', 'error');
  }
}

async function handleBarcode(raw) {
  const code = String(raw).replace(/\D/g, '');
  form.elements.barcode.value = code || raw;
  if (!code || !validBarcode(code)) {
    showStatus('قُرئ الرمز لكنه ليس باركود منتج غذائي معروف. أكمل البيانات يدويًا.', 'error');
    return;
  }
  showStatus('جارٍ البحث عن المنتج في قاعدة البيانات…', 'info', 0.4);
  try {
    const p = await lookupProduct(code);
    if (!p) {
      showStatus('الباركود صحيح لكن المنتج غير موجود في قاعدة البيانات المفتوحة. أكمل البيانات يدويًا، ثم صوّر التاريخ.', 'info');
      return;
    }
    applyProduct(p);
    showStatus(`وُجد المنتج: ${p.name || code}. أُضيفت بياناته، والآن صوّر تاريخ الصلاحية.`, 'success');
  } catch {
    showStatus('تعذّر الاتصال بقاعدة بيانات المنتجات. تأكد من الإنترنت أو أكمل البيانات يدويًا.', 'error');
  }
}

// قاعدة Open Food Facts المفتوحة (مجانية ولا تحتاج مفتاحًا)
async function lookupProduct(code) {
  const fields = 'product_name,product_name_ar,product_name_en,brands,allergens_tags,traces_tags,origins,manufacturing_places,countries,categories_tags,image_front_small_url';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, { signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('lookup failed');
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const tags = (t) => (p[t] || []).map((x) => String(x).toLowerCase());
    const mapAllergens = (list) => ALLERGENS.filter((a) => a.off.some((o) => list.includes(o))).map((a) => a.id);
    return {
      name: p.product_name_ar || p.product_name || p.product_name_en || '',
      brand: (p.brands || '').split(',')[0].trim(),
      origin: (p.origins || p.manufacturing_places || '').split(',')[0].trim(),
      allergens: mapAllergens(tags('allergens_tags')),
      traces: mapAllergens(tags('traces_tags')),
      category: guessCategory(tags('categories_tags')),
      image: p.image_front_small_url || '',
    };
  } finally {
    clearTimeout(timer);
  }
}

function guessCategory(tags) {
  const has = (...words) => tags.some((t) => words.some((w) => t.includes(w)));
  if (has('frozen')) return 'frozen';
  if (has('baby')) return 'baby';
  if (has('canned')) return 'canned';
  if (has('dair', 'milk', 'cheese', 'yogurt', 'yoghurt', 'labneh', 'cream')) return 'dairy';
  if (has('meat', 'poultry', 'chicken', 'sausage', 'beef')) return 'meat';
  if (has('fish', 'seafood', 'tuna', 'shrimp')) return 'fish';
  if (has(':eggs')) return 'eggs';
  if (has('bread', 'bakery', 'pastr', 'cake', 'viennoiserie')) return 'bakery';
  if (has('beverage', 'juice', 'drink', 'water')) return 'beverages';
  if (has('sauce', 'condiment', 'spread', 'jam', 'honey')) return 'sauces';
  if (has('snack', 'biscuit', 'chocolate', 'confection', 'candies', 'chips')) return 'snacks';
  if (has('cereal', 'pasta', 'rice', 'legume', 'flour', 'grain')) return 'dry';
  if (has('fruit', 'vegetable')) return 'produce';
  return '';
}

function applyProduct(p) {
  if (p.name) form.elements.name.value = p.name;
  if (p.brand) form.elements.manufacturer.value = p.brand;
  if (p.origin) form.elements.origin.value = p.origin;
  if (p.category) form.elements.category.value = p.category;
  syncStorageHint();
  $$('input[name="allergens"]', form).forEach((i) => { i.checked = p.allergens.includes(i.value); });
  $$('input[name="traces"]', form).forEach((i) => { i.checked = p.traces.includes(i.value); });
  setProductImage(p.image);
}

/* =========================================================
   الكاميرا 2: قراءة تاريخ الإنتاج والانتهاء من صورة (Tesseract OCR)
   ========================================================= */

let ocrWorker = null;
let ocrProgress = () => {};

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) throw new Error('tesseract missing');
  ocrWorker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => ocrProgress(m),
  });
  return ocrWorker;
}

// تحسين الصورة قبل القراءة: تصغير/تكبير، تدرج رمادي، وزيادة التباين
async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const longSide = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(2, Math.max(1, 1000 / longSide), 1800 / longSide);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
    px[i] = g;
    hist[g]++;
  }
  // مدّ التباين بين 2% و98% من درجات السطوع
  const total = px.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let g = 0; g < 256; g++) { acc += hist[g]; if (acc > total * 0.02) { lo = g; break; } }
  acc = 0;
  for (let g = 255; g >= 0; g--) { acc += hist[g]; if (acc > total * 0.02) { hi = g; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return { canvas, url };
}

async function readDatesFromPhoto(file) {
  if (!file) return;
  const steps = { 'loading tesseract core': 'تحميل أداة القراءة', 'initializing tesseract': 'تجهيز أداة القراءة', 'loading language traineddata': 'تحميل بيانات اللغة', 'initializing api': 'تجهيز أداة القراءة', 'recognizing text': 'قراءة النص من الصورة' };
  ocrProgress = (m) => showStatus(`${steps[m.status] || 'جارٍ العمل'}…`, 'info', m.progress || 0);
  showStatus('جارٍ تجهيز الصورة…', 'info', 0);
  try {
    const { canvas, url } = await prepareImage(file);
    $('#ocrThumb').src = url;
    const worker = await getOcrWorker();
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
    let text = (await worker.recognize(canvas)).data.text;
    let found = parseDates(text);
    if (!found.all.length) {
      // محاولة ثانية بوضع «نص متفرق» المناسب للملصقات
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      const text2 = (await worker.recognize(canvas)).data.text;
      const found2 = parseDates(text2);
      if (found2.all.length) { text = text2; found = found2; }
    }
    ocrProgress = () => {};
    showOcrResult(text, found);
  } catch (err) {
    ocrProgress = () => {};
    showStatus('تعذّرت قراءة الصورة. تأكد من اتصال الإنترنت عند أول استخدام (لتحميل أداة القراءة)، أو أدخل التاريخ يدويًا.', 'error');
  }
}

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
// \b لا يعمل مع الحروف العربية، لذلك الكلمات العربية خارج المجموعة
const EXP_WORDS = /(?:\b(?:EXPIRY|EXPIRES|EXPIRE|EXP|USE\s*BY|BEST\s*BEFORE|BEST\s*BY|BBE|BBD|BB|ED|E\s*[:.])|انتهاء|ينتهي|صالح\s*حتى|يفضل)/g;
const PROD_WORDS = /(?:\b(?:PRODUCTION|PROD|PRD|MFG|MFD|MANUF\w*|PKD|PACKED|PD|P\s*[:.])|إنتاج|انتاج|التعبئة)/g;

// يستخرج كل التواريخ من النص ويحدد أيها تاريخ إنتاج وأيها تاريخ انتهاء
function parseDates(rawText) {
  let t = rawText
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776));
  // أخطاء شائعة في القراءة: حرف O بدل صفر، و I أو l بدل 1 داخل الأرقام
  t = t.replace(/[\dOoIl|][\dOoIl|/.\-]{4,}[\dOoIl|]/g, (m) =>
    (m.replace(/\D/g, '').length >= 3 ? m.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1') : m));
  t = t.toUpperCase();

  const today = startOfToday();
  const minY = today.getFullYear() - 6, maxY = today.getFullYear() + 12;
  const fixYear = (y) => (y < 100 ? 2000 + y : y);
  const valid = (y, m, d) => {
    if (y < minY || y > maxY || m < 1 || m > 12) return false;
    if (d == null) return true;
    const dt = new Date(y, m - 1, d);
    return dt.getMonth() === m - 1 && dt.getDate() === d;
  };

  const patterns = [
    { re: /\b(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/g, get: (m) => [+m[1], +m[2], +m[3]] },
    { re: /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/g, get: (m) => {
        let d = +m[1], mo = +m[2];
        if (mo > 12 && d <= 12) [d, mo] = [mo, d];
        return [fixYear(+m[3]), mo, d];
      } },
    { re: /\b(\d{1,2}) (\d{1,2}) (20\d{2})\b/g, get: (m) => [+m[3], +m[2], +m[1]] },
    { re: /\b(?:(\d{1,2})[\s/.\-]*)?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s/.\-,]*(20\d{2}|\d{2})\b/g,
      get: (m) => [fixYear(+m[3]), MONTHS[m[2]], m[1] ? +m[1] : null] },
    { re: /\b(20\d{2})[/.\-](\d{1,2})\b/g, get: (m) => [+m[1], +m[2], null] },
    { re: /\b(\d{1,2})[/.\-](20\d{2}|\d{2})\b/g, get: (m) => [fixYear(+m[2]), +m[1], null] },
  ];

  const taken = [];
  const overlaps = (a, b) => taken.some(([s, e]) => a < e && b > s);
  const all = [];
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(t))) {
      const start = m.index, end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const [y, mo, d] = p.get(m);
      if (!valid(y, mo, d)) continue;
      taken.push([start, end]);
      all.push({ y, m: mo, d, index: start, raw: m[0].trim(), role: findRole(t, start) });
    }
  }
  all.sort((a, b) => a.index - b.index);

  // تحديد الدور عند غياب الكلمات الدالة: الأقدم إنتاج والأحدث انتهاء
  const known = (r) => all.filter((x) => x.role === r);
  const unknown = all.filter((x) => !x.role);
  const asDate = (x, role) => new Date(x.y, x.m - 1, x.d ?? (role === 'exp' ? new Date(x.y, x.m, 0).getDate() : 1));
  if (unknown.length) {
    const byTime = [...unknown].sort((a, b) => asDate(a, 'exp') - asDate(b, 'exp'));
    if (!known('exp').length) byTime[byTime.length - 1].role = 'exp';
    if (!known('prod').length && byTime.length > 1) byTime[0].role = 'prod';
  }
  all.forEach((x) => {
    x.role = x.role || 'exp';
    x.iso = toISO(asDate(x, x.role));
  });

  const pick = (role) => {
    const list = all.filter((x) => x.role === role).map((x) => x.iso).sort();
    return role === 'exp' ? list[list.length - 1] : list[0];
  };
  const bestBefore = /BEST\s*BEFORE|BEST\s*BY|\bBBE?\b|BBD|يفضل/.test(t);
  return { all, prod: pick('prod') || '', exp: pick('exp') || '', bestBefore };
}

// ينظر إلى 28 حرفًا قبل التاريخ ويختار أقرب كلمة دالة
function findRole(t, index) {
  const ctx = t.slice(Math.max(0, index - 28), index);
  let best = null, bestEnd = -1;
  for (const [re, role] of [[EXP_WORDS, 'exp'], [PROD_WORDS, 'prod']]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(ctx))) {
      const end = m.index + m[0].length;
      if (end > bestEnd) { bestEnd = end; best = role; }
    }
  }
  return best;
}

function showOcrResult(text, found) {
  $('#ocrText').textContent = text.trim() || '(لم يُقرأ أي نص)';
  const panel = $('#ocrPanel');
  panel.hidden = false;
  const list = $('#ocrDates');
  if (!found.all.length) {
    list.innerHTML = '<li>لم يُعثر على تاريخ في الصورة.</li>';
    showStatus('لم أتمكن من قراءة تاريخ. قرّب الكاميرا من التاريخ وتأكد من الإضاءة وثبات اليد، أو أدخله يدويًا.', 'error');
    return;
  }
  list.innerHTML = found.all.map((x, i) => `
    <li>
      <span class="d">${esc(x.raw)}</span>
      <span class="role" role="group" aria-label="نوع التاريخ">
        <button type="button" data-i="${i}" data-role="prod" aria-pressed="${x.role === 'prod'}">إنتاج</button>
        <button type="button" data-i="${i}" data-role="exp" aria-pressed="${x.role === 'exp'}">انتهاء</button>
      </span>
    </li>`).join('');
  list.onclick = (e) => {
    const b = e.target.closest('button[data-role]');
    if (!b) return;
    const x = found.all[+b.dataset.i];
    x.role = b.dataset.role;
    x.iso = toISO(new Date(x.y, x.m - 1, x.d ?? (x.role === 'exp' ? new Date(x.y, x.m, 0).getDate() : 1)));
    $$('button', b.parentElement).forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    form.elements[x.role].value = x.iso;
  };
  if (found.prod) form.elements.prod.value = found.prod;
  if (found.exp) form.elements.exp.value = found.exp;
  if (found.bestBefore) form.elements.dateType.value = 'bestBefore';
  const parts = [];
  if (found.prod) parts.push(`الإنتاج ${fmt(parseISO(found.prod))}`);
  if (found.exp) parts.push(`الانتهاء ${fmt(parseISO(found.exp))}`);
  showStatus(`قُرئ ${parts.join(' و')}. تأكد من التاريخين في الحقول قبل الفحص.`, 'success');
}

/* =========================================================
   عرض النتيجة
   ========================================================= */

const ICONS = {
  good: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.2v.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.3v.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};
const STAMP = { good: 'صالح', warn: 'بحذر', bad: 'غير صالح' };

function renderResult(d, r) {
  const el = $('#result');
  el.className = 'result ' + r.verdict;

  // شريط عمر المنتج من الإنتاج إلى الانتهاء
  let life = '';
  const end = r.effectiveExp;
  if (end) {
    const left = diffDays(r.today, end);
    const tone = left < 0 ? 'bad' : left <= r.category.nearDays ? 'warn' : 'good';
    const n = Math.abs(left);
    const unit = n === 1 ? 'يوم' : n <= 10 ? 'أيام' : 'يومًا';
    const caption = left === 0 ? 'ينتهي اليوم' : `${unit} ${left < 0 ? 'منذ الانتهاء' : 'على الانتهاء'}`;
    let track = '';
    if (r.prod && r.prod < end) {
      const pct = Math.max(0, Math.min(1, (r.today - r.prod) / (end - r.prod)));
      track = `
        <div class="track" role="img" aria-label="مضى ${Math.round(pct * 100)}٪ من عمر المنتج">
          <span class="fill ${tone}" style="width:${(pct * 100).toFixed(1)}%"></span>
          <span class="today" style="right:${(pct * 100).toFixed(1)}%">اليوم</span>
        </div>
        <div class="track-ends"><span><b>الإنتاج</b>${fmt(r.prod)}</span><span style="text-align:left"><b>${end === r.exp ? 'الانتهاء' : 'آخر يوم آمن'}</b>${fmt(end)}</span></div>`;
    }
    life = `
      <div class="life">
        <div class="life-top"><span class="big ${tone}">${n}</span><span>${caption}</span></div>
        ${track}
      </div>`;
  }

  const groups = Object.entries(GROUPS).map(([key, name]) => {
    const items = r.findings.filter((f) => f.group === key);
    if (!items.length) return '';
    return `<div class="group"><h3>${name}</h3><ul class="findings">${items.map((f) =>
      `<li class="${f.level}">${ICONS[f.level]}<span>${esc(f.text)}</span></li>`).join('')}</ul></div>`;
  }).join('');

  el.innerHTML = `
    <div class="slip-head">
      <div>
        <div class="label">نتيجة الفحص · ${fmt(r.today)}</div>
        <h2>${r.title}</h2>
        <p>${r.advice}</p>
      </div>
      <div class="stamp" aria-hidden="true"><span>${ICONS[r.verdict === 'warn' ? 'warn' : r.verdict]}${STAMP[r.verdict]}</span></div>
    </div>
    <div class="slip-body">
      <div class="product-line">
        <strong>${esc(d.name || 'منتج بدون اسم')}</strong>
        ${d.category ? `<span>${CATEGORIES[d.category].ar}</span>` : ''}
        ${d.barcode ? `<span class="mono">${esc(d.barcode)}</span>` : ''}
      </div>
      ${life}
      <div class="groups">${groups}</div>
    </div>
    <div class="slip-foot">
      <button type="button" class="btn primary" id="newCheck">فحص منتج آخر</button>
    </div>`;
  el.hidden = false;
  $('#newCheck').onclick = () => { resetAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- سجل الفحوصات ---------------- */

let historyFilter = 'all';
const loadHistory = () => store.get('salih.history', []);

function saveHistory(d, r) {
  const list = loadHistory().filter((h) => !(h.data.name === d.name && h.data.barcode === d.barcode && h.data.exp === d.exp));
  list.unshift({ id: Date.now(), at: new Date().toISOString(), verdict: r.verdict, title: r.title, data: { ...d, image: d.image && d.image.startsWith('http') ? d.image : '' } });
  store.set('salih.history', list.slice(0, 30));
  renderHistory();
}

function renderHistory() {
  const all = loadHistory();
  const q = ($('#historySearch').value || '').trim();
  const list = all.filter((h) => (historyFilter === 'all' || h.verdict === historyFilter) &&
    (!q || `${h.data.name} ${h.data.origin} ${h.data.manufacturer}`.includes(q)));
  $('#historyTools').hidden = all.length < 2;
  $('#clearHistory').hidden = !all.length;
  $('#historyEmpty').hidden = !!list.length;
  if (all.length && !list.length) $('#historyEmpty').textContent = 'لا توجد نتائج مطابقة.';
  else $('#historyEmpty').textContent = 'لم تفحص أي منتج بعد. ستظهر هنا نتائج الفحوصات المحفوظة على هذا الجهاز.';
  const when = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  $('#historyList').innerHTML = list.map((h) => `
    <li>
      <button type="button" class="open" data-id="${h.id}">
        <span class="pill ${h.verdict}">${VERDICT_SHORT[h.verdict]}</span>
        <strong>${esc(h.data.name || 'منتج بدون اسم')}</strong>
        <small>${esc(h.title)} · ${when.format(new Date(h.at))}</small>
      </button>
      <button type="button" class="icon-btn del" data-del="${h.id}" aria-label="حذف ${esc(h.data.name)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </li>`).join('');
}

/* ---------------- أمثلة جاهزة للتجربة ---------------- */

function samples() {
  const t = startOfToday();
  const iso = (n) => toISO(addDays(t, n));
  return [
    { label: 'حليب منتهي', data: { name: 'حليب طازج كامل الدسم (مثال)', barcode: withCheckDigit('628100000101'), category: 'dairy', prod: iso(-8), exp: iso(-1), dateType: 'useBy', allergens: ['milk'], traces: [], storage: 'suitable', manufacturer: 'مصنع ألبان محلي', origin: 'السعودية', batch: 'L2407', signs: [] } },
    { label: 'علبة منتفخة', data: { name: 'فول مدمس معلّب (مثال)', barcode: withCheckDigit('622100000202'), category: 'canned', prod: iso(-210), exp: iso(520), dateType: 'useBy', allergens: [], traces: [], storage: 'suitable', manufacturer: 'شركة أغذية معلبة', origin: 'مصر', batch: 'B1188', signs: ['swollen'] } },
    { label: 'لبنة طازجة', data: { name: 'لبنة كاملة الدسم (مثال)', barcode: withCheckDigit('629100000303'), category: 'dairy', prod: iso(-3), exp: iso(18), dateType: 'useBy', allergens: ['milk'], traces: [], storage: 'suitable', manufacturer: 'مزارع الألبان', origin: 'الإمارات', batch: 'LB031', signs: [] } },
    { label: 'خبز ينتهي غدًا', data: { name: 'خبز توست أبيض (مثال)', barcode: withCheckDigit('625100000404'), category: 'bakery', prod: iso(-4), exp: iso(1), dateType: 'bestBefore', allergens: ['gluten'], traces: ['sesame', 'milk'], storage: 'uncertain', manufacturer: 'مخبز الحي', origin: 'الأردن', batch: '', signs: [] } },
  ];
}

/* ---------------- ربط الأحداث ---------------- */

function resetAll() {
  form.reset();
  setProductImage('');
  syncOpened();
  syncStorageHint();
  $('#result').hidden = true;
  $('#ocrPanel').hidden = true;
  hideStatus();
}

function init() {
  fillOptions();
  markMyAllergies();
  renderHistory();

  $('#sampleButtons').innerHTML = samples().map((s, i) => `<button type="button" data-sample="${i}">${s.label}</button>`).join('');
  $('#sampleButtons').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sample]');
    if (!b) return;
    const s = samples()[+b.dataset.sample];
    setData(s.data);
    hideStatus();
    $('#ocrPanel').hidden = true;
    const d = getData();
    renderResult(d, analyze(d));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = getData();
    if (!d.name && !d.barcode && !d.exp && !d.prod) {
      showStatus('أدخل اسم المنتج أو تاريخ الانتهاء على الأقل، أو استخدم الكاميرا.', 'error');
      form.elements.name.focus();
      return;
    }
    hideStatus();
    const r = analyze(d);
    renderResult(d, r);
    saveHistory(d, r);
  });
  form.addEventListener('reset', () => setTimeout(() => {
    setProductImage(''); syncOpened(); syncStorageHint(); $('#result').hidden = true; $('#ocrPanel').hidden = true; hideStatus();
  }));

  form.elements.opened.addEventListener('change', syncOpened);
  form.elements.category.addEventListener('change', syncStorageHint);

  // الكاميرا
  $('#btnScan').addEventListener('click', openScanner);
  $('#btnOcr').addEventListener('click', () => $('#ocrFile').click());
  $('#ocrFile').addEventListener('change', (e) => { readDatesFromPhoto(e.target.files[0]); e.target.value = ''; });
  $('#barcodeFile').addEventListener('change', (e) => { scanBarcodeFile(e.target.files[0]); e.target.value = ''; });
  $('#scanFromPhoto').addEventListener('click', async () => { await closeScanner(); $('#barcodeFile').click(); });
  $('#manualBarcode').addEventListener('click', async () => { await closeScanner(); form.elements.barcode.focus(); });
  form.elements.barcode.addEventListener('change', () => {
    const code = form.elements.barcode.value.replace(/\D/g, '');
    if (validBarcode(code) && !form.elements.name.value) handleBarcode(code);
  });

  // النوافذ المنبثقة
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => {
    const dlg = b.closest('dialog');
    if (dlg.id === 'scanDialog') closeScanner(); else dlg.close();
  }));
  $('#scanDialog').addEventListener('cancel', (e) => { e.preventDefault(); closeScanner(); });
  $('#btnMyAllergy').addEventListener('click', openAllergyDialog);
  $('#saveAllergies').addEventListener('click', () => {
    store.set('salih.myAllergies', $$('#myAllergies input:checked').map((i) => i.value));
    markMyAllergies();
    $('#allergyDialog').close();
    if (!$('#result').hidden) { const d = getData(); renderResult(d, analyze(d)); }
  });

  // السجل
  $('#historySearch').addEventListener('input', renderHistory);
  $('#historyFilters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    historyFilter = b.dataset.filter;
    $$('#historyFilters button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    renderHistory();
  });
  $('#historyList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      store.set('salih.history', loadHistory().filter((h) => String(h.id) !== del.dataset.del));
      renderHistory();
      return;
    }
    const open = e.target.closest('[data-id]');
    if (!open) return;
    const h = loadHistory().find((x) => String(x.id) === open.dataset.id);
    if (!h) return;
    setData(h.data);
    renderResult(h.data, analyze(h.data));
  });
  $('#clearHistory').addEventListener('click', () => { store.set('salih.history', []); renderHistory(); });
}

init();
