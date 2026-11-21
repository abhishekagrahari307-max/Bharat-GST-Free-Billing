// Bharat AI Voice Billing™ — 100% Offline Hinglish / Hindi / Indian English
// Voice & Natural-Language Command Parser for Instant GST Invoicing.
// Zero external API keys, zero cloud latency, 100% private on device.

const HINDI_NUMBER_WORDS = {
  ek: 1, one: 1, 'एक': 1,
  do: 2, two: 2, 'दो': 2,
  teen: 3, three: 3, 'तीन': 3,
  char: 4, chaar: 4, four: 4, 'चार': 4,
  paanch: 5, panch: 5, five: 5, 'पांच': 5, 'पाँच': 5,
  chhe: 6, che: 6, six: 6, 'छह': 6,
  saat: 7, seven: 7, 'सात': 7,
  aath: 8, eight: 8, 'आठ': 8,
  nau: 9, nine: 9, 'नौ': 9,
  das: 10, ten: 10, 'दस': 10,
  gyarah: 11, eleven: 11, 'ग्यारह': 11,
  baarah: 12, barah: 12, twelve: 12, 'बारह': 12,
  pandrah: 15, fifteen: 15, 'पंद्रह': 15,
  bees: 20, twenty: 20, 'बीस': 20,
  pachis: 25, pacchis: 25, 'पच्चीस': 25,
  tees: 30, thirty: 30, 'तीस': 30,
  chalis: 40, forty: 40, 'चालीस': 40,
  pachaas: 50, pachas: 50, fifty: 50, 'पचास': 50,
  saath: 60, sixty: 60, 'साठ': 60,
  sattar: 70, seventy: 70, 'सत्तर': 70,
  assi: 80, eighty: 80, 'अस्सी': 80,
  nabbe: 90, ninety: 90, 'नब्बे': 90,
  sau: 100, hundred: 100, 'सौ': 100,
  hazaar: 1000, hazar: 1000, thousand: 1000, 'हजार': 1000, 'हज़ार': 1000,
};

const UNIT_ALIASES = {
  pc: 'Nos', pcs: 'Nos', piece: 'Nos', pieces: 'Nos', nos: 'Nos', no: 'Nos', unit: 'Nos', units: 'Nos', nag: 'Nos', 'नग': 'Nos', 'पीस': 'Nos',
  kg: 'Kg', kgs: 'Kg', kilo: 'Kg', kilogram: 'Kg', 'किलो': 'Kg',
  gm: 'Gm', gram: 'Gm', grams: 'Gm', 'ग्राम': 'Gm',
  ltr: 'Ltr', litre: 'Ltr', liter: 'Ltr', litres: 'Ltr', l: 'Ltr', 'लीटर': 'Ltr',
  ml: 'Ml',
  box: 'Box', boxes: 'Box', dabba: 'Box', carton: 'Box', 'बॉक्स': 'Box',
  pkt: 'Pkt', packet: 'Pkt', packets: 'Pkt', pack: 'Pkt', 'पैकेट': 'Pkt',
  bag: 'Bag', bags: 'Bag', bori: 'Bag', 'बैग': 'Bag', 'बोरी': 'Bag',
  strip: 'Strip', strips: 'Strip', patti: 'Strip', 'स्ट्रिप': 'Strip',
  btl: 'Btl', bottle: 'Btl', bottles: 'Btl', 'बोतल': 'Btl',
  mtr: 'Mtr', meter: 'Mtr', metre: 'Mtr', meters: 'Mtr', 'मीटर': 'Mtr',
  ft: 'Sqft', sqft: 'Sqft',
  hr: 'Hrs', hrs: 'Hrs', hour: 'Hrs', hours: 'Hrs', ghanta: 'Hrs', 'घंटे': 'Hrs',
  day: 'Days', days: 'Days', din: 'Days',
  month: 'Months', months: 'Months', mahina: 'Months',
  doz: 'Doz', dozen: 'Doz', darjan: 'Doz',
};

