const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'job_portal';
const COLLECTIONS = ['Users', 'Jobs', 'Applications'];

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Job Portal backend is running.');
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
