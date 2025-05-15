const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { buildSchema } = require('graphql');
const { graphqlHTTP } = require('express-graphql');
const app = express();
const PORT = 3003;

// MongoDB connection
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'feedback_system';
let db;

// Middleware pour parser le JSON
app.use(express.json());

// Connexion à MongoDB
MongoClient.connect(MONGO_URL, { useUnifiedTopology: true })
  .then(client => {
    console.log('Dashboard Service: Connecté à MongoDB');
    db = client.db(DB_NAME);
  })
  .catch(err => {
    console.error('Erreur de connexion à MongoDB:', err);
    process.exit(1);
  });

// Endpoints REST
app.get('/api/dashboard/feedbacks', async (req, res) => {
  try {
    const feedbacks = await db.collection('feedbacks').find().toArray();
    res.json(feedbacks.map(feedback => ({
      ...feedback,
      id: feedback._id.toString()
    })));
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/dashboard/feedbacks/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const feedbacks = await db.collection('feedbacks')
      .find({ userId })
      .toArray();
    
    res.json(feedbacks.map(feedback => ({
      ...feedback,
      id: feedback._id.toString()
    })));
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/dashboard/feedbacks/score/:minScore', async (req, res) => {
  try {
    const minScore = parseFloat(req.params.minScore);
    const feedbacks = await db.collection('feedbacks')
      .find({ score: { $gte: minScore } })
      .toArray();
    
    res.json(feedbacks.map(feedback => ({
      ...feedback,
      id: feedback._id.toString()
    })));
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par score:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/dashboard/feedbacks/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const feedbacks = await db.collection('feedbacks')
      .find({ category })
      .toArray();
    
    res.json(feedbacks.map(feedback => ({
      ...feedback,
      id: feedback._id.toString()
    })));
  } catch (error) {
    console.error('Erreur lors de la récupération des feedbacks par catégorie:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Schéma GraphQL
const schema = buildSchema(`
  type Feedback {
    id: ID!
    userId: String!
    content: String!
    category: String
    sentiment: String
    score: Float
    createdAt: String
  }

  type Query {
    feedbacks: [Feedback]
    feedbacksByUser(userId: String!): [Feedback]
    feedbacksByScore(minScore: Float!): [Feedback]
    feedbacksByCategory(category: String!): [Feedback]
  }
`);

// Résolveurs GraphQL
const root = {
  feedbacks: async () => {
    const feedbacks = await db.collection('feedbacks').find().toArray();
    return feedbacks.map(feedback => ({
      ...feedback,
      id: feedback._id.toString(),
      createdAt: feedback.createdAt.toISOString()
    }));
  },
  feedbacksByUser: async ({ userId }) => {
    const feedbacks = await db.collection('feedbacks')
      .find({ userId })
      .toArray();
      
    return feedbacks.map(feedback => ({
      ...feedback,
      id: feedback._id.toString(),
      createdAt: feedback.createdAt.toISOString()
    }));
  },
  feedbacksByScore: async ({ minScore }) => {
    const feedbacks = await db.collection('feedbacks')
      .find({ score: { $gte: minScore } })
      .toArray();
      
    return feedbacks.map(feedback => ({
      ...feedback,
      id: feedback._id.toString(),
      createdAt: feedback.createdAt.toISOString()
    }));
  },
  feedbacksByCategory: async ({ category }) => {
    const feedbacks = await db.collection('feedbacks')
      .find({ category })
      .toArray();
      
    return feedbacks.map(feedback => ({
      ...feedback,
      id: feedback._id.toString(),
      createdAt: feedback.createdAt.toISOString()
    }));
  }
};

// Endpoint GraphQL
app.use('/graphql', graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: true
}));

app.listen(PORT, () => {
  console.log(`Dashboard Service démarré sur le port ${PORT}`);
});