const VALID_GST_SLABS = [0, 0.1, 0.25, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

/**
 * Replaces standalone Hindi/English number words with digits.
 */
export function normalizeSpokenNumbers(input) {
  if (!input || typeof input !== 'string') return '';
  // Convert Devanagari digits ०-९ to 0-9
  const ascii = input.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
  return ascii
    .split(/(\s+)/)
    .map((tok) => {
      const clean = tok.toLowerCase().replace(/[.,;:!?]/g, '');
      if (Object.prototype.hasOwnProperty.call(HINDI_NUMBER_WORDS, clean)) {
        return String(HINDI_NUMBER_WORDS[clean]);
      }
      return tok;
    })
    .join('');
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Fuzzy-matches a spoken product description against saved products.
 */
export function matchSavedProduct(spokenName, products = []) {
  const needle = normalizeKey(spokenName);
  if (!needle || !Array.isArray(products) || products.length === 0) return null;

  let best = null;
  let bestScore = 0;
  const needleTokens = new Set(needle.split(' ').filter(Boolean));

  for (const p of products) {
    const pName = normalizeKey(p?.name || p?.description || '');
    if (!pName) continue;
    if (pName === needle) return p;

    let score = 0;
    if (pName.includes(needle) || needle.includes(pName)) {
      score = 0.85;
    } else {
      const pTokens = pName.split(' ').filter(Boolean);
      const hits = pTokens.filter((t) => needleTokens.has(t)).length;
      if (hits > 0) {
        score = hits / Math.max(pTokens.length, needleTokens.size);
      }
    }
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/**
 * Fuzzy-matches a spoken client name against saved clients.
 */
export function matchSavedClient(spokenClient, clients = []) {
  const needle = normalizeKey(spokenClient);
  if (!needle || !Array.isArray(clients) || clients.length === 0) return null;

  for (const c of clients) {
    const cName = normalizeKey(c?.name || '');
    if (cName === needle) return c;
  }
  for (const c of clients) {
    const cName = normalizeKey(c?.name || '');
    if (cName && (cName.includes(needle) || needle.includes(cName))) return c;
  }
  return null;
}

function snapGstSlab(val) {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 18;
  if (VALID_GST_SLABS.includes(num)) return num;
  let closest = 18;
  let bestDiff = Infinity;
  for (const slab of VALID_GST_SLABS) {
    const diff = Math.abs(slab - num);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = slab;
    }
  }
  return bestDiff <= 2 ? closest : num;
}

/**
 * Parses a natural-language / voice billing transcript into structured client + line items.
 *
 * Examples supported:
 * - "Client Sharma Medical, 3 Dolo 650 strip rate 32 gst 12%, 2 Vitamin C box @ 180 gst 12%"
 * - "2 Basmati Rice 5kg rate 450 gst 5 percent aur 4 Mustard Oil 1 ltr 165 rupaye gst 5%"
 * - "Website design 10 hours at 1500 gst 18%"
 */
export function parseVoiceTranscript(rawTranscript, { products = [], clients = [], defaultGst = 18 } = {}) {
  const result = {
    clientName: '',
    matchedClient: null,
    items: [],
    unparsed: [],
  };
  if (!rawTranscript || !String(rawTranscript).trim()) return result;

  const normalized = normalizeSpokenNumbers(String(rawTranscript).trim());

  // Split into clauses on commas, semicolons, newlines, " plus ", " aur ", " and ", " तथा ", " और "
  const rawSegments = normalized
    .split(/(?:,|;|\n|\bplus\b|\baur\b|\band\b|और|तथा)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let seg of rawSegments) {
    // 1. Check if segment specifies client / party / customer
    const clientMatch = seg.match(/^(?:client|customer|party|bill\s*to|ग्राहक|पार्टी|क्लाइंट)\s*[:-]?\s*(.+)$/i);
    if (clientMatch) {
      const cRaw = clientMatch[1].trim();
      result.clientName = cRaw;
      result.matchedClient = matchSavedClient(cRaw, clients);
      continue;
    }

    let working = seg;

    // 2. Extract GST rate if spoken: "gst 18%", "18% gst", "tax 5 percent", "जीएसटी 12%"
    let gstRate = null;
    const gstPatterns = [
      /(?:gst|tax|igst|जीएसटी|टैक्स)\s*(?:@|of|is|rate)?\s*(\d+(?:\.\d+)?)\s*(?:%|percent|प्रतिशत)?/i,
      /(\d+(?:\.\d+)?)\s*(?:%|percent|प्रतिशत)\s*(?:gst|tax|जीएसटी)/i,
    ];
    for (const gp of gstPatterns) {
      const m = working.match(gp);
      if (m) {
        gstRate = snapGstSlab(parseFloat(m[1]));
        working = working.replace(m[0], ' ').trim();
        break;
      }
    }

    // 3. Extract Discount if spoken: "discount 10%", "less 5%"
    let discount = 0;
    const discMatch = working.match(/(?:discount|disc|less|छूट)\s*(\d+(?:\.\d+)?)\s*%?/i);
    if (discMatch) {
      discount = Math.min(100, Math.max(0, parseFloat(discMatch[1]) || 0));
      working = working.replace(discMatch[0], ' ').trim();
    }

    // 4. Extract Rate / Price: "rate 450", "@ 450", "at 1500", "rs 380", "₹380", "380 rupaye", "price 250"
    let rate = null;
    const ratePatterns = [
      /(?:rate|price|mrp|@|at|rs\.?|inr|₹|रेट|भाव|कीमत)\s*(\d+(?:\.\d+)?)/i,
      /(\d+(?:\.\d+)?)\s*(?:rupaye|rupees|rs\.?|inr|का|रुपये|रुपए)\b/i,
    ];
    for (const rp of ratePatterns) {
      const m = working.match(rp);
      if (m) {
        rate = parseFloat(m[1]);
        working = working.replace(m[0], ' ').trim();
        break;
      }
    }

    // 5. Extract Quantity + Optional Unit either at start ("3 strip Dolo 650" / "3 Dolo 650")
    //    or after name ("Website design 10 hours" / "Cement 5 bag")
    let quantity = 1;
    let unit = '';
    const unitKeys = Object.keys(UNIT_ALIASES).join('|');
    const leadingQtyUnit = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(?:(${unitKeys})\\b)?\\s+(.+)$`, 'i');
    const trailingQtyUnit = new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${unitKeys})\\b(.*)$`, 'i');

    const mLead = working.match(leadingQtyUnit);
    const mTrail = !mLead ? working.match(trailingQtyUnit) : null;

    if (mLead) {
      quantity = parseFloat(mLead[1]) || 1;
      if (mLead[2]) unit = UNIT_ALIASES[mLead[2].toLowerCase()] || '';
      working = mLead[3].trim();
      // Check if unit appears right at the end of item name (e.g. "3 Dolo 650 strip")
      if (!unit) {
        const endUnit = working.match(new RegExp(`^(.+?)\\s+(${unitKeys})$`, 'i'));
        if (endUnit) {
          working = endUnit[1].trim();
          unit = UNIT_ALIASES[endUnit[2].toLowerCase()] || '';
        }
      }
    } else if (mTrail) {
      working = `${mTrail[1]} ${mTrail[4] || ''}`.trim();
      quantity = parseFloat(mTrail[2]) || 1;
      unit = UNIT_ALIASES[mTrail[3].toLowerCase()] || '';
    } else if (rate === null) {
      // Check trailing standalone number as price if > 10: e.g. "Samosa 20"
      const tailNum = working.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
      if (tailNum) {
        working = tailNum[1].trim();
        rate = parseFloat(tailNum[2]);
      }
    }

    // Clean leftover filler words
    const cleanedName = working
      .replace(/\b(?:ka|ki|ke|for|each|per|wala)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedName) {
      result.unparsed.push(seg);
      continue;
    }

    // 6. Match against saved catalog products if available
    const savedProd = matchSavedProduct(cleanedName, products);
    const finalName = savedProd?.name || cleanedName.replace(/\b\w/g, (c) => c.toUpperCase());
    const finalRate = rate !== null
      ? rate
      : Number(savedProd?.sellingPrice ?? savedProd?.price ?? savedProd?.rate ?? 0);
    const finalGst = gstRate !== null
      ? gstRate
      : Number(savedProd?.gstRate ?? savedProd?.taxRate ?? defaultGst);
    const finalUnit = unit || savedProd?.unit || 'Nos';
    const finalHsn = savedProd?.hsn || savedProd?.hsnCode || '';

    result.items.push({
      description: finalName,
      hsn: finalHsn,
      quantity: quantity > 0 ? quantity : 1,
      unit: finalUnit,
      rate: Number.isFinite(finalRate) ? finalRate : 0,
      discount,
      gstRate: Number.isFinite(finalGst) ? finalGst : defaultGst,
      matchedFromCatalog: Boolean(savedProd),
    });
  }

  return result;
}
