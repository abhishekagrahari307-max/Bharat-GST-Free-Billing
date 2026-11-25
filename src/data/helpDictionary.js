// Searchable Hinglish GST, Income-Tax & Business Glossary (v5.2.0)
// Pure data module — safe to import in both browser UI and Node unit tests.

export const HELP_DICTIONARY_CATEGORIES = [
  'ALL',
  'GST Basics',
  'GST Returns',
  'Income Tax',
  'Billing',
  'Inventory',
  'Manufacturing',
  'Logistics',
];

export const HELP_DICTIONARY_TERMS = [
  {
    term: 'HSN / SAC Code',
    category: 'GST Basics',
    shortDesc: 'हर सामान (HSN) और सेवा (SAC) का सरकारी 4, 6 या 8 अंकों का संख्यात्मक (numeric) पहचान कोड।',
    example: 'जैसे चावल के लिए 1006, सरसों तेल के लिए 1514, LED बल्ब के लिए 8539। ₹5 करोड़ तक टर्नओवर पर 4-अंक और उससे ऊपर 6-अंक अनिवार्य है।',
  },
  {
    term: 'ITC (Input Tax Credit)',
    category: 'GST Basics',
    shortDesc: 'माल खरीदते समय सप्लायर को दिया गया GST, जिसे आप अपनी बिक्री के GST से घटा सकते हैं।',
    example: 'आपने ₹100 के सामान पर ₹18 GST देकर खरीदा और ₹150 (+₹27 GST) में बेचा, तो सरकार को केवल ₹27 - ₹18 = ₹9 ही जमा करना होगा।',
  },
  {
    term: 'Place of Supply (CGST+SGST बनाम IGST)',
    category: 'GST Basics',
    shortDesc: 'एक ही राज्य (Intra-state) में बिक्री होने पर टैक्स आधा-आधा CGST + SGST में बँटता है; दूसरे राज्य (Inter-state) में पूरा IGST लगता है।',
    example: 'उत्तर प्रदेश से उत्तर प्रदेश में 18% जीएसटी = 9% CGST + 9% SGST; उत्तर प्रदेश से दिल्ली में = 18% IGST।',
  },
  {
    term: 'GSTR-1 vs GSTR-2B vs GSTR-3B',
    category: 'GST Returns',
    shortDesc: 'GSTR-1 आपकी बिक्री का ब्योरा है, GSTR-2B आपकी खरीद पर मिलने वाले ITC का ऑटो-स्टेटमेंट है, और GSTR-3B नेट टैक्स जमा करने का मासिक समरी फॉर्म है।',
    example: 'आमतौर पर मासिक फाइलर्स के लिए हर महीने की 11 तारीख तक GSTR-1 और 20 तारीख तक GSTR-3B फाइल किया जाता है।',
  },
  {
    term: 'GSTR-9 & CMP-08',
    category: 'GST Returns',
    shortDesc: 'GSTR-9 नियमित करदाताओं का वार्षिक (Annual) रिटर्न है; CMP-08 कंपोज़िशन व्यापारियों का तिमाही टैक्स स्टेटमेंट है।',
    example: 'पूरे वित्त वर्ष की कुल बिक्री, क्रेडिट नोट और ITC का अंतिम मिलान GSTR-9 वर्किंग शीट से किया जाता है।',
  },
  {
    term: 'Section 43B(h) — MSME 15/45 दिन नियम',
    category: 'Income Tax',
    shortDesc: 'रजिस्टर्ड Micro या Small (MSME Udyam) सप्लायर से खरीदे गए माल का भुगतान तय समय सीमा में करना अनिवार्य है।',
    example: 'लिखित समझौता न होने पर 15 दिन और लिखित समझौता होने पर अधिकतम 45 दिन में भुगतान न करने पर वह खर्च उस वर्ष की आय में जुड़कर टैक्स लग सकता है।',
  },
  {
    term: 'Section 44AD / 44ADA (ITR-4 Presumptive Tax)',
    category: 'Income Tax',
    shortDesc: 'छोटे व्यापारियों के लिए बिना जटिल ऑडिट के सीधे टर्नओवर के 6% (डिजिटल) या 8% (नकद) अनुमानित लाभ पर टैक्स भरने की योजना।',
    example: 'कुल प्राप्तियों में नकद (Cash) 5% या कम होने पर 44AD सीमा ₹3 करोड़ है; नकद 5% से अधिक होने पर सीमा ₹2 करोड़ रहती है।',
  },
  {
    term: 'Section 87A Marginal Relief (New Regime)',
    category: 'Income Tax',
    shortDesc: 'नई टैक्स व्यवस्था में कर-मुक्त सीमा से थोड़ी अधिक आय होने पर अतिरिक्त टैक्स आपकी अतिरिक्त आय से ज़्यादा नहीं हो सकता।',
    example: 'यदि छूट सीमा से आय केवल ₹10,000 अधिक है, तो टैक्स भी ₹10,000 (+ सेस) से अधिक नहीं लगेगा।',
  },
  {
    term: 'Credit Note (क्रेडिट नोट)',
    category: 'Billing',
    shortDesc: 'बिका हुआ माल वापस आने (Sales Return) या बिल में ज़्यादा रेट लग जाने पर पार्टी का बकाया और GST घटाने का दस्तावेज़।',
    example: 'यह आपकी कुल शुद्ध बिक्री (Net Turnover) और देय GST दोनों को कम करता है।',
  },
  {
    term: 'Debit Note (डेबिट नोट)',
    category: 'Billing',
    shortDesc: 'खरीदा हुआ माल सप्लायर को वापस करने (Purchase Return) या कम रेट लगने पर अंतर वसूलने का दस्तावेज़।',
    example: 'खराब माल सप्लायर को लौटाने पर डेबिट नोट जारी करके सप्लायर का खाता कम किया जाता है।',
  },
  {
    term: 'FEFO (First-Expiry, First-Out)',
    category: 'Inventory',
    shortDesc: 'जिस बैच की एक्सपायरी डेट सबसे नज़दीक है, उसे बिलिंग में सबसे पहले बाहर निकालना।',
    example: 'दवा, किराना, डेयरी और पैक्ड फ़ूड में एक्सपायरी से होने वाले नुकसान को रोकता है।',
  },
  {
    term: 'BOM (Bill of Materials)',
    category: 'Manufacturing',
    shortDesc: 'कच्चे माल (Raw Material) से तैयार माल (Finished Goods) बनाने की सामग्री और मात्रा का फ़ॉर्मूला।',
    example: '100 किलो कच्चा माल + पैकिंग से तैयार पैकेट बनने पर कच्चा स्टॉक अपने-आप घटता है और तैयार स्टॉक बढ़ता है।',
  },
  {
    term: 'RCM (Reverse Charge Mechanism)',
    category: 'GST Basics',
    shortDesc: 'कुछ सेवाओं (जैसे ट्रांसपोर्ट/GTA भाड़ा या अधिसूचित खरीद) में सप्लायर की जगह खरीदार खुद सरकार को GST जमा करता है।',
    example: 'ट्रक भाड़े पर RCM में GST जमा करके पात्र होने पर उसका ITC क्लेम किया जा सकता है।',
  },
  {
    term: 'E-Way Bill (ई-वे बिल)',
    category: 'Logistics',
    shortDesc: 'सामान्यता ₹50,000 से अधिक मूल्य के माल को एक स्थान से दूसरे स्थान भेजने के लिए आवश्यक इलेक्ट्रॉनिक परमिट।',
    example: 'सामान्य कार्गो में प्रति 200 किमी दूरी के लिए लगभग 1 दिन की वैधता मिलती है।',
  },
];
