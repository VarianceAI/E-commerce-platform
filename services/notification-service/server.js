const express = require('express');
const { Kafka } = require('kafkajs');
const winston = require('winston');
require('dotenv').config();

const app = express();
app.use(express.json());

// Structured logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'notification-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/notification-service.log' })
  ]
});

// Kafka setup
const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: [process.env.KAFKA_BROKERS || 'localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'notification-group' });

// Notification storage (in production, use database)
let notifications = [];

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'notification-service',
    kafkaConnected: true
  });
});

// Get all notifications
app.get('/notifications', (req, res) => {
  res.json({
    notifications,
    total: notifications.length
  });
});

// Get notifications by user
app.get('/notifications/user/:userId', (req, res) => {
  const userNotifications = notifications.filter(n => n.userId === req.params.userId);
  res.json({
    notifications: userNotifications,
    total: userNotifications.length
  });
});

// Process order events
async function processOrderEvent(event) {
  const { orderId, userId, type: eventType, ...data } = event;

  logger.info('Processing order event', { orderId, userId, eventType });

  let notification = null;

  switch (eventType) {
    case 'OrderCreated':
      notification = {
        id: `notif-${Date.now()}`,
        userId,
        orderId,
        type: 'order_created',
        title: 'Order Placed Successfully',
        message: `Your order ${orderId} has been placed and is being processed.`,
        timestamp: new Date().toISOString(),
        read: false
      };
      break;

    case 'OrderStatusChanged':
      const status = data.newStatus;
      notification = {
        id: `notif-${Date.now()}`,
        userId,
        orderId,
        type: 'order_status_update',
        title: 'Order Status Updated',
        message: `Your order ${orderId} status changed to: ${status}`,
        timestamp: new Date().toISOString(),
        read: false
      };
      break;

    case 'PaymentCompleted':
      notification = {
        id: `notif-${Date.now()}`,
        userId,
        orderId,
        type: 'payment_success',
        title: 'Payment Confirmed',
        message: `Payment for order ${orderId} has been processed successfully.`,
        timestamp: new Date().toISOString(),
        read: false
      };
      break;

    case 'PaymentFailed':
      notification = {
        id: `notif-${Date.now()}`,
        userId,
        orderId,
        type: 'payment_failed',
        title: 'Payment Failed',
        message: `Payment for order ${orderId} failed. Please try again.`,
        timestamp: new Date().toISOString(),
        read: false
      };
      break;

    default:
      logger.warn('Unknown event type', { eventType });
      return;
  }

  if (notification) {
    notifications.push(notification);
    logger.info('Notification created', { notificationId: notification.id, type: notification.type });

    // In production, you might:
    // - Send email
    // - Send SMS
    // - Push notification to mobile app
    // - Store in database
  }
}

// Kafka consumer setup
async function startConsumer() {
  try {
    await consumer.connect();
    logger.info('Connected to Kafka');

    await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    logger.info('Subscribed to order-events topic');

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          logger.info('Received event', { eventType: event.type || event.eventType });

          await processOrderEvent(event);
        } catch (error) {
          logger.error('Error processing message', { error: error.message, value: message.value.toString() });
        }
      },
    });
  } catch (error) {
    logger.error('Kafka connection failed, retrying in 5s', { error: error.message });
    setTimeout(startConsumer, 5000);
  }
}

// Start server
const PORT = process.env.PORT || 3006;
app.listen(PORT, async () => {
  logger.info(`Notification Service running on port ${PORT}`);

  // Start Kafka consumer
  await startConsumer();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await consumer.disconnect();
  process.exit(0);
});