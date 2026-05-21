import app from './app';
import { config } from './config';
import { logger } from './utils/logger';

app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    `Server running on http://localhost:${config.port}`
  );
});
