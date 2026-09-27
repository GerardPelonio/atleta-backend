function repairAndParseJson(raw: string): any {
  let clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Extract outer-most object if surrounded by chatter
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  // 1. Try standard JSON.parse
  try {
    return JSON.parse(clean);
  } catch (_) {}

  // 2. Fix trailing commas before } or ]
  clean = clean.replace(/,\s*([\}\]])/g, '$1');

  // 3. Fix missing commas between objects like `}{` or `}\n{` or `] [`
  clean = clean.replace(/\}\s*\{/g, '},{');
  clean = clean.replace(/\]\s*\[/g, '],[');
  clean = clean.replace(/"\s*"/g, '","');

  try {
    return JSON.parse(clean);
  } catch (_) {}

  // 4. Auto-close truncated JSON if cut off
  let openBraces = (clean.match(/\{/g) || []).length;
  let closeBraces = (clean.match(/\}/g) || []).length;
  let openBrackets = (clean.match(/\[/g) || []).length;
  let closeBrackets = (clean.match(/\]/g) || []).length;

  let repaired = clean;
  // If inside a string, close quote
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    repaired += '"';
  }

  while (openBrackets > closeBrackets) {
    repaired += ']';
    closeBrackets++;
  }
  while (openBraces > closeBraces) {
    repaired += '}';
    closeBraces++;
  }

  try {
    return JSON.parse(repaired);
  } catch (err: any) {
    // 5. Fallback: Regex extraction for player_summary and team_scores
    const teamScores: any[] = [];
    const playerSummary: any[] = [];

    // Extract player objects via regex matching
    const playerRegex = /\{[^{}]*"player_name"[^{}]*\}/g;
    let match;
    while ((match = playerRegex.exec(raw)) !== null) {
      try {
        const pObj = JSON.parse(match[0]);
        playerSummary.push(pObj);
      } catch (e) {
        // Try sanitized parse
        try {
          const sanitized = match[0].replace(/,\s*\}/g, '}');
          playerSummary.push(JSON.parse(sanitized));
        } catch (_) {}
      }
    }

    // Extract team scores via regex
    const teamRegex = /\{[^{}]*"team"[^{}]*"score"[^{}]*\}/g;
    while ((match = teamRegex.exec(raw)) !== null) {
      try {
        teamScores.push(JSON.parse(match[0]));
      } catch (_) {}
    }

    if (playerSummary.length > 0 || teamScores.length > 0) {
      return {
        match_info: {
          sport_type: 'Basketball',
          game_result: 'WIN',
          final_score: teamScores.length >= 2 ? `${teamScores[0].score} - ${teamScores[1].score}` : '0 - 0',
        },
        team_scores: teamScores,
        player_summary: playerSummary,
      };
    }

    throw new Error(`Failed to parse AI JSON response: ${err.message}`);
  }
}

// Test with malformed JSON containing unescaped quote or missing comma
const malformedSample = `{
  "team_scores": [
    {"team": "Ateneo", "score": 88},
    {"team": "La Salle", "score": 82}
  ],
  "player_summary": [
    {"player_name": "Jerom Lastimosa", "jersey_number": 7, "points": 24 "rebounds": 6, "assists": 8}
    {"player_name": "Dave Ildefonso", "jersey_number": 10, "points": 18, "rebounds": 5, "assists": 3}
  ]
}`;

console.log('Testing repairAndParseJson on malformed JSON...');
const result = repairAndParseJson(malformedSample);
console.log('Successfully repaired and parsed:', result);
