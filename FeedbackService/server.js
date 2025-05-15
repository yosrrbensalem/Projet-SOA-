const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { produceMessage } = require('./kafka-producer');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const app = express();
const PORT = 3006;
const GRPC_PORT = 50051;

// MongoDB connection
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'feedback_system';
let db;

// Middleware pour parser le JSON
app.use(express.json());

// Connexion à MongoDB
MongoClient.connect(MONGO_URL, { useUnifiedTopology: true })
  .then(client => {
    console.log('Connecté à MongoDB');
    db = client.db(DB_NAME);
  })
  .catch(err => {
    console.error('Erreur de connexion à MongoDB:', err);
    process.exit(1);
  });

// Endpoint pour enregistrer un feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { userId, content } = req.body;
    
    if (!userId || !content) {
      return res.status(400).json({ error: 'userId et content sont requis' });
    }
    
    // Créer un nouveau feedback
    const feedback = {
      userId,
      content,
      createdAt: new Date(),
      sentiment: null,
      category: null,
      score: null
    };
    
    // Enregistrer dans MongoDB
    const result = await db.collection('feedbacks').insertOne(feedback);
    
    // Publier dans Kafka pour traitement
    await produceMessage('feedback-submitted', {
      id: result.insertedId.toString(),
      userId,
      content,
      createdAt: feedback.createdAt
    });
    
    res.status(201).json({
      id: result.insertedId,
      ...feedback
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du feedback:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Configuration gRPC
const PROTO_PATH = path.resolve(__dirname, '../proto/feedback.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const feedbackProto = protoDescriptor.feedback;

// Implémentation des services gRPC
const submitFeedback = async (call, callback) => {
  try {
    const { userId, content } = call.request;
    
    if (!userId || !content) {
      return callback(null, { 
        success: false, 
        error: 'userId et content sont requis'
      });
    }
    
    // Créer un nouveau feedback
    const feedback = {
      userId,
      content,
      createdAt: new Date(),
      sentiment: null,
      category: null,
      score: null
    };
    
    // Enregistrer dans MongoDB
    const result = await db.collection('feedbacks').insertOne(feedback);
    
    // Publier dans Kafka pour traitement
    await produceMessage('feedback-submitted', {
      id: result.insertedId.toString(),
      userId,
      content,
      createdAt: feedback.createdAt
    });
    
    callback(null, {
      id: result.insertedId.toString(),
      success: true,
      error: null
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du feedback via gRPC:', error);
    callback(null, { 
      success: false, 
      error: 'Erreur serveur'
    });
  }
};

const getAllFeedbacks = async (call, callback) => {
  try {
    const feedbacks = await db.collection('feedbacks').find().toArray();
    callback(null, {
      feedbacks: feedbacks.map(feedback => ({
        id: feedback._id.toString(),
        userId: feedback.userId,
        content: feedback.content,
        category: feedback.category,
        sentiment: feedback.sentiment,
        score: feedback.score,
        createdAt: feedback.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks via gRPC:', error);
    callback({
      code: grpc.status.INTERNAL,
      message: 'Erreur serveur'
    });
  }
};

const getFeedbacksByUser = async (call, callback) => {
  try {
    const { userId } = call.request;
    const feedbacks = await db.collection('feedbacks')
      .find({ userId })
      .toArray();
    
    callback(null, {
      feedbacks: feedbacks.map(feedback => ({
        id: feedback._id.toString(),
        userId: feedback.userId,
        content: feedback.content,
        category: feedback.category,
        sentiment: feedback.sentiment,
        score: feedback.score,
        createdAt: feedback.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par utilisateur via gRPC:', error);
    callback({
      code: grpc.status.INTERNAL,
      message: 'Erreur serveur'
    });
  }
};

const getFeedbacksByCategory = async (call, callback) => {
  try {
    const { category } = call.request;
    const feedbacks = await db.collection('feedbacks')
      .find({ category })
      .toArray();
    
    callback(null, {
      feedbacks: feedbacks.map(feedback => ({
        id: feedback._id.toString(),
        userId: feedback.userId,
        content: feedback.content,
        category: feedback.category,
        sentiment: feedback.sentiment,
        score: feedback.score,
        createdAt: feedback.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par catégorie via gRPC:', error);
    callback({
      code: grpc.status.INTERNAL,
      message: 'Erreur serveur'
    });
  }
};

const getFeedbacksByScore = async (call, callback) => {
  try {
    const { minScore } = call.request;
    const feedbacks = await db.collection('feedbacks')
      .find({ score: { $gte: minScore } })
      .toArray();
    
    callback(null, {
      feedbacks: feedbacks.map(feedback => ({
        id: feedback._id.toString(),
        userId: feedback.userId,
        content: feedback.content,
        category: feedback.category,
        sentiment: feedback.sentiment,
        score: feedback.score,
        createdAt: feedback.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par score via gRPC:', error);
    callback({
      code: grpc.status.INTERNAL,
      message: 'Erreur serveur'
    });
  }
};

// Démarrer le serveur gRPC
function startGrpcServer() {
  const server = new grpc.Server();
  server.addService(feedbackProto.FeedbackService.service, {
    submitFeedback,
    getAllFeedbacks,
    getFeedbacksByUser,
    getFeedbacksByCategory,
    getFeedbacksByScore
  });
  
  server.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Erreur lors du démarrage du serveur gRPC:', err);
      return;
    }
    server.start();
    console.log(`Serveur gRPC démarré sur le port ${port}`);
  });
}

// Démarrer les serveurs
app.listen(PORT, () => {
  console.log(`Feedback Service démarré sur le port ${PORT}`);
  startGrpcServer();
});