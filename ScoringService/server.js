const { startGrpcServer } = require('./grpc-server');
const { MongoClient } = require('mongodb');

// MongoDB connection
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'feedback_system';
let db;

// Connexion à MongoDB
MongoClient.connect(MONGO_URL, { useUnifiedTopology: true })
  .then(client => {
    console.log('Scoring Service: Connecté à MongoDB');
    db = client.db(DB_NAME);
    
    // Démarrer le serveur gRPC
    startGrpcServer(db);
  })
  .catch(err => {
    console.error('Erreur de connexion à MongoDB:', err);
    process.exit(1);
  });