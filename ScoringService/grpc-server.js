const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { ObjectId } = require('mongodb');

// Charger le fichier proto
const PROTO_PATH = path.join(__dirname, '../protos/scoring.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const scoringProto = grpc.loadPackageDefinition(packageDefinition).scoring;

// Fonction pour démarrer le serveur gRPC
const startGrpcServer = (db) => {
  const server = new grpc.Server();
  
  // Implémenter le service
  server.addService(scoringProto.ScoringService.service, {
    scoreFeedback: async (call, callback) => {
      try {
        const { feedbackId, content, sentiment, category } = call.request;
        
        // Calculer un score basique
        let score = 5.0; // Score par défaut (échelle de 0 à 10)
        
        // Ajuster le score en fonction du sentiment
        if (sentiment === 'positif') {
          score += 3.0;
        } else if (sentiment === 'négatif') {
          score -= 3.0;
        }
        
        // Ajuster en fonction de la longueur du contenu (engagement)
        const wordCount = content.split(/\s+/).length;
        if (wordCount > 20) {
          score += 1.0;
        }
        
        // Ajuster pour des catégories prioritaires
        if (category === 'bug' || category === 'performance') {
          score += 1.0;
        }
        
        // Normaliser le score entre 0 et 10
        score = Math.max(0, Math.min(10, score));
        
        // Mettre à jour dans MongoDB
        await db.collection('feedbacks').updateOne(
          { _id: new ObjectId(feedbackId) },
          { $set: { score } }
        );
        
        callback(null, { success: true, score });
      } catch (error) {
        console.error('Erreur lors du scoring:', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Erreur interne lors du scoring'
        });
      }
    }
  });
  
  // Démarrer le serveur
  server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Erreur lors du démarrage du serveur gRPC:', err);
      return;
    }
    console.log(`Serveur gRPC de scoring démarré sur le port ${port}`);
    server.start();
  });
};

module.exports = { startGrpcServer };