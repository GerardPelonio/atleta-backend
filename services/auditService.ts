import { db } from '../utils/firebaseAdmin';
import { ServiceError } from '../validators/matchValidator';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';

export interface OfficialAudit {
  validation_id: string;
  audit_id: string;
  match_id: string;
  requested_by_coach_id: string;
  requested_by: string;
  official_id: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Certify';
  verification_status?: 'Pending' | 'Certify' | 'Reject';
  requested_at: string;
  certified_at?: string;
}

/**
 * Submit a formal audit request to the appointed Tournament Official.
 */
export async function submitAuditRequest(
  coachId: string,
  matchId: string,
): Promise<OfficialAudit> {
  const matchRef = db.collection('Match_Logs').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new ServiceError(`Match with ID '${matchId}' not found.`, 404);
  }

  const matchData = matchDoc.data()!;
  const teamId = matchData.team_id;

  if (!teamId) {
    throw new ServiceError('Team ID is missing from the match record.', 400);
  }

  const teamDoc = await db.collection('Teams').doc(teamId).get();
  if (!teamDoc.exists) {
    throw new ServiceError(`Team with ID '${teamId}' not found.`, 404);
  }

  const teamData = teamDoc.data()!;
  // Verify that the coach manages this team
  const isOwner =
    teamData.coach_id === coachId ||
    teamData.coach_id === `coach_${coachId}` ||
    teamData.coach_id.replace('coach_', '') === coachId;

  if (!isOwner) {
    throw new ServiceError('Unauthorized. You do not manage the team for this match.', 403);
  }

  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();

  const auditData: OfficialAudit = {
    validation_id: auditId,
    audit_id: auditId,
    match_id: matchId,
    requested_by_coach_id: coachId,
    requested_by: coachId,
    official_id: null,
    status: 'Pending',
    verification_status: 'Pending',
    requested_at: now,
  };

  const batch = db.batch();
  const auditRef = db.collection('Official_Audits').doc(auditId);
  const validationRef = db.collection('Official_Validations').doc(auditId);

  batch.set(auditRef, auditData);
  batch.set(validationRef, auditData);
  batch.update(matchRef, {
    audit_status: 'Pending',
    verification_status: 'Pending',
  });

  await batch.commit();

  return auditData;
}

/**
 * Compile and stream a certified PDF match report containing box scores, coach notes, and official verification stamps.
 */
