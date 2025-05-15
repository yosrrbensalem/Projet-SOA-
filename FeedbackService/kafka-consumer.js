const { Kafka } = require('kafkajs');
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'feedback_system';
let db;

// Configure Kafka client
const kafka = new Kafka({
  clientId: 'feedback-service-consumer',
  brokers: ['localhost:9092']
});

// Create consumer
const consumer = kafka.consumer({ groupId: 'feedback-processing-group' });

// MongoDB connection 
async function connectToMongo() {
  try {
    const client = await MongoClient.connect(MONGO_URL, { useUnifiedTopology: true });
    console.log('Consumer: Connected to MongoDB');
    db = client.db(DB_NAME);
    return true;
  } catch (err) {
    console.error('Consumer: Error connecting to MongoDB:', err);
    return false;
  }
}

// Process feedback (simulate sentiment analysis and categorization)
async function processFeedback(feedbackData) {
  // This would normally call a ML model or external service
  // Here we'll just simulate with a basic algorithm
  
  const content = feedbackData.content.toLowerCase();
  let sentiment = 'neutral';
  let category = 'general';
  let score = 0.5; // Default neutral score
  
  // Simple sentiment analysis
  const positiveWords = ['great', 'awesome', 'excellent', 'good', 'love', 'like'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'poor'];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  positiveWords.forEach(word => {
    if (content.includes(word)) positiveCount++;
  });
  
  negativeWords.forEach(word => {
    if (content.includes(word)) negativeCount++;
  });
  
  if (positiveCount > negativeCount) {
    sentiment = 'positive';
    score = 0.5 + (0.5 * (positiveCount / (positiveCount + negativeCount)));
  } else if (negativeCount > positiveCount) {
    sentiment = 'negative';
    score = 0.5 - (0.5 * (negativeCount / (positiveCount + negativeCount)));
  }
  
  // Simple categorization
  if (content.includes('feature') || content.includes('functionality')) {
    category = 'feature';
  } else if (content.includes('bug') || content.includes('error') || content.includes('issue')) {
    category = 'bug';
  } else if (content.includes('ui') || content.includes('interface') || content.includes('design')) {
    category = 'design';
  } else if (content.includes('performance') || content.includes('slow') || content.includes('fast')) {
    category = 'performance';
  }
  
  // Update the feedback in MongoDB
  const result = await db.collection('feedbacks').updateOne(
    { _id: ObjectId(feedbackData.id) },
    { 
      $set: { 
        sentiment,
        category,
        score
      } 
    }
  );
  
  console.log(`Processed feedback ${feedbackData.id}: sentiment=${sentiment}, category=${category}, score=${score}`);
  
  return {
    id: feedbackData.id,
    sentiment,
    category,
    score
  };
}

// Start consuming messages
async function run() {
  // Connect to MongoDB first
  const mongoConnected = await connectToMongo();
  if (!mongoConnected) {
    console.error('Exiting consumer due to MongoDB connection failure');
    process.exit(1);
  }
  
  await consumer.connect();
  console.log('Kafka consumer connected');
  
  // Subscribe to the 'feedback-submitted' topic
  await consumer.subscribe({ 
    topic: 'feedback-submitted', 
    fromBeginning: false 
  });
  
  // Process incoming messages
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const feedbackData = JSON.parse(message.value.toString());
        console.log(`Received feedback: ${feedbackData.id}`);
        
        // Process the feedback
        const processedData = await processFeedback(feedbackData);
        
        // Here you could publish to another topic with the processed results
        // This would allow for a more complex event-driven architecture
      } catch (error) {
        console.error('Error processing message:', error);
      }
    },
  });
}

run().catch(error => {
  console.error('Error in consumer:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  try {
    console.log('Disconnecting consumer...');
    await consumer.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error disconnecting consumer:', error);
    process.exit(1);
  }
}); 