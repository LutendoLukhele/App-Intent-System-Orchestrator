// nango-integrations/google-mail/syncs/emails.ts
// INBOX-filtered email sync - excludes promotions, social, and forum emails

export default async function fetchData(nango: any): Promise<void> {
  const lastSyncDate = nango.lastSyncDate;
  const since = lastSyncDate || new Date(Date.now() - 48 * 60 * 60 * 1000);
  const sinceEpoch = Math.floor(since.getTime() / 1000);

  let pageToken = '';

  do {
    const params: any = {
      maxResults: '50',
      // INBOX-FOCUSED: Only fetch INBOX emails, exclude promotional/social/forum categories
      q: `after:${sinceEpoch} label:INBOX -label:CATEGORY_PROMOTIONS -label:CATEGORY_SOCIAL -label:CATEGORY_FORUMS`,
    };
    if (pageToken) {
      params['pageToken'] = pageToken;
    }

    const list = await nango.proxy({
      method: 'GET',
      endpoint: '/gmail/v1/users/me/messages',
      params,
      retries: 3,
    });

    const messages = list.data?.messages || [];
    const emails: any[] = [];

    for (const msg of messages) {
      const detail = await nango.proxy({
        method: 'GET',
        endpoint: '/gmail/v1/users/me/messages/' + msg.id,
        params: { format: 'full' },
        retries: 3,
      });

      const headers: any = {};
      for (const h of detail.data?.payload?.headers || []) {
        headers[h.name] = h.value;
      }

      emails.push({
        id: detail.data.id,
        threadId: detail.data.threadId,
        from: headers['From'] || '',
        to: headers['To'] || '',
        subject: headers['Subject'] || '',
        snippet: detail.data.snippet || '',
        body: extractBody(detail.data?.payload),
        date: new Date(parseInt(detail.data.internalDate)).toISOString(),
        labels: detail.data.labelIds || [],
        isRead: !(detail.data.labelIds || []).includes('UNREAD'),
        hasAttachments: hasAttachments(detail.data?.payload),
        inReplyTo: headers['In-Reply-To'] || null,
      });
    }

    if (emails.length > 0) {
      await nango.batchSave(emails, 'GmailEmail');
    }

    pageToken = list.data?.nextPageToken || '';
  } while (pageToken);
}

function extractBody(payload: any): string {
  if (!payload) return '';

  function findText(parts: any[]): string {
    for (const p of parts) {
      if (p.mimeType === 'text/plain' && p.body?.data) {
        return Buffer.from(p.body.data, 'base64').toString('utf8');
      }
      if (p.parts) {
        const found = findText(p.parts);
        if (found) return found;
      }
    }
    return '';
  }

  if (payload.parts) return findText(payload.parts);
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64').toString('utf8');
  return '';
}

function hasAttachments(payload: any): boolean {
  if (!payload) return false;

  function check(parts: any[]): boolean {
    for (const p of parts) {
      if (p.filename && p.filename.length > 0) return true;
      if (p.parts && check(p.parts)) return true;
    }
    return false;
  }

  return payload.parts ? check(payload.parts) : false;
}
