import 'reflect-metadata';
import { AppDataSource } from './stores/data-source';
import { createContainer, Container } from './bootstrap/container';

/**
 * Application entry point.
 * Initializes database connection and creates the dependency container.
 */
async function main(): Promise<Container> {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('Database connection established');

    // Create dependency container
    const container = await createContainer(AppDataSource);
    console.log('Container initialized');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await AppDataSource.destroy();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down...');
      await AppDataSource.destroy();
      process.exit(0);
    });

    return container;
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Run if this is the main module
main();

// Export for external consumption
export { createContainer } from './bootstrap/container';
export { AppDataSource } from './stores/data-source';
export type { Container } from './bootstrap/container';
