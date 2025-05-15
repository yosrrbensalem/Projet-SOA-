const { Kafka } = require('kafkajs');

// Configurer un client Kafka
const kafka = new Kafka({
  clientId: 'feedback-service',
  brokers: ['localhost:9092']
});

// Créer un producteur
const producer = kafka.producer();

// Connecter le producteur
producer.connect()
  .then(() => console.log('Producteur Kafka connecté'))
  .catch(err => {
    console.error('Erreur de connexion du producteur Kafka:', err);
    process.exit(1);
  });

// Fonction pour produire un message
const produceMessage = async (topic, message) => {
  try {
    await producer.send({
      topic,
      messages: [
        { value: JSON.stringify(message) }
      ]
    });
    console.log(`Message envoyé au topic ${topic}`);
  } catch (error) {
    console.error(`Erreur lors de l'envoi au topic ${topic}:`, error);
    throw error;
  }
};

module.exports = { produceMessage };