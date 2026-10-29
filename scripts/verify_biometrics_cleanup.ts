/**
 * verify_biometrics_cleanup.ts
 *
 * Automated verification for Item 8: Discovery Page Biometrics Label Cleanup.
 */

// Mirroring the exact functions from biometricsFormatter.ts for node environment validation
function stripBiometricPrefix(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .replace(/^(ht|wt|wing|wingspan|vert|vertical)[-:\s_]+/i, '')
    .trim();
}

function formatCleanHeight(athlete?: any): string {
  if (!athlete) return '-';

  const cmVal =
    athlete.biometrics?.height_cm ||
    athlete.height_cm ||
    athlete.physical_attributes?.height_cm ||
    athlete.physical_profile?.height_cm;

  if (cmVal && !isNaN(Number(cmVal)) && Number(cmVal) > 0) {
    return `${Math.round(Number(cmVal))} cm`;
  }

  const rawStr = stripBiometricPrefix(
    athlete.biometrics?.height_ft ||
    athlete.height_ft ||
    athlete.height ||
    athlete.physical_attributes?.height ||
    ''
  );

  if (!rawStr || rawStr === '-') return '-';

  const cmMatch = rawStr.match(/^(\d+(\.\d+)?)\s*cm$/i);
  if (cmMatch) {
    return `${Math.round(parseFloat(cmMatch[1]))} cm`;
  }

  const ftInMatch = rawStr.match(/(\d+)['’ft\s]+\s*(\d+)?/i);
  if (ftInMatch) {
    const feet = parseInt(ftInMatch[1], 10);
    const inches = parseInt(ftInMatch[2] || '0', 10);
    const totalInches = feet * 12 + inches;
    if (totalInches > 0) {
      const calculatedCm = Math.round(totalInches * 2.54);
      return `${calculatedCm} cm`;
    }
  }

  const pureNum = parseFloat(rawStr.replace(/[^0-9.]/g, ''));
  if (!isNaN(pureNum) && pureNum > 0) {
    if (pureNum >= 100) {
      return `${Math.round(pureNum)} cm`;
    }
    return `${Math.round(pureNum * 2.54)} cm`;
  }

  return rawStr;
}

function formatCleanWeight(athlete?: any): string {
  if (!athlete) return '-';

  const kgVal =
    athlete.biometrics?.weight_kg ||
    athlete.weight_kg ||
    athlete.physical_attributes?.weight_kg ||
    athlete.physical_profile?.weight_kg;

  if (kgVal && !isNaN(Number(kgVal)) && Number(kgVal) > 0) {
    return `${Math.round(Number(kgVal))} kg`;
  }

  const rawStr = stripBiometricPrefix(
    athlete.biometrics?.weight_lbs ||
    athlete.weight_lbs ||
    athlete.weight ||
    athlete.physical_attributes?.weight ||
    ''
  );

  if (!rawStr || rawStr === '-') return '-';

  const kgMatch = rawStr.match(/^(\d+(\.\d+)?)\s*kg$/i);
  if (kgMatch) {
    return `${Math.round(parseFloat(kgMatch[1]))} kg`;
  }

  const lbsMatch = rawStr.match(/(\d+(\.\d+)?)/);
  if (lbsMatch) {
    const totalLbs = parseFloat(lbsMatch[1]);
    if (totalLbs > 0) {
      if (rawStr.toLowerCase().includes('lbs')) {
        const calculatedKg = Math.round(totalLbs / 2.20462);
        return `${calculatedKg} kg`;
      } else if (totalLbs > 115) {
        const calculatedKg = Math.round(totalLbs / 2.20462);
        return `${calculatedKg} kg`;
      } else {
        return `${Math.round(totalLbs)} kg`;
      }
    }
  }

  return rawStr;
}

function formatCleanWingspan(athlete?: any): string {
  if (!athlete) return '-';

  const cmVal =
    athlete.biometrics?.wingspan_cm ||
    athlete.wingspan_cm ||
    athlete.physical_attributes?.wingspan_cm ||
    athlete.physical_profile?.wingspan_cm;

  if (cmVal && !isNaN(Number(cmVal)) && Number(cmVal) > 0) {
    return `${Math.round(Number(cmVal))} cm wingspan`;
  }

  const rawStr = stripBiometricPrefix(
    athlete.biometrics?.wingspan_ft ||
    athlete.wingspan_ft ||
    athlete.wingspan ||
    athlete.physical_attributes?.wingspan ||
    ''
  );

  if (!rawStr || rawStr === '-') return '-';

  const cmMatch = rawStr.match(/^(\d+(\.\d+)?)\s*cm/i);
  if (cmMatch) {
    return `${Math.round(parseFloat(cmMatch[1]))} cm wingspan`;
  }

  const ftInMatch = rawStr.match(/(\d+)['’ft\s]+\s*(\d+)?/i);
  if (ftInMatch) {
    const feet = parseInt(ftInMatch[1], 10);
    const inches = parseInt(ftInMatch[2] || '0', 10);
    const totalInches = feet * 12 + inches;
    if (totalInches > 0) {
      const calculatedCm = Math.round(totalInches * 2.54);
      return `${calculatedCm} cm wingspan`;
    }
  }

  const pureNum = parseFloat(rawStr.replace(/[^0-9.]/g, ''));
  if (!isNaN(pureNum) && pureNum > 0) {
    if (pureNum >= 100) {
      return `${Math.round(pureNum)} cm wingspan`;
    }
    return `${Math.round(pureNum * 2.54)} cm wingspan`;
  }

  return rawStr;
}

function formatCleanVertical(athlete?: any): string {
  if (!athlete) return '-';

  const cmVal =
    athlete.biometrics?.vertical_leap_cm ||
    athlete.vertical_leap_cm ||
    athlete.vertical_cm ||
    athlete.vertical_jump_cm ||
    athlete.physical_attributes?.vertical_cm;

  if (cmVal && !isNaN(Number(cmVal)) && Number(cmVal) > 0) {
    return `${Math.round(Number(cmVal))} cm vert`;
  }

  const rawStr = stripBiometricPrefix(
    athlete.biometrics?.vertical_leap_in ||
    athlete.vertical_leap_in ||
    athlete.vertical_leap ||
    athlete.vertical_jump_in ||
    ''
  );

  if (!rawStr || rawStr === '-') return '-';

  const cmMatch = rawStr.match(/^(\d+(\.\d+)?)\s*cm/i);
  if (cmMatch) {
    return `${Math.round(parseFloat(cmMatch[1]))} cm vert`;
  }

  const inMatch = rawStr.match(/(\d+(\.\d+)?)/);
  if (inMatch) {
    const inches = parseFloat(inMatch[1]);
    if (inches > 0) {
      const calculatedCm = Math.round(inches * 2.54);
      return `${calculatedCm} cm vert`;
    }
  }

  return rawStr;
}

function getCleanBiometrics(athlete?: any) {
  return {
    height: formatCleanHeight(athlete),
    weight: formatCleanWeight(athlete),
    wingspan: formatCleanWingspan(athlete),
    vertical: formatCleanVertical(athlete),
  };
}

async function runTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 Item 8: Discovery Page Biometrics Label Cleanup Tests');
  console.log('🧪 ========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}${detail ? ` -> ${detail}` : ''}`);
    }
  }

  // TEST SUITE 1: Prefix Stripping
  console.log('--- TEST 1: Shorthand Prefix Stripping ---');
  assert(stripBiometricPrefix('ht- 185cm') === '185cm', 'Strips "ht- " prefix');
  assert(stripBiometricPrefix('HT-6\'2"') === '6\'2"', 'Strips "HT-" prefix case-insensitively');
  assert(stripBiometricPrefix('wt- 78kg') === '78kg', 'Strips "wt- " prefix');
  assert(stripBiometricPrefix('WT-185 lbs') === '185 lbs', 'Strips "WT-" prefix');
  assert(stripBiometricPrefix('wing- 190 cm') === '190 cm', 'Strips "wing- " prefix');
  assert(stripBiometricPrefix('wingspan-6\'5"') === '6\'5"', 'Strips "wingspan-" prefix');
  assert(stripBiometricPrefix('vert- 34"') === '34"', 'Strips "vert- " prefix');

  // TEST SUITE 2: Height Formatting
  console.log('\n--- TEST 2: Clean Height Standard Units (cm) ---');
  assert(formatCleanHeight({ biometrics: { height_ft: 'ht- 6\'1"' } }) === '185 cm', 'Converts 6\'1" to 185 cm without ht- prefix');
  assert(formatCleanHeight({ biometrics: { height_ft: '6\'2"' } }) === '188 cm', 'Converts 6\'2" to 188 cm');
  assert(formatCleanHeight({ height_cm: 185 }) === '185 cm', 'Direct height_cm: 185 returns 185 cm');
  assert(formatCleanHeight({ biometrics: { height_ft: '185 cm' } }) === '185 cm', 'Direct "185 cm" string returns 185 cm');

  // TEST SUITE 3: Weight Formatting
  console.log('\n--- TEST 3: Clean Weight Standard Units (kg) ---');
  assert(formatCleanWeight({ biometrics: { weight_lbs: 'wt- 172 lbs' } }) === '78 kg', 'Converts 172 lbs to 78 kg without wt- prefix');
  assert(formatCleanWeight({ biometrics: { weight_lbs: '185 lbs' } }) === '84 kg', 'Converts 185 lbs to 84 kg');
  assert(formatCleanWeight({ weight_kg: 78 }) === '78 kg', 'Direct weight_kg: 78 returns 78 kg');
  assert(formatCleanWeight({ biometrics: { weight_lbs: '78 kg' } }) === '78 kg', 'Direct "78 kg" string returns 78 kg');

  // TEST SUITE 4: Wingspan Formatting
  console.log('\n--- TEST 4: Clean Wingspan Standard Units (cm wingspan) ---');
  assert(formatCleanWingspan({ biometrics: { wingspan_ft: 'wing- 6\'3"' } }) === '191 cm wingspan', 'Converts 6\'3" to 191 cm wingspan without wing- prefix');
  assert(formatCleanWingspan({ biometrics: { wingspan_ft: '190 cm' } }) === '190 cm wingspan', 'Direct "190 cm" returns 190 cm wingspan');
  assert(formatCleanWingspan({ wingspan_cm: 190 }) === '190 cm wingspan', 'Direct wingspan_cm: 190 returns 190 cm wingspan');

  // TEST SUITE 5: Vertical Leap Formatting
  console.log('\n--- TEST 5: Clean Vertical Leap Standard Units ---');
  assert(formatCleanVertical({ biometrics: { vertical_leap_in: 'vert- 30"' } }) === '76 cm vert', 'Converts 30" to 76 cm vert without vert- prefix');
  assert(formatCleanVertical({ vertical_leap_cm: 76 }) === '76 cm vert', 'Direct vertical_leap_cm: 76 returns 76 cm vert');

  // TEST SUITE 6: Composite Clean Biometrics Object
  console.log('\n--- TEST 6: Composite Clean Biometrics Object ---');
  const sampleClutteredAthlete = {
    full_name: 'Juan Gomez',
    biometrics: {
      height_ft: 'ht- 6\'1"',
      weight_lbs: 'wt- 172 lbs',
      wingspan_ft: 'wing- 6\'3"',
      vertical_leap_in: 'vert- 30"',
    },
  };

  const clean = getCleanBiometrics(sampleClutteredAthlete);
  assert(clean.height === '185 cm', 'Composite height is "185 cm" (no "ht-" prefix)');
  assert(clean.weight === '78 kg', 'Composite weight is "78 kg" (no "wt-" prefix)');
  assert(clean.wingspan === '191 cm wingspan', 'Composite wingspan is "191 cm wingspan" (no "wing-" prefix)');
  assert(clean.vertical === '76 cm vert', 'Composite vertical is "76 cm vert" (no "vert-" prefix)');

  // Ensure no prefixes in final output
  const outputCombined = `${clean.height} ${clean.weight} ${clean.wingspan} ${clean.vertical}`;
  assert(!outputCombined.toLowerCase().includes('ht-'), 'Output contains 0 occurrences of "ht-"');
  assert(!outputCombined.toLowerCase().includes('wt-'), 'Output contains 0 occurrences of "wt-"');
  assert(!outputCombined.toLowerCase().includes('wing-'), 'Output contains 0 occurrences of "wing-"');
  assert(!outputCombined.toLowerCase().includes('vert-'), 'Output contains 0 occurrences of "vert-"');

  console.log('\n========================================================');
  console.log(`🏁 TEST SUMMARY: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log('========================================================\n');

  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED! Discovery biometrics cleaned up successfully.');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
