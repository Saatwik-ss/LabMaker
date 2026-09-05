import dotenv from 'dotenv';
import { setupServer } from './server';
import { Logger } from './utils/Logger';

// Load environment variables
dotenv.config();

const logger = new Logger('Main');

async function main() {
  try {
    const port = parseInt(process.env.CODEX_API_PORT || '3001', 10);
    const app = setupServer();

    app.listen(port, '0.0.0.0', () => {
      logger.info(`Codex Backend running on http://127.0.0.1:${port}`);
      logger.info('Press Ctrl+C to stop');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

main();
