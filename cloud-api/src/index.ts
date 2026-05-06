import { createCloudApiService } from './service';
import { createMemoryCloudStore } from './memory-store';
import { createMemoryObjectStorage } from './object-storage';
import { createCloudHttpServer } from './server';
import { createTeamSyncKey } from '../../src/main/domain/cloud-crypto';

const port = Number(process.env.FINGERBROWSER_CLOUD_PORT ?? '18345');
const service = createCloudApiService({
  store: createMemoryCloudStore(),
  objects: createMemoryObjectStorage(),
  tokenSecret: process.env.FINGERBROWSER_CLOUD_TOKEN_SECRET ?? 'fingerbrowser-cloud-dev-token-secret'
});

service.bootstrapTeam({
  teamName: process.env.FINGERBROWSER_CLOUD_BOOTSTRAP_TEAM ?? 'FingerBrowser 云工作区',
  adminEmail: process.env.FINGERBROWSER_CLOUD_BOOTSTRAP_EMAIL ?? 'admin@example.test',
  adminPassword: process.env.FINGERBROWSER_CLOUD_BOOTSTRAP_PASSWORD ?? 'AdminPass123!',
  adminDisplayName: process.env.FINGERBROWSER_CLOUD_BOOTSTRAP_NAME ?? '云端管理员',
  teamKey: createTeamSyncKey()
});

createCloudHttpServer(service).listen(port, '127.0.0.1', () => {
  process.stdout.write(`FingerBrowser cloud-api listening on http://127.0.0.1:${port}\n`);
});
