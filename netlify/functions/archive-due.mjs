import { getStore } from '@netlify/blobs';

export default async () => {
  const sched = getStore('archive-scheduled');
  const archived = getStore('archived-projects');
  const today = new Date().toISOString().slice(0, 10);
  let done = 0;
  try {
    const { blobs } = await sched.list();
    let ids = [];
    try { const d = await archived.get('ids', { type: 'json' }); ids = Array.isArray(d) ? d.map(String) : []; } catch (e) {}
    for (const b of (blobs || [])) {
      const rec = await sched.get(b.key, { type: 'json' });
      if (!rec || !rec.date) continue;
      if (rec.date <= today) {
        if (!ids.includes(String(rec.projectId))) ids.push(String(rec.projectId));
        await sched.delete(b.key);
        done++;
      }
    }
    if (done) await archived.setJSON('ids', ids);
  } catch (e) {}
  return new Response('archived due projects: ' + done);
};

export const config = { schedule: '0 7 * * *' };
