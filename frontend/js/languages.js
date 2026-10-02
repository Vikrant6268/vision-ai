// =====================================================================
// languages.js – CLIENT-side language data.
//
// Holds the on-screen/spoken interface text and the voice tag used by
// text-to-speech. Kept in the browser (not fetched from the server) so
// the app can still SPEAK an error when the server is unreachable.
//
// The server has its own languages.js controlling what we ask Gemini.
// =====================================================================

export const UI = {
  en: {
    speechTag: 'en-IN',
    ready: 'Ready',
    listening: 'Listening...',
    processing: 'Processing...',
    speaking: 'Speaking...',
    cameraStarting: 'Starting camera...',
    cameraOn: 'Camera is on',
    cameraOff: 'Camera is off',
    cameraDenied: 'I need permission to use the camera. Please allow camera access and try again.',
    cameraMissing: 'No camera was found on this device.',
    serverDown: 'I cannot reach the server. Please make sure Vision AI is running.',
    nothingToRepeat: 'There is nothing to repeat yet.',
    help: 'You can say: describe surroundings, read this, translate this, detect objects, who is this, repeat, stop, or help.',
    languageSet: 'Language set to English.',
    walkOn: 'Walk mode on. I will warn you about obstacles ahead. This is an aid, so please stay careful.',
    walkOff: 'Walk mode off.',
  },
  hi: {
    speechTag: 'hi-IN',
    ready: 'तैयार',
    listening: 'सुन रहा हूँ...',
    processing: 'प्रोसेस हो रहा है...',
    speaking: 'बोल रहा हूँ...',
    cameraStarting: 'कैमरा शुरू हो रहा है...',
    cameraOn: 'कैमरा चालू है',
    cameraOff: 'कैमरा बंद है',
    cameraDenied: 'मुझे कैमरे की अनुमति चाहिए। कृपया कैमरा चालू करने की अनुमति दें।',
    cameraMissing: 'इस डिवाइस पर कैमरा नहीं मिला।',
    serverDown: 'मैं सर्वर से संपर्क नहीं कर पा रहा हूँ। कृपया देखें कि Vision AI चल रहा है।',
    nothingToRepeat: 'दोहराने के लिए अभी कुछ नहीं है।',
    help: 'आप कह सकते हैं: आसपास बताओ, यह पढ़ो, इसका अनुवाद करो, वस्तुएँ पहचानो, यह कौन है, दोहराओ, रुको, या मदद।',
    languageSet: 'भाषा हिंदी कर दी गई है।',
    walkOn: 'चलने का मोड चालू। मैं सामने की रुकावटों के बारे में बताऊँगा। यह केवल सहायता है, कृपया सावधान रहें।',
    walkOff: 'चलने का मोड बंद।',
  },
  mr: {
    speechTag: 'mr-IN',
    ready: 'तयार',
    listening: 'ऐकत आहे...',
    processing: 'प्रक्रिया सुरू आहे...',
    speaking: 'बोलत आहे...',
    cameraStarting: 'कॅमेरा सुरू होत आहे...',
    cameraOn: 'कॅमेरा सुरू आहे',
    cameraOff: 'कॅमेरा बंद आहे',
    cameraDenied: 'मला कॅमेऱ्याची परवानगी हवी आहे. कृपया कॅमेरा वापरण्यास परवानगी द्या.',
    cameraMissing: 'या उपकरणावर कॅमेरा सापडला नाही.',
    serverDown: 'मला सर्व्हरशी संपर्क साधता येत नाही. कृपया Vision AI सुरू आहे का ते पहा.',
    nothingToRepeat: 'पुन्हा सांगण्यासारखे अजून काही नाही.',
    help: 'तुम्ही म्हणू शकता: आजूबाजूला काय आहे, हे वाचा, याचे भाषांतर करा, वस्तू ओळखा, हे कोण आहे, पुन्हा सांगा, थांबा, किंवा मदत.',
    languageSet: 'भाषा मराठी केली आहे.',
    walkOn: 'चालण्याचा मोड सुरू. मी समोरच्या अडथळ्यांबद्दल सांगेन. ही फक्त मदत आहे, कृपया सावध राहा.',
    walkOff: 'चालण्याचा मोड बंद.',
  },
  gu: {
    speechTag: 'gu-IN',
    ready: 'તૈયાર',
    listening: 'સાંભળી રહ્યો છું...',
    processing: 'પ્રક્રિયા ચાલુ છે...',
    speaking: 'બોલી રહ્યો છું...',
    cameraStarting: 'કૅમેરા શરૂ થઈ રહ્યો છે...',
    cameraOn: 'કૅમેરા ચાલુ છે',
    cameraOff: 'કૅમેરા બંધ છે',
    cameraDenied: 'મને કૅમેરાની પરવાનગી જોઈએ છે. કૃપા કરીને કૅમેરા વાપરવાની પરવાનગી આપો.',
    cameraMissing: 'આ ઉપકરણ પર કૅમેરા મળ્યો નથી.',
    serverDown: 'હું સર્વર સાથે સંપર્ક કરી શકતો નથી. કૃપા કરીને Vision AI ચાલુ છે કે નહીં તે તપાસો.',
    nothingToRepeat: 'પુનરાવર્તન કરવા માટે હજી કંઈ નથી.',
    help: 'તમે કહી શકો છો: આસપાસ શું છે, આ વાંચો, આનું ભાષાંતર કરો, વસ્તુઓ ઓળખો, આ કોણ છે, ફરીથી કહો, બંધ કરો, અથવા મદદ.',
    languageSet: 'ભાષા ગુજરાતી કરવામાં આવી છે.',
    walkOn: 'ચાલવાનો મોડ ચાલુ. હું સામેના અવરોધો વિશે જણાવીશ. આ માત્ર મદદ છે, કૃપા કરીને સાવધ રહો.',
    walkOff: 'ચાલવાનો મોડ બંધ.',
  },
};

const STORAGE_KEY = 'visionai.language';

let current = 'en';

// Restore the user's choice so a blind user doesn't reselect it every visit.
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && UI[saved]) current = saved;
} catch {
  // Private browsing can block localStorage – English default is fine.
}

export function getLanguage() {
  return current;
}

export function setLanguage(code) {
  if (!UI[code]) return;
  current = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
}

// t('ready') → the phrase in the current language.
export function t(key) {
  return UI[current][key] ?? UI.en[key] ?? key;
}

export function speechTag() {
  return UI[current].speechTag;
}
