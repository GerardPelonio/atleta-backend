import sharp from 'sharp';

async function testSpeed() {
  require('dotenv').config();
  const geminiKey = process.env.GEMINI_API_KEY;

  const sampleCsv = `Team,Score\nATENEO,89\nLA SALLE,84\nPlayer,Jersey,Points,Rebounds,Assists,Fouls,FGM,FGA,FTM,FTA\nJerom Lastimosa,7,24,6,8,2,8,14,5,6`;
  
  const promptText = `Extract JSON: {"team_scores":[{"team":"Name","score":0}],"player_summary":[{"player_name":"Name","jersey_number":0,"points":0,"rebounds":0,"assists":0,"fouls":0}]}\n${sampleCsv}`;

  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-3.5-flash'];

  for (const model of models) {
    const start = Date.now();
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      const elapsed = Date.now() - start;
      console.log(`Model ${model}: Status ${response.status} in ${elapsed}ms`);
    } catch (err: any) {
      console.log(`Model ${model}: Error ${err.message}`);
    }
  }
}

testSpeed();
