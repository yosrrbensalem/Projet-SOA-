const { spawn } = require('child_process');
const path = require('path');

// Start FeedbackService
function startFeedbackService() {
  console.log('Starting FeedbackService on port 3006 (REST) and 50051 (gRPC)...');
  const feedbackService = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, 'FeedbackService'),
    stdio: 'inherit'
  });

  feedbackService.on('close', (code) => {
    console.log(`FeedbackService process exited with code ${code}`);
  });

  return feedbackService;
}

// Start Kafka Consumer for FeedbackService
function startFeedbackConsumer() {
  console.log('Starting FeedbackService Kafka Consumer...');
  const feedbackConsumer = spawn('node', ['kafka-consumer.js'], {
    cwd: path.join(__dirname, 'FeedbackService'),
    stdio: 'inherit'
  });

  feedbackConsumer.on('close', (code) => {
    console.log(`FeedbackService Kafka Consumer process exited with code ${code}`);
  });

  return feedbackConsumer;
}

// Start NotificationService
function startNotificationService() {
  console.log('Starting NotificationService on port 3003...');
  const notificationService = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, 'NotificationService'),
    stdio: 'inherit'
  });

  notificationService.on('close', (code) => {
    console.log(`NotificationService process exited with code ${code}`);
  });

  return notificationService;
}

// Start API Gateway
function startApiGateway() {
  console.log('Starting API Gateway on port 3007...');
  const apiGateway = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, 'apiGateway'),
    stdio: 'inherit'
  });

  apiGateway.on('close', (code) => {
    console.log(`API Gateway process exited with code ${code}`);
  });

  return apiGateway;
}

// Start all services
function startAll() {
  const feedbackService = startFeedbackService();
  
  // Wait a bit before starting the consumer to ensure the service is up
  setTimeout(() => {
    const feedbackConsumer = startFeedbackConsumer();
    
    // Start NotificationService after FeedbackService is running
    setTimeout(() => {
      const notificationService = startNotificationService();
      
      // Wait a bit before starting the gateway to ensure all services are up
      setTimeout(() => {
        const apiGateway = startApiGateway();
        
        // Handle process termination
        process.on('SIGINT', () => {
          console.log('Shutting down all services...');
          apiGateway.kill();
          notificationService.kill();
          feedbackConsumer.kill();
          feedbackService.kill();
          process.exit(0);
        });
      }, 2000);
    }, 2000);
  }, 2000);
}

// Start everything
startAll(); 