const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../tracked-users.json');
const BACKUP_DIR = path.join(__dirname, '../backups');
const LOCK_FILE = path.join(__dirname, '../tracked-users.lock');

let lockAcquired = false;

/**
 * Ensure backup directory exists
 */
const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

/**
 * Create a backup of the current users file
 */
const createBackup = () => {
  try {
    if (!fs.existsSync(USERS_FILE)) return;

    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `tracked-users-${timestamp}.json`);

    fs.copyFileSync(USERS_FILE, backupFile);

    // Keep only last 10 backups
    const backups = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('tracked-users-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (backups.length > 10) {
      for (let i = 10; i < backups.length; i++) {
        fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
      }
    }

    console.log(`✓ Backup created: ${backupFile}`);
  } catch (error) {
    console.error('Error creating backup:', error);
  }
};

/**
 * Acquire file lock
 */
const acquireLock = () => {
  try {
    if (lockAcquired) return true;
    fs.writeFileSync(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
    lockAcquired = true;
    return true;
  } catch (error) {
    // Lock file exists, wait and retry
    return false;
  }
};

/**
 * Release file lock
 */
const releaseLock = () => {
  try {
    if (lockAcquired && fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
    lockAcquired = false;
  } catch (error) {
    console.error('Error releasing lock:', error);
  }
};

/**
 * Wait for lock to be available with timeout
 */
const waitForLock = async (maxWaitTime = 5000) => {
  const startTime = Date.now();
  while (!acquireLock()) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error('Failed to acquire file lock');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

/**
 * Validate user data schema
 */
const validateUserData = (data) => {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid data: must be an object');
  }

  for (const [userId, user] of Object.entries(data)) {
    if (!userId || typeof userId !== 'string') {
      throw new Error(`Invalid userId: ${userId}`);
    }

    if (!user.githubUsername || typeof user.githubUsername !== 'string') {
      throw new Error(`Invalid githubUsername for user ${userId}`);
    }

    if (!user.githubToken || typeof user.githubToken !== 'string') {
      throw new Error(`Invalid githubToken for user ${userId}`);
    }

    if (!user.webhookSecret || typeof user.webhookSecret !== 'string') {
      throw new Error(`Invalid webhookSecret for user ${userId}`);
    }

    if (!user.addedAt || typeof user.addedAt !== 'string') {
      throw new Error(`Invalid addedAt timestamp for user ${userId}`);
    }

    // lastSyncTime is optional
    if (user.lastSyncTime && typeof user.lastSyncTime !== 'string') {
      throw new Error(`Invalid lastSyncTime for user ${userId}`);
    }

    // lastCommitHash is optional
    if (user.lastCommitHash && typeof user.lastCommitHash !== 'string') {
      throw new Error(`Invalid lastCommitHash for user ${userId}`);
    }
  }

  return true;
};

/**
 * Load tracked users from JSON file
 * @returns {Object} Tracked users object
 */
const loadUsers = () => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const users = JSON.parse(data);
      validateUserData(users);
      return users;
    }
  } catch (error) {
    console.error('Error loading users:', error);
    // Try to restore from backup
    const backups = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('tracked-users-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (backups.length > 0) {
      const latestBackup = path.join(BACKUP_DIR, backups[0]);
      console.warn(`Restoring from backup: ${latestBackup}`);
      try {
        const data = fs.readFileSync(latestBackup, 'utf8');
        const users = JSON.parse(data);
        validateUserData(users);
        return users;
      } catch (restoreError) {
        console.error('Error restoring from backup:', restoreError);
      }
    }
  }
  return {};
};

/**
 * Save tracked users to JSON file with locking
 * @param {Object} users - Users object to save
 */
const saveUsers = async (users) => {
  try {
    validateUserData(users);
    await waitForLock();

    try {
      // Create backup before writing
      createBackup();

      // Write to temporary file first
      const tempFile = USERS_FILE + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(users, null, 2), 'utf8');

      // Atomic rename
      if (fs.existsSync(USERS_FILE)) {
        fs.unlinkSync(USERS_FILE);
      }
      fs.renameSync(tempFile, USERS_FILE);

      console.log('✓ Users saved to file');
    } finally {
      releaseLock();
    }
  } catch (error) {
    console.error('Error saving users:', error);
    throw error;
  }
};

