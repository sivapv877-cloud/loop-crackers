const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'job_portal';
const COLLECTIONS = ['Users', 'Jobs', 'Applications'];
const PASSWORD_OPTIONS = { iterations: 100000, keylen: 64, digest: 'sha512' };
const VALID_ROLES = ['job_seeker', 'employer'];
const APPLICATION_STATUSES = ['Applied', 'Under Review', 'Shortlisted', 'Interview', 'Selected', 'Rejected'];
const AUTH_TOKEN_HEADER = 'x-auth-token';

app.use(cors());
app.use(express.json());

function generateAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function requireAuth(req, res, next) {
  const token = req.get(AUTH_TOKEN_HEADER);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication token is required.' });
  }

  const db = req.app.locals.db;
  const users = db.collection('Users');
  const user = await users.findOne({ authToken: token });

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }

  req.user = user;
  next();
}

function requireRole(allowedRoles) {
  return async (req, res, next) => {
    if (!req.user) {
      await requireAuth(req, res, (err) => {
        if (err) next(err);
      });
      if (!req.user) {
        return;
      }
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied: insufficient role.' });
    }

    next();
  };
}

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
  const authToken = generateAuthToken();
  const newUser = {
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    authToken,
    skills: [],
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
      token: authToken,
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

  const authToken = generateAuthToken();
  await users.updateOne({ _id: user._id }, { $set: { authToken } });

  res.json({
    success: true,
    message: 'Login successful.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: authToken,
    },
  });
});

app.get('/me', requireAuth, async (req, res) => {
  const { _id, name, email, role, skills } = req.user;
  res.json({
    success: true,
    user: {
      id: _id,
      name,
      email,
      role,
      skills: skills || [],
    },
  });
});

app.get('/employer/users', requireRole(['employer']), async (req, res) => {
  const db = req.app.locals.db;
  const users = db.collection('Users');
  const allUsers = await users.find({}, { projection: { passwordHash: 0, authToken: 0 } }).toArray();
  res.json({ success: true, users: allUsers });
});

app.post('/jobs', requireRole(['employer']), async (req, res) => {
  const { title, description, skills } = req.body;
  if (!title || !description || !Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ success: false, message: 'Title, description, and skills are required. Skills must be a non-empty array.' });
  }

  const db = req.app.locals.db;
  const jobs = db.collection('Jobs');
  const newJob = {
    title,
    description,
    skills,
    postedByEmail: req.user.email,
    postedByName: req.user.name,
    createdAt: new Date(),
  };

  const result = await jobs.insertOne(newJob);
  res.status(201).json({
    success: true,
    message: 'Job created successfully.',
    job: {
      id: result.insertedId,
      ...newJob,
    },
  });
});

app.get('/jobs', async (req, res) => {
  const { postedByEmail } = req.query;
  const db = req.app.locals.db;
  const jobs = db.collection('Jobs');
  const query = postedByEmail ? { postedByEmail: postedByEmail.toLowerCase() } : {};
  const allJobs = await jobs.find(query).toArray();
  res.json({ success: true, jobs: allJobs });
});

app.post('/applications', requireRole(['job_seeker']), async (req, res) => {
  const { jobId, applicantName, applicantEmail, applicantRole } = req.body;
  if (!jobId || !applicantName || !applicantEmail || !applicantRole) {
    return res.status(400).json({ success: false, message: 'jobId, applicantName, applicantEmail, and applicantRole are required.' });
  }

  if (applicantRole !== 'job_seeker' || applicantEmail.toLowerCase() !== req.user.email) {
    return res.status(403).json({ success: false, message: 'Only authenticated job seekers may apply with their own email.' });
  }

  const db = req.app.locals.db;
  const jobs = db.collection('Jobs');
  const applications = db.collection('Applications');

  let job;
  try {
    job = await jobs.findOne({ _id: new ObjectId(jobId) });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Invalid jobId format.' });
  }

  if (!job) {
    return res.status(404).json({ success: false, message: 'Job not found.' });
  }

  const existingApplication = await applications.findOne({ jobId: job._id, applicantEmail: applicantEmail.toLowerCase() });
  if (existingApplication) {
    return res.status(409).json({ success: false, message: 'You have already applied to this job.' });
  }

  const result = await applications.insertOne({
    jobId: job._id,
    jobTitle: job.title,
    applicantName,
    applicantEmail: applicantEmail.toLowerCase(),
    applicantRole,
    status: 'Applied',
    createdAt: new Date(),
  });

  res.status(201).json({
    success: true,
    message: 'Application submitted successfully.',
    applicationId: result.insertedId,
  });
});

app.get('/applications', requireAuth, async (req, res) => {
  const { applicantEmail, jobId } = req.query;
  const db = req.app.locals.db;
  const applications = db.collection('Applications');

  if (applicantEmail) {
    if (applicantEmail.toLowerCase() !== req.user.email) {
      return res.status(403).json({ success: false, message: 'You may only view your own applications.' });
    }

    const results = await applications
      .find({ applicantEmail: applicantEmail.toLowerCase() })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, applications: results });
  }

  if (jobId) {
    if (req.user.role !== 'employer') {
      return res.status(403).json({ success: false, message: 'Employer access required to view applicants.' });
    }

    const jobs = db.collection('Jobs');
    let job;
    try {
      job = await jobs.findOne({ _id: new ObjectId(jobId) });
    } catch (error) {
      return res.status(400).json({ success: false, message: 'Invalid jobId format.' });
    }

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    if (job.postedByEmail !== req.user.email) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view applicants for this job.' });
    }

    const results = await applications
      .find({ jobId: job._id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, applications: results });
  }

  return res.status(400).json({ success: false, message: 'applicantEmail or jobId query parameter is required.' });
});

app.patch('/applications/:id/status', requireRole(['employer']), async (req, res) => {
  const { status } = req.body;
  const applicationId = req.params.id;

  if (!status || !APPLICATION_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Status is required and must be one of: ${APPLICATION_STATUSES.join(', ')}`,
    });
  }

  const db = req.app.locals.db;
  const applications = db.collection('Applications');

  let objectId;
  try {
    objectId = new ObjectId(applicationId);
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Invalid application ID.' });
  }

  const result = await applications.updateOne(
    { _id: objectId },
    { $set: { status, updatedAt: new Date() } },
  );

  if (result.matchedCount === 0) {
    return res.status(404).json({ success: false, message: 'Application not found.' });
  }

  res.json({ success: true, message: 'Application status updated successfully.', status });
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
