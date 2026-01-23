/**
 * Consolidated Salesforce entity sync
 * - Fetches Leads, Contacts, Accounts, Opportunities, Cases, Articles
 * - Saves all entities to a single generic SalesforceEntity model
 * - Backfills most recent rows, then switches to incremental deltas via SystemModstamp
 */

const API_VERSION = '58.0';
const BATCH_SAVE_CHUNK = 200;
const MAX_RECORDS_PER_ENTITY = 1200;

interface EntityDefinition {
  entityType: string;
  fields: string[];
  backfillLimit: number;
  incrementalLimit: number;
}

interface EntitySyncState {
  lastSystemModstamp?: string | undefined;
  backfillCompleted?: boolean | undefined;
}

const ENTITY_DEFINITIONS: EntityDefinition[] = [
  {
    entityType: 'Lead',
    fields: [
      'Id',
      'FirstName',
      'LastName',
      'Email',
      'Company',
      'Phone',
      'Status',
      'Rating',
      'LeadSource',
      'CreatedDate',
      'LastModifiedDate',
      'SystemModstamp',
      'OwnerId'
    ],
    backfillLimit: 500,
    incrementalLimit: 250,
  },
  {
    entityType: 'Contact',
    fields: [
      'Id',
      'FirstName',
      'LastName',
      'Email',
      'Phone',
      'MobilePhone',
      'Title',
      'AccountId',
      'CreatedDate',
      'LastModifiedDate',
      'SystemModstamp',
      'OwnerId'
    ],
    backfillLimit: 500,
    incrementalLimit: 250,
  },
  {
    entityType: 'Account',
    fields: [
      'Id',
      'Name',
      'Website',
      'Phone',
      'Industry',
      'BillingCity',
      'BillingState',
      'CreatedDate',
      'LastModifiedDate',
      'SystemModstamp',
      'OwnerId'
    ],
    backfillLimit: 400,
    incrementalLimit: 200,
  },
  {
    entityType: 'Opportunity',
    fields: [
      'Id',
      'Name',
      'Amount',
      'StageName',
      'Probability',
      'CloseDate',
      'AccountId',
      'IsClosed',
      'IsWon',
      'CreatedDate',
      'LastModifiedDate',
      'SystemModstamp',
      'OwnerId'
    ],
    backfillLimit: 400,
    incrementalLimit: 200,
  },
  {
    entityType: 'Case',
    fields: [
      'Id',
      'CaseNumber',
      'Subject',
      'Status',
      'Priority',
      'Origin',
      'AccountId',
      'ContactId',
      'CreatedDate',
      'LastModifiedDate',
      'SystemModstamp',
      'OwnerId'
    ],
    backfillLimit: 300,
    incrementalLimit: 150,
  },
  {
    entityType: 'Article',
    fields: [
      'Id',
      'ArticleNumber',
      'Title',
      'Summary',
      'IsPublished',
      'CreatedDate',
      'LastModifiedDate',
      'SystemModstamp'
    ],
    backfillLimit: 200,
    incrementalLimit: 100,
  }
];

export default async function fetchData(nango: any): Promise<void> {
  const previousMetadata = (nango.lastSyncMetadata || {}) as {
    entityStates?: Record<string, EntitySyncState>;
    [key: string]: any;
  };
  const previousStates = (previousMetadata.entityStates || {}) as Record<string, EntitySyncState>;
  const nextStates: Record<string, EntitySyncState> = { ...previousStates };

  for (const definition of ENTITY_DEFINITIONS) {
    try {
      const updatedState = await syncEntity(nango, definition, previousStates[definition.entityType]);
      if (updatedState) {
        nextStates[definition.entityType] = updatedState;
      }
    } catch (error: any) {
      await safeLog(nango, `Salesforce sync failed for ${definition.entityType}: ${error.message}`);
    }
  }

  const updatedMetadata = {
    ...previousMetadata,
    entityStates: nextStates,
    updatedAt: new Date().toISOString(),
  };

  if (typeof nango.setLastSyncMetadata === 'function') {
    await nango.setLastSyncMetadata(updatedMetadata);
  }
}