/**
 * Add a tracked GitHub user
 * @param {string} userId - Discord user ID
 * @param {string} githubUsername - GitHub username
 * @param {string} githubToken - GitHub personal access token
 * @param {string} webhookSecret - Webhook secret for this user
 */
const addUser = async (userId, githubUsername, githubToken, webhookSecret) => {
  const users = loadUsers();
  users[userId] = {
    githubUsername,
    githubToken,
    webhookSecret,
    addedAt: new Date().toISOString(),
  };
  await saveUsers(users);
  return users[userId];
};

/**
 * Remove a tracked GitHub user
 * @param {string} userId - Discord user ID
 */
const removeUser = async (userId) => {
  const users = loadUsers();
  const existed = userId in users;
  if (existed) {
    delete users[userId];
    await saveUsers(users);
  }
  return existed;
};

/**
 * Get a tracked user
 * @param {string} userId - Discord user ID
 * @returns {Object|null} User object or null
 */
const getUser = (userId) => {
  const users = loadUsers();
  return users[userId] || null;
};

/**
 * Get all tracked users
 * @returns {Object} All tracked users
 */
const getAllUsers = () => {
  return loadUsers();
};

/**
 * List tracked users for a Discord user
 * @param {string} userId - Discord user ID
 * @returns {string} Formatted list of tracked users
 */
const listUserInfo = (userId) => {
  const user = getUser(userId);
  if (!user) {
    return 'No tracked GitHub user found. Use `/track` to add one.';
  }
  return `
**Tracked GitHub User:**
- GitHub Username: \`${user.githubUsername}\`
- Added: ${new Date(user.addedAt).toLocaleString()}
- Token: \`${user.githubToken.substring(0, 4)}...${user.githubToken.substring(-4)}\`
`;
};

/**
 * Get storage statistics
 * @returns {Object} Storage stats
 */
const getStats = () => {
  const users = loadUsers();
  const backups = fs.existsSync(BACKUP_DIR)
    ? fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('tracked-users-') && f.endsWith('.json')).length
    : 0;

  return {
    totalUsers: Object.keys(users).length,
    backups,
    lastModified: fs.existsSync(USERS_FILE)
      ? fs.statSync(USERS_FILE).mtime.toISOString()
      : null,
  };
};

/**
 * Update the last sync time for a user
 * @param {string} userId - Discord user ID
 */
const updateLastSyncTime = async (userId) => {
  const users = loadUsers();
  if (userId in users) {
    users[userId].lastSyncTime = new Date().toISOString();
    await saveUsers(users);
  }
};

/**
 * Get the last sync time for a user
 * @param {string} userId - Discord user ID
 * @returns {Date|null} Last sync time or null
 */
const getLastSyncTime = (userId) => {
  const user = getUser(userId);
  if (user && user.lastSyncTime) {
    return new Date(user.lastSyncTime);
  }
  return null;
};

/**
 * Update the last sent commit hash for a user
 * @param {string} userId - Discord user ID
 * @param {string} commitHash - Last commit hash that was sent
 */
const updateLastCommitHash = async (userId, commitHash) => {
  const users = loadUsers();
  if (userId in users) {
    users[userId].lastCommitHash = commitHash;
    await saveUsers(users);
  }
};

/**
 * Get the last sent commit hash for a user
 * @param {string} userId - Discord user ID
 * @returns {string|null} Last commit hash or null
 */
const getLastCommitHash = (userId) => {
  const user = getUser(userId);
  return user && user.lastCommitHash ? user.lastCommitHash : null;
};

module.exports = {
  addUser,
  removeUser,
  getUser,
  getAllUsers,
  listUserInfo,
  loadUsers,
  getStats,
  updateLastSyncTime,
  getLastSyncTime,
  updateLastCommitHash,
  getLastCommitHash,
};
