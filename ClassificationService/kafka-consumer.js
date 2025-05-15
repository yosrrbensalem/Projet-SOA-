const { Kafka } = require('kafkajs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Charger le fichier proto pour le client Scoring
const PROTO_PATH = path.join(__dirname, '../protos/scoring.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const scoringProto = grpc.loadPackageDefinition(packageDefinition).scoring;

// Configurer un client Kafka
const kafka = new Kafka({
  clientId: 'classification-service',
  brokers: ['localhost:9092']
});

// Créer un consommateur
const consumer = kafka.consumer({ groupId: 'classification-group' });

// Client gRPC pour le service de scoring
const scoringClient = new scoringProto.ScoringService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

// Fonction pour démarrer le consommateur Kafka
const startKafkaConsumer = async (db) => {
  try {
    // Connecter le consommateur
    await consumer.connect();
    console.log('Consommateur Kafka connecté');
    
    // S'abonner au topic
    await consumer.subscribe({ topic: 'feedback-submitted', fromBeginning: true });
    
    // Écouter les messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const feedbackData = JSON.parse(message.value.toString());
          console.log(`Message reçu: ${JSON.stringify(feedbackData)}`);
          
          // Classification via gRPC local
          const classificationClient = new classificationProto.ClassificationService(
            'localhost:50051',
            grpc.credentials.createInsecure()
          );
          
          classificationClient.classifyFeedback({
            feedbackId: feedbackData.id,
            content: feedbackData.content
          }, (err, response) => {
            if (err) {
              console.error('Erreur lors de la classification:', err);
              return;
            }
            
            console.log(`Classification terminée: ${JSON.stringify(response)}`);
            
            // Envoyer au service de scoring
            scoringClient.scoreFeedback({
              feedbackId: feedbackData.id,
              content: feedbackData.content,
              sentiment: response.sentiment,
              category: response.category
            }, (err, scoreResponse) => {
              if (err) {
                console.error('Erreur lors du scoring:', err);
                return;
              }
              
              console.log(`Scoring terminé: ${JSON.stringify(scoreResponse)}`);
            });
          });
        } catch (error) {
          console.error('Erreur lors du traitement du message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Erreur dans le consommateur Kafka:', error);
    process.exit(1);
  }
};

module.exports = { startKafkaConsumer };