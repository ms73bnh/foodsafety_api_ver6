// Legacy entry point: route all rebuilds through the durable V3 ingestion queue.
export { GET, POST } from '../chunks/route';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
