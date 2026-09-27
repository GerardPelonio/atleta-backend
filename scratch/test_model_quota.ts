async function testModelQuotas() {
  require('dotenv').config();
  const geminiKey = process.env.GEMINI_API_KEY;

  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-2.5-pro',
  ];

  const samplePrompt = 'Extract json: {"status": "ok"}';

  for (const model of candidateModels) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: samplePrompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
      console.log(`- ${model}: Status ${res.status}`);
      if (res.status === 200) {
        const d = await res.json();
        console.log(`  ✅ Works! Response:`, d.candidates?.[0]?.content?.parts?.[0]?.text);
      } else {
        const err = await res.text();
        console.log(`  ❌ Failed:`, err.substring(0, 120));
      }
    } catch (e: any) {
      console.log(`- ${model}: Error ${e.message}`);
    }
  }
}

testModelQuotas();
