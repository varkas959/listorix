// ── Listorix i18n ──────────────────────────────────────────────────────────────
// Supports English + 9 major Indian languages.
// Only the profile/settings UI strings are translated here.
// Grocery item names remain in English (user-entered).

export interface Language {
  code:   string;
  name:   string;   // English name
  native: string;   // Name in the language itself
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English',   native: 'English'    },
  { code: 'hi', name: 'Hindi',     native: 'हिन्दी'      },
  { code: 'ta', name: 'Tamil',     native: 'தமிழ்'       },
  { code: 'te', name: 'Telugu',    native: 'తెలుగు'      },
  { code: 'kn', name: 'Kannada',   native: 'ಕನ್ನಡ'       },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം'      },
  { code: 'bn', name: 'Bengali',   native: 'বাংলা'        },
  { code: 'mr', name: 'Marathi',   native: 'मराठी'       },
  { code: 'gu', name: 'Gujarati',  native: 'ગુજરાતી'     },
  { code: 'pa', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ'      },
];

export interface Strings {
  // Page title
  profile: string;
  // Section headers
  preferences: string;
  data: string;
  account: string;
  legal: string;
  // Preferences items
  defaultStore: string;
  monthlyBudget: string;
  currency: string;
  language: string;
  // Data items
  exportHistory: string;
  clearAllLists: string;
  // Account items
  notifications: string;
  version: string;
  signOut: string;
  // Legal items
  termsOfService: string;
  privacyPolicy: string;
  // Common
  cancel: string;
  save: string;
  notSet: string;
  on: string;
  off: string;
}

const T: Record<string, Strings> = {
  en: {
    profile: 'Profile', preferences: 'Preferences', data: 'Data',
    account: 'Account', legal: 'Legal',
    defaultStore: 'Default Store', monthlyBudget: 'Monthly Budget',
    currency: 'Currency', language: 'Language',
    exportHistory: 'Export History', clearAllLists: 'Clear All Lists',
    notifications: 'Notifications', version: 'Version', signOut: 'Stop syncing & sign out',
    termsOfService: 'Terms of Service', privacyPolicy: 'Privacy Policy',
    cancel: 'Cancel', save: 'Save', notSet: 'Not set', on: 'On', off: 'Off',
  },
  hi: {
    profile: 'प्रोफ़ाइल', preferences: 'प्राथमिकताएं', data: 'डेटा',
    account: 'खाता', legal: 'कानूनी',
    defaultStore: 'डिफ़ॉल्ट स्टोर', monthlyBudget: 'मासिक बजट',
    currency: 'मुद्रा', language: 'भाषा',
    exportHistory: 'इतिहास निर्यात करें', clearAllLists: 'सभी सूचियाँ साफ़ करें',
    notifications: 'सूचनाएं', version: 'संस्करण', signOut: 'साइन आउट',
    termsOfService: 'सेवा की शर्तें', privacyPolicy: 'गोपनीयता नीति',
    cancel: 'रद्द करें', save: 'सहेजें', notSet: 'सेट नहीं', on: 'चालू', off: 'बंद',
  },
  ta: {
    profile: 'சுயவிவரம்', preferences: 'விருப்பங்கள்', data: 'தரவு',
    account: 'கணக்கு', legal: 'சட்டம்',
    defaultStore: 'இயல்புநிலை கடை', monthlyBudget: 'மாதாந்திர பட்ஜெட்',
    currency: 'நாணயம்', language: 'மொழி',
    exportHistory: 'வரலாற்றை ஏற்றுமதி செய்', clearAllLists: 'அனைத்து பட்டியல்களையும் அழி',
    notifications: 'அறிவிப்புகள்', version: 'பதிப்பு', signOut: 'வெளியேறு',
    termsOfService: 'சேவை விதிமுறைகள்', privacyPolicy: 'தனியுரிமைக் கொள்கை',
    cancel: 'ரத்து', save: 'சேமி', notSet: 'அமைக்கப்படவில்லை', on: 'இயக்கு', off: 'நிறுத்து',
  },
  te: {
    profile: 'ప్రొఫైల్', preferences: 'ప్రాధాన్యతలు', data: 'డేటా',
    account: 'ఖాతా', legal: 'చట్టపరమైన',
    defaultStore: 'డిఫాల్ట్ స్టోర్', monthlyBudget: 'నెలవారీ బడ్జెట్',
    currency: 'కరెన్సీ', language: 'భాష',
    exportHistory: 'చరిత్రను ఎగుమతి చేయి', clearAllLists: 'అన్ని జాబితాలు క్లియర్ చేయి',
    notifications: 'నోటిఫికేషన్లు', version: 'వెర్షన్', signOut: 'సైన్ అవుట్',
    termsOfService: 'సేవా నిబంధనలు', privacyPolicy: 'గోప్యతా విధానం',
    cancel: 'రద్దు చేయి', save: 'సేవ్ చేయి', notSet: 'సెట్ చేయలేదు', on: 'ఆన్', off: 'ఆఫ్',
  },
  kn: {
    profile: 'ಪ್ರೊಫೈಲ್', preferences: 'ಆದ್ಯತೆಗಳು', data: 'ಡೇಟಾ',
    account: 'ಖಾತೆ', legal: 'ಕಾನೂನು',
    defaultStore: 'ಡಿಫಾಲ್ಟ್ ಅಂಗಡಿ', monthlyBudget: 'ಮಾಸಿಕ ಬಜೆಟ್',
    currency: 'ಕರೆನ್ಸಿ', language: 'ಭಾಷೆ',
    exportHistory: 'ಇತಿಹಾಸ ರಫ್ತು ಮಾಡಿ', clearAllLists: 'ಎಲ್ಲಾ ಪಟ್ಟಿಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ',
    notifications: 'ಅಧಿಸೂಚನೆಗಳು', version: 'ಆವೃತ್ತಿ', signOut: 'ಸೈನ್ ಔಟ್',
    termsOfService: 'ಸೇವಾ ನಿಯಮಗಳು', privacyPolicy: 'ಗೌಪ್ಯತಾ ನೀತಿ',
    cancel: 'ರದ್ದು', save: 'ಉಳಿಸು', notSet: 'ಹೊಂದಿಸಲಾಗಿಲ್ಲ', on: 'ಆನ್', off: 'ಆಫ್',
  },
  ml: {
    profile: 'പ്രൊഫൈൽ', preferences: 'മുൻഗണനകൾ', data: 'ഡാറ്റ',
    account: 'അക്കൗണ്ട്', legal: 'നിയമം',
    defaultStore: 'ഡിഫോൾട്ട് സ്റ്റോർ', monthlyBudget: 'മാസിക ബജറ്റ്',
    currency: 'കറൻസി', language: 'ഭാഷ',
    exportHistory: 'ചരിത്രം കയറ്റുമതി', clearAllLists: 'എല്ലാ ലിസ്റ്റുകളും മായ്ക്കുക',
    notifications: 'അറിയിപ്പുകൾ', version: 'പതിപ്പ്', signOut: 'സൈൻ ഔട്ട്',
    termsOfService: 'സേവന നിബന്ധനകൾ', privacyPolicy: 'സ്വകാര്യതാ നയം',
    cancel: 'റദ്ദാക്കുക', save: 'സംരക്ഷിക്കുക', notSet: 'സജ്ജമാക്കിയിട്ടില്ല', on: 'ഓൺ', off: 'ഓഫ്',
  },
  bn: {
    profile: 'প্রোফাইল', preferences: 'পছন্দসমূহ', data: 'তথ্য',
    account: 'অ্যাকাউন্ট', legal: 'আইনি',
    defaultStore: 'ডিফল্ট স্টোর', monthlyBudget: 'মাসিক বাজেট',
    currency: 'মুদ্রা', language: 'ভাষা',
    exportHistory: 'ইতিহাস রপ্তানি করুন', clearAllLists: 'সব তালিকা মুছুন',
    notifications: 'বিজ্ঞপ্তি', version: 'সংস্করণ', signOut: 'সাইন আউট',
    termsOfService: 'পরিষেবার শর্তাবলী', privacyPolicy: 'গোপনীয়তা নীতি',
    cancel: 'বাতিল', save: 'সংরক্ষণ', notSet: 'সেট করা হয়নি', on: 'চালু', off: 'বন্ধ',
  },
  mr: {
    profile: 'प्रोफाइल', preferences: 'पसंती', data: 'डेटा',
    account: 'खाते', legal: 'कायदेशीर',
    defaultStore: 'डीफॉल्ट दुकान', monthlyBudget: 'मासिक बजेट',
    currency: 'चलन', language: 'भाषा',
    exportHistory: 'इतिहास निर्यात करा', clearAllLists: 'सर्व याद्या साफ करा',
    notifications: 'सूचना', version: 'आवृत्ती', signOut: 'साइन आउट',
    termsOfService: 'सेवेच्या अटी', privacyPolicy: 'गोपनीयता धोरण',
    cancel: 'रद्द करा', save: 'जतन करा', notSet: 'सेट नाही', on: 'चालू', off: 'बंद',
  },
  gu: {
    profile: 'પ્રોફાઇલ', preferences: 'પસંદગીઓ', data: 'ડેટા',
    account: 'ખાતું', legal: 'કાનૂની',
    defaultStore: 'ડિફૉલ્ટ સ્ટોર', monthlyBudget: 'માસિક બજેટ',
    currency: 'ચલણ', language: 'ભાષા',
    exportHistory: 'ઇતિહાસ નિકાસ કરો', clearAllLists: 'બધી સૂચિ સાફ કરો',
    notifications: 'સૂચનાઓ', version: 'આવૃત્તિ', signOut: 'સાઇન આઉટ',
    termsOfService: 'સેવાની શરતો', privacyPolicy: 'ગોપનીયતા નીતિ',
    cancel: 'રદ કરો', save: 'સાચવો', notSet: 'સેટ નથી', on: 'ચાલુ', off: 'બંધ',
  },
  pa: {
    profile: 'ਪ੍ਰੋਫਾਈਲ', preferences: 'ਤਰਜੀਹਾਂ', data: 'ਡੇਟਾ',
    account: 'ਖਾਤਾ', legal: 'ਕਾਨੂੰਨੀ',
    defaultStore: 'ਡਿਫਾਲਟ ਸਟੋਰ', monthlyBudget: 'ਮਾਸਿਕ ਬਜਟ',
    currency: 'ਮੁਦਰਾ', language: 'ਭਾਸ਼ਾ',
    exportHistory: 'ਇਤਿਹਾਸ ਨਿਰਯਾਤ ਕਰੋ', clearAllLists: 'ਸਾਰੀਆਂ ਸੂਚੀਆਂ ਸਾਫ਼ ਕਰੋ',
    notifications: 'ਸੂਚਨਾਵਾਂ', version: 'ਸੰਸਕਰਣ', signOut: 'ਸਾਈਨ ਆਊਟ',
    termsOfService: 'ਸੇਵਾ ਦੀਆਂ ਸ਼ਰਤਾਂ', privacyPolicy: 'ਗੋਪਨੀਯਤਾ ਨੀਤੀ',
    cancel: 'ਰੱਦ ਕਰੋ', save: 'ਸੇਵ ਕਰੋ', notSet: 'ਸੈੱਟ ਨਹੀਂ', on: 'ਚਾਲੂ', off: 'ਬੰਦ',
  },
};

export function getTranslations(langCode: string): Strings {
  return T[langCode] ?? T['en'];
}

export function getLangByCode(code: string): Language {
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0];
}
