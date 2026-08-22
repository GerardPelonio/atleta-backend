import { auth } from '../utils/firebaseAdmin';

async function cleanAllFirebaseAuth() {
  console.log('🧹 Clearing all users from Firebase Authentication...');

  try {
    let nextPageToken: string | undefined;
    let totalDeleted = 0;

    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      const uids = listUsersResult.users.map((userRecord) => userRecord.uid);

      if (uids.length > 0) {
        const deleteResult = await auth.deleteUsers(uids);
        totalDeleted += deleteResult.successCount;
        console.log(`- Deleted batch of ${deleteResult.successCount} users from Firebase Auth.`);
      }

      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log(`\n✨ Successfully deleted all ${totalDeleted} user accounts from Firebase Authentication!`);
  } catch (err) {
    console.error('❌ Error clearing Firebase Auth users:', err);
  }
}

cleanAllFirebaseAuth()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
