import sharp from 'sharp';

async function testPromptSpeed() {
  require('dotenv').config();
  const geminiKey = process.env.GEMINI_API_KEY;

  const sampleCsv = `Team,Score\nATENEO,89\nLA SALLE,84\nPlayer,Jersey,Points,Rebounds,Assists,Fouls,FGM,FGA,FTM,FTA\nJerom Lastimosa,7,24,6,8,2,8,14,5,6\nDave Ildefonso,10,18,5,3,1,6,12,4,4`;
  
  const promptText = `Extract basketball scoresheet data into JSON:
{"team_scores":[{"team":"Name","score":0}],"player_summary":[{"player_name":"Name","jersey_number":0,"points":0,"rebounds":0,"assists":0,"fouls":0,"fg_made":0,"fg_attempted":0,"ft_made":0,"ft_attempted":0}]}
Data:
${sampleCsv}`;

  const start = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    }
  );
  const elapsed = Date.now() - start;
  const json: any = await response.json();
  console.log(`Generated in ${elapsed}ms:`, json.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 150));
}

testPromptSpeed();
