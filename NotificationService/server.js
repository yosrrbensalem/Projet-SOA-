const express = require('express');
const { Kafka } = require('kafkajs');
const { MongoClient, ObjectId } = require('mongodb');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 3003;

// MongoDB connection settings
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'notification_system';
let db;

// Express middleware
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });

// Setup WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected to NotificationService WebSocket');
  
  ws.on('message', (message) => {
    console.log('Received message from client:', message);
  });
  
  ws.on('close', () => {
    console.log('Client disconnected from NotificationService WebSocket');
  });
});

// Broadcast to all connected WebSocket clients
const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// MongoDB connection
async function connectToMongo() {
  try {
    const client = await MongoClient.connect(MONGO_URL);
    console.log('NotificationService: Connected to MongoDB');
    db = client.db(DB_NAME);
    
    // Create notifications collection if it doesn't exist
    if (!db.collection('notifications')) {
      await db.createCollection('notifications');
    }
    
    return true;
  } catch (err) {
    console.error('NotificationService: Error connecting to MongoDB:', err);
    return false;
  }
}

// Save notification to MongoDB
async function saveNotification(notification) {
  try {
    const result = await db.collection('notifications').insertOne({
      ...notification,
      createdAt: new Date()
    });
    console.log(`Notification saved with ID: ${result.insertedId}`);
    return result.insertedId;
  } catch (error) {
    console.error('Error saving notification:', error);
    throw error;
  }
}

// Start Kafka consumer for feedback events
async function startKafkaConsumer() {
  // Configure Kafka client
  const kafka = new Kafka({
    clientId: 'notification-service',
    brokers: ['localhost:9092']
  });

  // Create consumer
  const consumer = kafka.consumer({ groupId: 'notification-service-group' });
  
  await consumer.connect();
  console.log('Kafka consumer connected');
  
  // Subscribe to the feedback-submitted topic
  await consumer.subscribe({ 
    topic: 'feedback-submitted', 
    fromBeginning: false 
  });

  // Process incoming messages
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const feedbackData = JSON.parse(message.value.toString());
        console.log(`Received feedback for notification: ${feedbackData.id}`);
        
        // Create notification object
        const notification = {
          type: 'FEEDBACK_SUBMITTED',
          feedbackId: feedbackData.id,
          userId: feedbackData.userId,
          content: feedbackData.content,
          timestamp: new Date()
        };
        
        // Save notification to database
        const notificationId = await saveNotification(notification);
        
        // Add ID to notification object
        notification.id = notificationId;
        
        // Broadcast to WebSocket clients
        broadcast({
          type: 'NEW_NOTIFICATION',
          data: notification
        });
        
        // Publish to Kafka for API Gateway to forward to its clients
        await produceMessage('notifications', notification);
        
      } catch (error) {
        console.error('Error processing notification message:', error);
      }
    },
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    try {
      console.log('Disconnecting Kafka consumer...');
      await consumer.disconnect();
    } catch (error) {
      console.error('Error disconnecting consumer:', error);
    }
  });
}

// Setup Kafka producer
const kafka = new Kafka({
  clientId: 'notification-service-producer',
  brokers: ['localhost:9092']
});

const producer = kafka.producer();

// Connect Kafka producer
async function connectProducer() {
  await producer.connect();
  console.log('Kafka producer connected');
}

// Produce message to Kafka topic
async function produceMessage(topic, message) {
  try {
    await producer.send({
      topic,
      messages: [
        { value: JSON.stringify(message) }
      ]
    });
    console.log(`Message sent to topic ${topic}`);
  } catch (error) {
    console.error(`Error sending to topic ${topic}:`, error);
    throw error;
  }
}

// REST API endpoints
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await db.collection('notifications')
      .find()
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    
    res.json(notifications);
  } catch (error) {
    console.error('Error retrieving notifications:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/notifications/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const notifications = await db.collection('notifications')
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    
    res.json(notifications);
  } catch (error) {
    console.error('Error retrieving user notifications:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start everything
async function startServer() {
  try {
    // Connect to MongoDB
    const mongoConnected = await connectToMongo();
    if (!mongoConnected) {
      console.error('Cannot start server without MongoDB connection');
      process.exit(1);
    }
    
    // Connect Kafka producer
    await connectProducer();
    
    // Start Kafka consumer
    await startKafkaConsumer();
    
    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`NotificationService running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start NotificationService:', error);
    process.exit(1);
  }
}

// Start the server
startServer(); 