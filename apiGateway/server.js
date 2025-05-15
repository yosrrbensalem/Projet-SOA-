const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const http = require('http');
const { Kafka } = require('kafkajs');
const WebSocket = require('ws');
const cors = require('cors');
const app = express();
const PORT = 3005;

// Middleware
app.use(express.json());
app.use(cors());

// Load protobuf definition
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

// Create gRPC client
const feedbackClient = new feedbackProto.FeedbackService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// Promisify gRPC client methods
const submitFeedbackGrpc = (data) => {
  return new Promise((resolve, reject) => {
    feedbackClient.submitFeedback(data, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
};

const getAllFeedbacksGrpc = () => {
  return new Promise((resolve, reject) => {
    feedbackClient.getAllFeedbacks({}, (err, response) => {
      if (err) return reject(err);
      resolve(response.feedbacks);
    });
  });
};

const getFeedbacksByUserGrpc = (userId) => {
  return new Promise((resolve, reject) => {
    feedbackClient.getFeedbacksByUser({ userId }, (err, response) => {
      if (err) return reject(err);
      resolve(response.feedbacks);
    });
  });
};

const getFeedbacksByCategoryGrpc = (category) => {
  return new Promise((resolve, reject) => {
    feedbackClient.getFeedbacksByCategory({ category }, (err, response) => {
      if (err) return reject(err);
      resolve(response.feedbacks);
    });
  });
};

const getFeedbacksByScoreGrpc = (minScore) => {
  return new Promise((resolve, reject) => {
    feedbackClient.getFeedbacksByScore({ minScore }, (err, response) => {
      if (err) return reject(err);
      resolve(response.feedbacks);
    });
  });
};

// Define Apollo typeDefs and resolvers
const typeDefs = `
  type Feedback {
    id: ID!
    userId: String!
    content: String!
    category: String
    sentiment: String
    score: Float
    createdAt: String
  }

  input FeedbackInput {
    userId: String!
    content: String!
  }

  type SubmitFeedbackResponse {
    id: ID
    success: Boolean
    error: String
  }

  type Query {
    feedbacks: [Feedback]
    feedbacksByUser(userId: String!): [Feedback]
    feedbacksByScore(minScore: Float!): [Feedback]
    feedbacksByCategory(category: String!): [Feedback]
  }

  type Mutation {
    submitFeedback(input: FeedbackInput!): SubmitFeedbackResponse
  }
`;

const resolvers = {
  Query: {
    feedbacks: async () => {
      return await getAllFeedbacksGrpc();
    },
    feedbacksByUser: async (_, { userId }) => {
      return await getFeedbacksByUserGrpc(userId);
    },
    feedbacksByScore: async (_, { minScore }) => {
      return await getFeedbacksByScoreGrpc(parseFloat(minScore));
    },
    feedbacksByCategory: async (_, { category }) => {
      return await getFeedbacksByCategoryGrpc(category);
    }
  },
  Mutation: {
    submitFeedback: async (_, { input }) => {
      return await submitFeedbackGrpc(input);
    }
  }
};

// REST API pour soumettre des feedbacks
app.post('/api/feedback', async (req, res) => {
  try {
    const { userId, content } = req.body;
    
    if (!userId || !content) {
      return res.status(400).json({ error: 'userId et content sont requis' });
    }
    
    // Utiliser gRPC pour soumettre le feedback
    const response = await submitFeedbackGrpc({ userId, content });
    
    if (!response.success) {
      return res.status(400).json({ error: response.error });
    }
    
    res.status(201).json(response);
  } catch (error) {
    console.error('Erreur lors de la soumission du feedback:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// REST API endpoints for querying feedbacks
app.get('/api/feedbacks', async (req, res) => {
  try {
    const feedbacks = await getAllFeedbacksGrpc();
    res.json(feedbacks);
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/feedbacks/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const feedbacks = await getFeedbacksByUserGrpc(userId);
    res.json(feedbacks);
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/feedbacks/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const feedbacks = await getFeedbacksByCategoryGrpc(category);
    res.json(feedbacks);
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par catégorie:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/feedbacks/score/:minScore', async (req, res) => {
  try {
    const minScore = parseFloat(req.params.minScore);
    const feedbacks = await getFeedbacksByScoreGrpc(minScore);
    res.json(feedbacks);
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par score:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });

// Setup WebSocket connections
wss.on('connection', async (ws) => {
  console.log('Client connected to WebSocket');
  
  ws.on('message', (message) => {
    console.log('Received message from client:', message);
  });
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
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

// Start servers
async function startServer() {
  // Initialize Apollo Server
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
  });

  // Start Apollo Server
  await apolloServer.start();

  // Apply Apollo middleware
  app.use('/graphql', cors(), express.json(), expressMiddleware(apolloServer));

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`API Gateway démarré sur le port ${PORT}`);
    console.log(`GraphQL disponible à http://localhost:${PORT}/graphql`);
    
    // Comment out Kafka consumer if having issues
    // startKafkaConsumer().catch(err => {
    //   console.error('Failed to start Kafka consumer:', err);
    // });
  });
}

// Start Kafka consumer for real-time updates - commented out to avoid Kafka errors
async function startKafkaConsumer() {
  const kafka = new Kafka({
    clientId: 'api-gateway',
    brokers: ['localhost:9092']
  });

  const consumer = kafka.consumer({ groupId: 'api-gateway-group' });
  
  await consumer.connect();
  console.log('Kafka consumer connected for WebSocket broadcasts');
  
  await consumer.subscribe({ 
    topic: 'feedback-submitted', 
    fromBeginning: false 
  });
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const feedbackData = JSON.parse(message.value.toString());
        console.log(`Received feedback for broadcast: ${feedbackData.id}`);
        
        // Broadcast the new feedback to all connected clients
        broadcast({
          type: 'NEW_FEEDBACK',
          data: feedbackData
        });
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    },
  });
}

// Start everything
startServer().catch(err => {
  console.error('Failed to start server:', err);
});

