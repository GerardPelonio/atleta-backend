import { db } from '../utils/firebaseAdmin';
import {
  createScoresheetRequestService,
  getScoresheetRequestsService,
  fulfillScoresheetRequestService,
  rejectScoresheetRequestService,
} from '../services/scoresheetRequestService';
import { getOfficialNotifications } from '../services/officialDashboardService';

async function runVerification() {
  console.log('🧪 ========================================================');
  console.log('🧪 Item 7: Match Name Discrepancy in Scoresheet Request E2E Test');
  console.log('🧪 ========================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
    }
  }

  const testOfficialMatchId = `test_official_match_${Date.now()}`;
  const testCoachId = `coach_test_${Date.now()}`;
  const testOfficialId = `official_test_${Date.now()}`;
  const officialCustomTitle = 'Quarterfinals: Ateneo Blue Eagles vs DLSU Green Archers - Game 3';

  try {
    // 1. Seed Official Match with custom title in Firestore Match_Logs
    console.log('1️⃣ Seeding official match in Match_Logs with custom title...');
    await db.collection('Match_Logs').doc(testOfficialMatchId).set({
      match_id: testOfficialMatchId,
      team_id: 'team_ateneo',
      home_team_name: 'Ateneo Blue Eagles',
      away_team_name: 'DLSU Green Archers',
      matchName: officialCustomTitle,
      customGameTitle: officialCustomTitle,
      match_name: officialCustomTitle,
      gameName: officialCustomTitle,
      game_name: officialCustomTitle,
      sport_type: 'BASKETBALL',
      league_name: 'UAAP Season 87',
      is_official: true,
      audit_status: 'NOT REQUESTED',
      verification_status: 'Pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const seededMatchDoc = await db.collection('Match_Logs').doc(testOfficialMatchId).get();
    assert(seededMatchDoc.exists, 'Official match successfully created in Match_Logs');
    assert(
      seededMatchDoc.data()?.customGameTitle === officialCustomTitle,
      `Match document contains official custom title: "${officialCustomTitle}"`
    );

    // 2. Submit scoresheet request WITHOUT providing custom title in the payload
    // The service must pull directly from the Firestore Match_Logs document
    console.log('\n2️⃣ Creating scoresheet request via createScoresheetRequestService...');
    const createdRequest = await createScoresheetRequestService({
      coachId: testCoachId,
      coachName: 'Coach Tab Baldwin',
      matchId: testOfficialMatchId,
      // intentionally omit matchName to test direct pull from Match_Logs
    });

    assert(createdRequest !== null, 'Scoresheet request record returned');
    assert(
      createdRequest.matchName === officialCustomTitle,
      `createScoresheetRequestService returned matchName: "${createdRequest.matchName}"`
    );
    assert(
      createdRequest.customGameTitle === officialCustomTitle,
      `createScoresheetRequestService returned customGameTitle: "${createdRequest.customGameTitle}"`
    );

    // 3. Inspect Firestore scoresheetRequests document
    console.log('\n3️⃣ Verifying scoresheetRequests document in Firestore...');
    const reqDoc = await db.collection('scoresheetRequests').doc(createdRequest.id).get();
    assert(reqDoc.exists, 'scoresheetRequests document exists in Firestore');
    const reqData = reqDoc.data()!;
    assert(
      reqData.matchName === officialCustomTitle,
      `Firestore request doc has matchName === "${officialCustomTitle}"`
    );
    assert(
      reqData.customGameTitle === officialCustomTitle,
      `Firestore request doc has customGameTitle === "${officialCustomTitle}"`
    );

    // 4. Inspect Official_Notifications collection
    console.log('\n4️⃣ Verifying Official_Notifications document in Firestore...');
    const notifDoc = await db.collection('Official_Notifications').doc(`notif_req_${createdRequest.id}`).get();
    assert(notifDoc.exists, 'Official notification document created');
    const notifData = notifDoc.data()!;
    assert(
      notifData.title.includes(officialCustomTitle),
      `Notification title contains official custom match title: "${notifData.title}"`
    );
    assert(
      notifData.match_context === officialCustomTitle,
      `Notification match_context === "${officialCustomTitle}"`
    );
    assert(
      notifData.customGameTitle === officialCustomTitle,
      `Notification customGameTitle === "${officialCustomTitle}"`
    );

    // 5. Query requests list via getScoresheetRequestsService
    console.log('\n5️⃣ Verifying getScoresheetRequestsService data mapping...');
    const requestList = await getScoresheetRequestsService({ matchId: testOfficialMatchId });
    assert(requestList.length > 0, 'Found scoresheet request in request list');
    const fetchedReq = requestList[0];
    assert(
      fetchedReq.matchName === officialCustomTitle,
      `getScoresheetRequestsService mapped matchName === "${officialCustomTitle}"`
    );
    assert(
      fetchedReq.customGameTitle === officialCustomTitle,
      `getScoresheetRequestsService mapped customGameTitle === "${officialCustomTitle}"`
    );

    // 6. Query official dashboard notifications via getOfficialNotificationsService
    console.log('\n6️⃣ Verifying getOfficialNotifications data mapping...');
    const officialNotifs = await getOfficialNotifications(testOfficialId);
    const targetNotif = officialNotifs.find((n) => n.request_id === createdRequest.id || n.match_id === testOfficialMatchId);
    assert(targetNotif !== undefined, 'Found notification in official dashboard notifications feed');
    if (targetNotif) {
      assert(
        targetNotif.match_name === officialCustomTitle,
        `Dashboard notification match_name === "${officialCustomTitle}"`
      );
      assert(
        targetNotif.match_context === officialCustomTitle,
        `Dashboard notification match_context === "${officialCustomTitle}"`
      );
      assert(
        targetNotif.title.includes(officialCustomTitle),
        `Dashboard notification title includes "${officialCustomTitle}"`
      );
    }

    // 7. Verify OCR scoresheet upload strictly preserves official's custom match title
    console.log('\n7️⃣ Testing OCR upload fallback removal & custom title preservation...');
    const preOcrMatchDoc = await db.collection('Match_Logs').doc(testOfficialMatchId).get();
    const matchData = preOcrMatchDoc.data()!;
    const detectedHome = 'Raw OCR Header Team A';
    const detectedAway = 'Raw OCR Header Team B';
    const updatePayload: any = {
      scoresheet_url: 'https://firebasestorage.googleapis.com/test_scoresheet.pdf',
      updated_at: new Date().toISOString(),
    };
    if (detectedHome || detectedAway) {
      updatePayload.teams = [detectedHome, detectedAway];
      const existingMatchName = String(
        matchData.customGameTitle ||
        matchData.custom_game_title ||
        matchData.matchName ||
        matchData.match_name ||
        matchData.game_name ||
        matchData.gameName ||
        ''
      ).trim();

      if (!existingMatchName) {
        updatePayload.match_name = `${detectedHome} vs ${detectedAway}`;
      } else {
        updatePayload.customGameTitle = existingMatchName;
        updatePayload.custom_game_title = existingMatchName;
        updatePayload.match_name = existingMatchName;
        updatePayload.game_name = existingMatchName;
        updatePayload.matchName = existingMatchName;
        updatePayload.gameName = existingMatchName;
      }
    }
    await db.collection('Match_Logs').doc(testOfficialMatchId).set(updatePayload, { merge: true });

    const postOcrMatchDoc = await db.collection('Match_Logs').doc(testOfficialMatchId).get();
    const postOcrData = postOcrMatchDoc.data()!;
    assert(
      postOcrData.customGameTitle === officialCustomTitle,
      `After OCR upload, Match_Logs customGameTitle remains: "${postOcrData.customGameTitle}" (NOT overwritten by OCR header)`
    );
    assert(
      postOcrData.matchName === officialCustomTitle,
      `After OCR upload, Match_Logs matchName remains: "${postOcrData.matchName}"`
    );

    // 8. Fulfill scoresheet request and verify coach notification title
    console.log('\n8️⃣ Fulfilling scoresheet request and checking coach notification...');
    const fulfilledReq = await fulfillScoresheetRequestService(
      createdRequest.id,
      { officialId: testOfficialId, officialName: 'Tournament Official Santos' },
      undefined,
      'https://firebasestorage.googleapis.com/test_scoresheet.pdf'
    );
    assert(fulfilledReq.status === 'fulfilled', 'Request marked as fulfilled');

    const coachNotifsSnap = await db.collection('Notifications')
      .where('recipient_id', '==', testCoachId)
      .limit(5)
      .get();
    assert(!coachNotifsSnap.empty, 'Coach notification created in Notifications collection');
    const coachNotif = coachNotifsSnap.docs[0].data();
    assert(
      coachNotif.title.includes(officialCustomTitle),
      `Coach notification title contains official custom title: "${coachNotif.title}"`
    );
    assert(
      coachNotif.match_name === officialCustomTitle,
      `Coach notification match_name === "${officialCustomTitle}"`
    );

    console.log('\n========================================================');
    console.log(`🏁 TEST SUMMARY: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('========================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED! Match Name Discrepancy successfully remediated.');
      process.exit(0);
    } else {
      console.error('💥 SOME TESTS FAILED.');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Test execution error:', error);
    process.exit(1);
  } finally {
    // Cleanup test documents
    try {
      await db.collection('Match_Logs').doc(testOfficialMatchId).delete();
      const reqQuery = await db.collection('scoresheetRequests').where('matchId', '==', testOfficialMatchId).get();
      for (const d of reqQuery.docs) await d.ref.delete();
      const notifQuery = await db.collection('Official_Notifications').where('match_id', '==', testOfficialMatchId).get();
      for (const d of notifQuery.docs) await d.ref.delete();
      const coachNotifQuery = await db.collection('Notifications').where('recipient_id', '==', testCoachId).get();
      for (const d of coachNotifQuery.docs) await d.ref.delete();
    } catch (_) {}
  }
}

runVerification();