export async function generateMatchPdfBuffer(
  coachId: string,
  matchId: string,
): Promise<Buffer> {
  const matchDoc = await db.collection('Match_Logs').doc(matchId).get();

  if (!matchDoc.exists) {
    throw new ServiceError(`Match with ID '${matchId}' not found.`, 404);
  }

  const matchData = matchDoc.data()!;
  const teamId = matchData.team_id;

  if (!teamId) {
    throw new ServiceError('Team ID is missing from the match record.', 400);
  }

  // Authorization check: Verify coach manages the team
  const teamDoc = await db.collection('Teams').doc(teamId).get();
  if (!teamDoc.exists) {
    throw new ServiceError(`Team with ID '${teamId}' not found.`, 404);
  }

  const teamData = teamDoc.data()!;
  const isOwner =
    teamData.coach_id === coachId ||
    teamData.coach_id === `coach_${coachId}` ||
    teamData.coach_id.replace('coach_', '') === coachId;

  if (!isOwner) {
    throw new ServiceError('Unauthorized. You do not manage the team for this match.', 403);
  }

  // Certification check (Acceptance Criteria: Requesting an uncertified PDF returns 404)
  if (!matchData.is_certified) {
    throw new ServiceError('Official certified validation does not exist for this match yet', 404);
  }

  // Fetch audit and metrics in parallel to minimize latency
  const [auditsSnapshot, metricsSnapshot] = await Promise.all([
    db.collection('Official_Audits')
      .where('match_id', '==', matchId)
      .where('status', '==', 'Approved')
      .limit(1)
      .get(),
    db.collection('Performance_Metrics').where('match_id', '==', matchId).get(),
  ]);

  let officialName = 'Official Tournament Referee';
  let certificationDate = matchData.updated_at || new Date().toISOString();

  if (!auditsSnapshot.empty) {
    const auditData = auditsSnapshot.docs[0].data();
    certificationDate = auditData.certified_at || certificationDate;
    if (auditData.official_id) {
      const officialUserDoc = await db.collection('Users').doc(auditData.official_id).get();
      if (officialUserDoc.exists) {
        const oData = officialUserDoc.data()!;
        officialName = `${oData.first_name || ''} ${oData.last_name || ''}`.trim() || officialName;
      }
    }
  }

  // Populate box scores/performance metrics
  const playerMetrics: any[] = [];
  if (!metricsSnapshot.empty) {
    // Resolve all athlete user records in parallel
    const athleteIds = Array.from(new Set(metricsSnapshot.docs.map((doc) => doc.data().athlete_id)));
    const athleteDocs = await Promise.all(
      athleteIds.map(async (athId) => {
        const uid = athId.replace(/^ath_/, '');
        const uDoc = await db.collection('Users').doc(uid).get();
        return { athId, data: uDoc.exists ? uDoc.data() : null };
      }),
    );

    const athleteNamesMap = new Map<string, string>();
    athleteDocs.forEach((item) => {
      if (item.data) {
        athleteNamesMap.set(item.athId, `${item.data.first_name || ''} ${item.data.last_name || ''}`.trim());
      } else {
        athleteNamesMap.set(item.athId, 'Unknown Athlete');
      }
    });

    metricsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      playerMetrics.push({
        name: athleteNamesMap.get(data.athlete_id) || 'Unknown Athlete',
        sport_category: data.sport_category || 'N/A',
        efficiency: data.calculated_player_efficiency || 0,
        stats: data.sport_stats || {},
      });
    });
  }

  // --- PDF Kit Generation into Buffer ---
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Header Banner
      doc.rect(0, 0, doc.page.width, 15).fill('#1E3A8A');
      doc.moveDown(2);

      // Document Title
      doc.fillColor('#1E3A8A').fontSize(24).text('CERTIFIED MATCH REPORT', { align: 'center', underline: true });
      doc.moveDown(1.5);

      // Match Summary Section
      doc.fillColor('#374151').fontSize(14).text('Match Information', { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor('#4B5563');
      doc.text(`Match ID: ${matchId}`);
      doc.text(`Sport: ${matchData.sport_type || 'N/A'}`);
      doc.text(`Type / Season: ${matchData.match_type || 'N/A'}`);
      doc.text(`Date: ${matchData.match_date ? new Date(matchData.match_date).toLocaleDateString() : 'N/A'}`);
      doc.text(`Location: ${matchData.location || 'N/A'}`);
      doc.text(`Opponent Team: ${matchData.opponent_team_name || 'N/A'}`);
      doc.text(`Result: ${matchData.game_result || 'N/A'}`);
      doc.moveDown(1.5);

      // Coach Notes Section
      doc.fontSize(14).fillColor('#1E3A8A').text('Coach Notes', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#4B5563').text(matchData.notes || 'No coach notes logged for this match.');
      doc.moveDown(1.5);

      // Box Scores Table
      doc.fontSize(14).fillColor('#1E3A8A').text('Player Box Scores & Efficiency (PER)', { underline: true });
      doc.moveDown(0.5);

      if (playerMetrics.length === 0) {
        doc.fontSize(10).fillColor('#4B5563').text('No player statistics registered for this match.');
        doc.moveDown(1.5);
      } else {
        // Draw Table Header
        doc.fontSize(10).fillColor('#1E3A8A');
        doc.text('Player Name', 50, doc.y, { width: 180, continued: true });
        doc.text('Sport Category', 250, doc.y, { width: 120, continued: true });
        doc.text('Efficiency Rating (PER)', 400, doc.y, { width: 150 });
        doc.moveDown(0.3);
        doc.strokeColor('#D1D5DB').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        doc.fillColor('#4B5563');
        playerMetrics.forEach((pm) => {
          doc.text(pm.name, 50, doc.y, { width: 180, continued: true });
          doc.text(pm.sport_category, 250, doc.y, { width: 120, continued: true });
          doc.text(String(pm.efficiency), 400, doc.y, { width: 150 });
          doc.moveDown(0.5);
        });
        doc.moveDown(1.5);
      }

      // Certified Verification Stamp Box
      const boxTop = doc.page.height - 180;
      doc.rect(50, boxTop, 495, 100).lineWidth(2).strokeColor('#059669').stroke();

      doc.fillColor('#059669').fontSize(12).text('OFFICIAL VERIFICATION STAMP', 70, boxTop + 15, { align: 'center' });
      doc.moveDown(0.5);
      doc.fillColor('#0F766E').fontSize(10).text(
        `This match record and corresponding athlete box scores have been audited and certified as accurate.`,
        70,
        boxTop + 40,
        { align: 'center', width: 450 }
      );
      doc.fontSize(9).fillColor('#047857').text(
        `Appointed Official: ${officialName}  |  Certification Date: ${new Date(certificationDate).toLocaleString()}`,
        70,
        boxTop + 70,
        { align: 'center', width: 450 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateMatchPdf(
  coachId: string,
  matchId: string,
  writeStream: NodeJS.WritableStream,
): Promise<void> {
  const buffer = await generateMatchPdfBuffer(coachId, matchId);
  writeStream.write(buffer);
  writeStream.end();
}
