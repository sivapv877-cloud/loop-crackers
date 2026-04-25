const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'job_portal';
const COLLECTIONS = ['Users', 'Jobs', 'Applications'];
const PASSWORD_OPTIONS = { iterations: 100000, keylen: 64, digest: 'sha512' };
const VALID_ROLES = ['job_seeker', 'employer'];

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Job Portal backend is running.');
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, PASSWORD_OPTIONS.iterations, PASSWORD_OPTIONS.keylen, PASSWORD_OPTIONS.digest);
  return `${PASSWORD_OPTIONS.iterations}:${salt}:${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  const [iterations, salt, key] = storedHash.split(':');
  const derivedKey = crypto.pbkdf2Sync(password, salt, Number(iterations), PASSWORD_OPTIONS.keylen, PASSWORD_OPTIONS.digest);
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    const role = req.get('x-user-role');
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied: insufficient role' });
    }
    req.userRole = role;
    next();
  };
}

app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Name, email, password, and role are required.' });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const db = req.app.locals.db;
  const users = db.collection('Users');

  const existingUser = await users.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(409).json({ success: false, message: 'A user with that email already exists.' });
  }

  const passwordHash = hashPassword(password);
  const newUser = {
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    createdAt: new Date(),
  };

  const result = await users.insertOne(newUser);
  res.status(201).json({
    success: true,
    message: 'User registered successfully.',
    user: {
      id: result.insertedId,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    },
  });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const db = req.app.locals.db;
  const users = db.collection('Users');
  const user = await users.findOne({ email: email.toLowerCase() });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  res.json({
    success: true,
    message: 'Login successful.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

app.get('/employer/users', requireRole(['employer']), async (req, res) => {
  const db = req.app.locals.db;
  const users = db.collection('Users');
  const allUsers = await users.find({}, { projection: { passwordHash: 0 } }).toArray();
  res.json({ success: true, users: allUsers });
});

async function ensureCollections(db) {
  const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
  const existingNames = existingCollections.map((c) => c.name);

  for (const collectionName of COLLECTIONS) {
    if (!existingNames.includes(collectionName)) {
      await db.createCollection(collectionName);
      console.log(`Created MongoDB collection: ${collectionName}`);
    } else {
      console.log(`MongoDB collection already exists: ${collectionName}`);
    }
  }
}

async function startServer() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DB_NAME);
    await ensureCollections(db);
    app.locals.db = db;

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`Using MongoDB database: ${DB_NAME}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