async function syncEntity(
  nango: any,
  definition: EntityDefinition,
  prevState?: EntitySyncState
): Promise<EntitySyncState | null> {
  const since = prevState?.lastSystemModstamp;
  const isBackfill = !since;
  const limit = isBackfill ? definition.backfillLimit : definition.incrementalLimit;
  const query = buildQuery(definition, since, limit, isBackfill);
  let nextRecordsUrl: string | undefined;
  let totalFetched = 0;
  let latestStamp = since;

  do {
    const response = await executeQuery(nango, query, nextRecordsUrl);
    const records = Array.isArray(response.data?.records) ? response.data.records : [];

    if (records.length > 0) {
      await saveRecords(nango, definition.entityType, records);
      totalFetched += records.length;
      latestStamp = records.reduce((max: string | undefined, record: any): string | undefined => {
        const stamp = getRecordStamp(record);
        if (!stamp) return max;
        if (!max || stamp > max) return stamp;
        return max;
      }, latestStamp);
    }

    nextRecordsUrl = response.data?.nextRecordsUrl;
    if (!nextRecordsUrl) break;
    if (totalFetched >= MAX_RECORDS_PER_ENTITY) break;
  } while (nextRecordsUrl);

  await safeLog(
    nango,
    `Salesforce ${definition.entityType} sync: ${totalFetched} records (since=${since || 'start'}) -> nextStamp=${latestStamp || 'none'}`
  );

  if (!latestStamp && !prevState) {
    return null;
  }

  return {
    lastSystemModstamp: latestStamp || prevState?.lastSystemModstamp,
    backfillCompleted: true,
  } as EntitySyncState;
}

function buildQuery(
  definition: EntityDefinition,
  since: string | undefined,
  limit: number,
  isBackfill: boolean
): string {
  const direction = isBackfill ? 'DESC' : 'ASC';
  const whereClause = since ? `WHERE SystemModstamp > ${formatSoqlTimestamp(since)}` : '';
  const fields = definition.fields.join(', ');
  return `SELECT ${fields} FROM ${definition.entityType} ${whereClause} ORDER BY SystemModstamp ${direction} LIMIT ${limit}`;
}

async function executeQuery(nango: any, query: string, nextRecordsUrl?: string) {
  if (nextRecordsUrl) {
    return nango.proxy({
      method: 'GET',
      endpoint: nextRecordsUrl,
      retries: 3,
    });
  }

  return nango.proxy({
    method: 'GET',
    endpoint: `/services/data/v${API_VERSION}/query`,
    params: { q: query },
    retries: 3,
  });
}

/**
 * Save records to generic SalesforceEntity model
 * Wraps each record with entityType metadata
 */
async function saveRecords(nango: any, entityType: string, records: any[]): Promise<void> {
  // Map records to generic entity format with entityType metadata
  const mappedRecords = records.map((record: any) => ({
    id: record.Id,
    entityType,
    data: record, // Store the full Salesforce record
  }));

  for (let i = 0; i < mappedRecords.length; i += BATCH_SAVE_CHUNK) {
    const chunk = mappedRecords.slice(i, i + BATCH_SAVE_CHUNK);
    await nango.batchSave(chunk, 'SalesforceEntity');
  }
}

function getRecordStamp(record: any): string | undefined {
  return record.SystemModstamp || record.LastModifiedDate;
}

function formatSoqlTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return `'${value}'`;
  }
  return `'${timestamp.toISOString().replace(/\.\d+Z$/, 'Z')}'`;
}

async function safeLog(nango: any, message: string): Promise<void> {
  if (typeof nango.log === 'function') {
    await nango.log(message);
  }
}