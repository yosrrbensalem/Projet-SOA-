const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { ObjectId } = require('mongodb');

// Charger le fichier proto
const PROTO_PATH = path.join(__dirname, '../protos/classification.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const classificationProto = grpc.loadPackageDefinition(packageDefinition).classification;

// Fonction pour démarrer le serveur gRPC
const startGrpcServer = (db) => {
  const server = new grpc.Server();
  
  // Implémenter le service
  server.addService(classificationProto.ClassificationService.service, {
    classifyFeedback: async (call, callback) => {
      try {
        const { feedbackId, content } = call.request;
        
        // Logique simple de classification basée sur des mots-clés
        let sentiment = 'neutre';
        let category = 'général';
        
        // Analyse du sentiment
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('génial') || 
            lowerContent.includes('super') || 
            lowerContent.includes('excellent')) {
          sentiment = 'positif';
        } else if (lowerContent.includes('mauvais') || 
                   lowerContent.includes('problème') || 
                   lowerContent.includes('bug')) {
          sentiment = 'négatif';
        }
        
        // Catégorisation
        if (lowerContent.includes('interface') || 
            lowerContent.includes('design') || 
            lowerContent.includes('affichage')) {
          category = 'interface';
        } else if (lowerContent.includes('performance') || 
                   lowerContent.includes('lent') || 
                   lowerContent.includes('rapide')) {
          category = 'performance';
        } else if (lowerContent.includes('fonctionnalité') || 
                   lowerContent.includes('fonction') || 
                   lowerContent.includes('feature')) {
          category = 'fonctionnalité';
        }
        
        // Mettre à jour dans MongoDB
        await db.collection('feedbacks').updateOne(
          { _id: new ObjectId(feedbackId) },
          { $set: { sentiment, category } }
        );
        
        callback(null, { success: true, sentiment, category });
      } catch (error) {
        console.error('Erreur lors de la classification:', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Erreur interne lors de la classification'
        });
      }
    }
  });
  
  // Démarrer le serveur
  server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Erreur lors du démarrage du serveur gRPC:', err);
      return;
    }
    console.log(`Serveur gRPC démarré sur le port ${port}`);
    server.start();
  });
};

module.exports = { startGrpcServer };