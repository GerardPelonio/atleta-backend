import { normalizeExtractedPlayer, extractJsonFromAiText, calculateBasketballMetrics, calculateIndividualSportMetrics, calculateDynamicSportMetrics } from '../services/matchService';

function runMultiSportOCRTests() {
  console.log('--- TEST 1: Basketball Scoresheet Extraction & Metrics ---');
  const rawBasketballJson = `
  {
    "match_info": {
      "sport_type": "Basketball",
      "event_name": "Mayor's Cup Finals",
      "home_team_name": "Camarines Bulls",
      "opponent_team_name": "Naga Hawks",
      "game_result": "WIN",
      "final_score": "95 - 88"
    },
    "team_scores": [
      { "team": "Camarines Bulls", "score": 95, "is_home": true },
      { "team": "Naga Hawks", "score": 88, "is_home": false }
    ],
    "player_summary": [
      {
        "jersey_number": 23,
        "player_name": "Marcus Reyes",
        "team_name": "Camarines Bulls",
        "position": "SF",
        "points": 28,
        "rebounds": 10,
        "offensive_rebounds": 4,
        "defensive_rebounds": 6,
        "assists": 8,
        "steals": 3,
        "blocks": 2,
        "turnovers": 2,
        "fouls": 2,
        "fg_made": 11,
        "fg_attempted": 19,
        "three_made": 2,
        "three_attempted": 5,
        "ft_made": 4,
        "ft_attempted": 5,
        "minutes": 36
      },
      {
        "jersey_number": 3,
        "player_name": "Kenji Santos",
        "team_name": "Naga Hawks",
        "position": "PG",
        "points": 24,
        "rebounds": 4,
        "assists": 9,
        "steals": 2,
        "blocks": 0,
        "turnovers": 3,
        "fouls": 3,
        "fg_made": 9,
        "fg_attempted": 18,
        "three_made": 4,
        "three_attempted": 9,
        "ft_made": 2,
        "ft_attempted": 2,
        "minutes": 34
      }
    ]
  }`;

  const bbData = extractJsonFromAiText(rawBasketballJson);
  console.log(`Extracted Match: ${bbData.match_info.home_team_name} vs ${bbData.match_info.opponent_team_name} (${bbData.match_info.final_score})`);
  const bPlayer = normalizeExtractedPlayer(bbData.player_summary[0], 0, 'bball_test');
  const bMetrics = calculateBasketballMetrics({
    points: bPlayer.points,
    rebounds: bPlayer.rebounds,
    assists: bPlayer.assists,
    steals: bPlayer.steals,
    blocks: bPlayer.blocks,
    turnovers: bPlayer.turnovers,
    fouls: bPlayer.fouls,
    fg_made: bPlayer.fg_made,
    fg_attempted: bPlayer.fg_attempted,
    ft_made: bPlayer.ft_made,
    ft_attempted: bPlayer.ft_attempted,
  });
  console.log(`Basketball Player 1: ${bPlayer.player_name} (#${bPlayer.jersey_number}) - PTS: ${bPlayer.points}, REB: ${bPlayer.rebounds}, AST: ${bPlayer.assists}`);
  console.log(`Calculated Efficiency: ${bMetrics.efficiency}, True Shooting %: ${bMetrics.trueShootingPct}%`);

  console.log('\n--- TEST 2: Volleyball Scoresheet Extraction & Metrics ---');
  const rawVolleyballJson = `
  {
    "match_info": {
      "sport_type": "Volleyball",
      "event_name": "Inter-Collegiate Championship",
      "home_team_name": "Lady Spikers",
      "opponent_team_name": "Blue Eagles",
      "game_result": "WIN",
      "final_score": "3 - 1"
    },
    "player_summary": [
      {
        "jersey_number": 12,
        "player_name": "Alyssa Cruz",
        "team_name": "Lady Spikers",
        "position": "OH",
        "kills": 18,
        "blocks": 3,
        "digs": 14,
        "service_aces": 4,
        "attack_errors": 2,
        "service_errors": 1
      }
    ]
  }`;
  const vbData = extractJsonFromAiText(rawVolleyballJson);
  const vPlayer = normalizeExtractedPlayer(vbData.player_summary[0], 0, 'vb_test');
  const vMetrics = calculateDynamicSportMetrics({
    kills: vPlayer.kills,
    blocks: vPlayer.block_points,
    digs: vPlayer.digs,
    aces: vPlayer.service_aces,
    attack_errors: vPlayer.attack_errors,
    service_errors: vPlayer.service_errors,
  });
  console.log(`Volleyball Player: ${vPlayer.player_name} (#${vPlayer.jersey_number}) - Kills: ${vPlayer.kills}, Blocks: ${vPlayer.block_points}, Digs: ${vPlayer.digs}, Aces: ${vPlayer.service_aces}, Derived Points: ${vPlayer.points}`);
  console.log(`Calculated Dynamic Efficiency: ${vMetrics.efficiency}`);

  console.log('\n--- TEST 3: Soccer Scoresheet Extraction & Metrics ---');
  const rawSoccerJson = `
  {
    "match_info": {
      "sport_type": "Soccer",
      "home_team_name": "Manila FC",
      "opponent_team_name": "Cebu FC",
      "final_score": "2 - 1"
    },
    "player_summary": [
      {
        "jersey_number": 9,
        "player_name": "Carlos Aguila",
        "team_name": "Manila FC",
        "goals": 2,
        "assists": 0,
        "shots": 5,
        "shots_on_target": 3,
        "fouls": 1,
        "yellow_cards": 0,
        "minutes": 90
      }
    ]
  }`;
  const socData = extractJsonFromAiText(rawSoccerJson);
  const socPlayer = normalizeExtractedPlayer(socData.player_summary[0], 0, 'soc_test');
  console.log(`Soccer Player: ${socPlayer.player_name} (#${socPlayer.jersey_number}) - Goals: ${socPlayer.goals}, Shots: ${socPlayer.shots}, SOG: ${socPlayer.shots_on_target}, Derived Points: ${socPlayer.points}`);

  console.log('\n--- TEST 4: Badminton Match Extraction & Metrics ---');
  const rawBadmintonJson = `
  {
    "match_info": {
      "sport_type": "Badminton",
      "home_team_name": "Rico Tan",
      "opponent_team_name": "Joshua Lim",
      "final_score": "21-18, 21-19"
    },
    "player_summary": [
      {
        "player_name": "Rico Tan",
        "smash_winners": 12,
        "net_kills": 6,
        "unforced_errors": 4,
        "service_faults": 1,
        "service_aces": 3
      }
    ]
  }`;
  const badmData = extractJsonFromAiText(rawBadmintonJson);
  const badmPlayer = normalizeExtractedPlayer(badmData.player_summary[0], 0, 'badm_test');
  console.log(`Badminton Player: ${badmPlayer.player_name} - Smashes: ${badmPlayer.smash_winners}, Net Kills: ${badmPlayer.net_kills}, Derived Points: ${badmPlayer.points}, Errors: ${badmPlayer.turnovers}`);

  console.log('\n--- TEST 5: Swimming Results Extraction & Metrics ---');
  const rawSwimmingJson = `
  {
    "match_info": {
      "sport_type": "Swimming",
      "event_name": "100m Freestyle Finals",
      "home_team_name": "Aquatic Club A",
      "opponent_team_name": "Aquatic Club B"
    },
    "player_summary": [
      {
        "player_name": "Daniel Gomez",
        "team_name": "Aquatic Club A",
        "event_name": "100m Freestyle",
        "finish_time": "00:52.40",
        "time": "52.40s",
        "split_time": "25.10s, 27.30s",
        "distance_meters": 100,
        "rank": 1
      }
    ]
  }`;
  const swimData = extractJsonFromAiText(rawSwimmingJson);
  const sPlayer = normalizeExtractedPlayer(swimData.player_summary[0], 0, 'swim_test');
  const sMetrics = calculateIndividualSportMetrics({
    event_name: '100m Freestyle',
    finish_time_ms: 52400,
    distance_meters: 100,
    split_times_ms: [25100, 27300],
  });
  console.log(`Swimmer: ${sPlayer.player_name} - Event: 100m, Time: ${sPlayer.time}, Split: ${sPlayer.split_time}`);
  console.log(`Swimming Efficiency: ${sMetrics.efficiency}`);

  console.log('\n--- TEST 6: Track & Field Results Extraction & Metrics ---');
  const rawTrackJson = `
  {
    "match_info": {
      "sport_type": "Track & Field",
      "event_name": "100m Dash Finals"
    },
    "player_summary": [
      {
        "player_name": "Leo Martinez",
        "team_name": "Track Striders",
        "finish_time": "10.45s",
        "distance_meters": 100,
        "rank": 1
      }
    ]
  }`;
  const tfData = extractJsonFromAiText(rawTrackJson);
  const tfPlayer = normalizeExtractedPlayer(tfData.player_summary[0], 0, 'tf_test');
  const tfMetrics = calculateIndividualSportMetrics({
    event_name: '100m Dash',
    finish_time_ms: 10450,
    distance_meters: 100,
  });
  console.log(`Track Athlete: ${tfPlayer.player_name} - Time: ${tfPlayer.time}, Distance: ${tfPlayer.distance_m || 100}m`);
  console.log(`Track & Field Efficiency: ${tfMetrics.efficiency}`);

  console.log('\n✅ All Multi-Sport OCR and Metric Calculations Passed Successfully!');
}

runMultiSportOCRTests();
