async function testWaterfall() {
  require('dotenv').config();
  const geminiKey = process.env.GEMINI_API_KEY;

  const sampleCsv = `Team,Score\nATENEO,89\nLA SALLE,84\nPlayer,Jersey,Points,Rebounds,Assists,Fouls,FGM,FGA,FTM,FTA\nJerom Lastimosa,7,24,6,8,2,8,14,5,6`;
  const promptText = `Extract JSON: {"team_scores":[{"team":"Name","score":0}],"player_summary":[{"player_name":"Name","jersey_number":0,"points":0,"rebounds":0,"assists":0,"fouls":0}]}\n${sampleCsv}`;

  const MODEL_CANDIDATES = [
    'gemini-flash-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-pro-latest',
    'gemini-3.5-flash',
  ];

  let success = false;
  for (const model of MODEL_CANDIDATES) {
    console.log(`Trying model: ${model}...`);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`✅ Success with model '${model}'!`);
        console.log('Output:', data.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 150));
        success = true;
        break;
      } else {
        console.warn(`⚠️ Model '${model}' failed with status ${res.status}. Trying next...`);
      }
    } catch (e: any) {
      console.warn(`⚠️ Error on model '${model}': ${e.message}`);
    }
  }

  if (!success) {
    console.error('❌ All models failed.');
    process.exit(1);
  }
}

testWaterfall();
