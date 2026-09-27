import { scanScoresheetStandalone } from '../services/matchService';

async function testStandaloneOCR() {
  console.log('==========================================================');
  console.log('STANDALONE OCR SCORESHEET SCANNING TEST');
  console.log('==========================================================\n');

  const mockCsvContent = `Team,Score
ATENEO,89
LA SALLE,84

Player,Jersey,Points,Rebounds,Assists,Fouls,FGM,FGA,FTM,FTA
Jerom Lastimosa,7,24,6,8,2,8,14,5,6
Dave Ildefonso,10,18,5,3,1,6,12,4,4
Ange Kouame,34,16,14,2,3,7,10,2,3`;

  const mockFile = {
    originalname: 'uaap_finals_scoresheet.csv',
    mimetype: 'text/csv',
    buffer: Buffer.from(mockCsvContent),
    size: mockCsvContent.length,
  };

  console.log('Testing standalone CSV scoresheet scan...');
  const result = await scanScoresheetStandalone(mockFile as any);

  console.log('\n--- Parsed Standalone Result ---');
  console.log(`Filename: ${result.filename}`);
  console.log(`Team Scores:`, result.team_scores);
  console.log(`Extracted Players Count:`, result.player_summary?.length);
  if (result.player_summary && result.player_summary.length > 0) {
    console.log(`First Player:`, result.player_summary[0]);
  }

  if (result.player_summary && result.player_summary.length >= 1) {
    console.log('\n✅ [PASS] Standalone scoresheet OCR scan succeeded!');
  } else {
    console.error('\n❌ [FAIL] Standalone scoresheet OCR scan did not return player summary.');
    process.exit(1);
  }
}

testStandaloneOCR()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  });
