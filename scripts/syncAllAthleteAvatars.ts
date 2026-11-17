import { db } from '../utils/firebaseAdmin';
import { serverCache } from '../utils/cache';
import * as fs from 'fs';
import * as path from 'path';

async function syncAllAthleteAvatars() {
  console.log('--- Starting Athlete Avatars Synchronization ---');

  // Load cached real photos (Kevin Quiambao, Thirdy Ravena, Dwight Ramos, etc.)
  const cachePath = path.join(__dirname, 'athlete_avatars_cache.json');
  let realPhotos: Record<string, string> = {};
  if (fs.existsSync(cachePath)) {
    realPhotos = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    console.log(`Loaded ${Object.keys(realPhotos).length} pre-rendered athlete headshots.`);
  }

  const [usersSnap, profilesSnap] = await Promise.all([
    db.collection('Users').where('role', '==', 'Athlete').get(),
    db.collection('Athlete_Profiles').get(),
  ]);

  console.log(`Found ${usersSnap.size} athletes in Users, ${profilesSnap.size} in Athlete_Profiles.`);

  for (const doc of usersSnap.docs) {
    const uData = doc.data();
    const uid = doc.id;
    const fullName = `${uData.first_name || ''} ${uData.last_name || ''}`.trim() || 'Athlete';
    const sport = (uData.sport_type || '').toUpperCase();

    let targetAvatar = realPhotos[uid];

    // Check if existing avatar is valid
    if (!targetAvatar) {
      const existing = uData.avatar_url || uData.profile_image || uData.profile_picture || uData.photo_url;
      if (existing && typeof existing === 'string' && (existing.startsWith('http') || existing.startsWith('data:image'))) {
        targetAvatar = existing;
      }
    }

    // Fallback: Generate sporty initials avatar
    if (!targetAvatar) {
      let color = '0284C7'; // Cyan / blue
      if (sport.includes('BASKET')) color = 'EA580C'; // Basketball Orange
      else if (sport.includes('VOLLEY')) color = '8B5CF6'; // Volleyball Purple
      else if (sport.includes('TRACK') || sport.includes('FIELD')) color = '10B981'; // Track Emerald
      else if (sport.includes('SWIM')) color = '0284C7'; // Swim Ocean
      
      const encoded = encodeURIComponent(fullName);
      targetAvatar = `https://ui-avatars.com/api/?name=${encoded}&background=${color}&color=FFFFFF&size=160&bold=true`;
    }

    console.log(`Updating ${fullName} (${uid}): ${targetAvatar.startsWith('data:') ? 'base64 headshot' : targetAvatar.substring(0, 40) + '...'}`);

    const updates = {
      avatar_url: targetAvatar,
      profile_image: targetAvatar,
    };

    // Update Users doc
    await db.collection('Users').doc(uid).set(updates, { merge: true });

    // Update Athlete_Profiles docs (both uid and ath_uid)
    const rawUid = uid.replace(/^ath_/, '');
    await Promise.all([
      db.collection('Athlete_Profiles').doc(uid).set(updates, { merge: true }),
      db.collection('Athlete_Profiles').doc(rawUid).set(updates, { merge: true }),
      db.collection('Athlete_Profiles').doc(`ath_${rawUid}`).set(updates, { merge: true }),
    ]);
  }

  // Clear server cache pool
  serverCache.delete('all_searchable_athletes_pool');
  serverCache.invalidateTags(['athletes']);

  console.log('--- Athlete Avatars Synchronization Complete! ---');
}

syncAllAthleteAvatars()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error during avatar sync:', e);
    process.exit(1);
  });

