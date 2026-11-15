# நியூ ஸ்ரீ அம்மன் ஜவுளி – Cloudflare Worker தொகுப்பு

கோப்பு அமைப்பு (GitHub-ல் இதே போல் இருக்க வேண்டும்):

    wrangler.jsonc
    src/worker.js
    public/index.html

## ஒரு முறை செய்ய வேண்டியவை
1. Cloudflare → **Storage & Databases → KV → Create** → பெயர் `SAJ_PHOTOS` → உருவான **ID**-ஐ `wrangler.jsonc`-ல் `"id"` இடத்தில் ஒட்டவும்.
2. Cloudflare → **Workers & Pages → sri-amman-silks → Settings → Variables and Secrets → Add**
   - Type: **Secret**, Name: `ADMIN_PASSWORD`, Value: உங்கள் Admin கடவுச்சொல் → **Deploy**.
3. இந்த 3 கோப்புகளையும் GitHub-ல் commit செய்யுங்கள் → Cloudflare தானாக publish செய்யும்.

## பயன்பாடு
இணையதளத்தில் மேலே 👤 → **Admin** → கடவுச்சொல் → ஒவ்வொரு பிரிவு / ரகத்திலும் 📷 → படம் தேர்வு.
படம் KV-ல் சேமிக்கப்பட்டு எல்லா வாடிக்கையாளருக்கும் தெரியும். 🗑 அழுத்தினால் மீண்டும் வரைபடம் வரும்.

## குறிப்புகள்
- `wrangler.jsonc`-ல் உள்ள `name` உங்கள் Worker பெயருடன் (`sri-amman-silks`) ஒத்திருக்க வேண்டும்.
- கடவுச்சொல்லை GitHub-ல் எழுத வேண்டாம்; Cloudflare Secret-ல் மட்டும் வைக்கவும்.
- Admin பக்கத்தில் 🔑 மூலம் கடவுச்சொல்லை மாற்றலாம்.
- கோப்புகளை எப்போதும் **UTF-8** ஆகச் சேமிக்கவும்.
