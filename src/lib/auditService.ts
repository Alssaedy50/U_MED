/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Cloud Audit Logging Service
 * Extracted from src/lib/firebase.ts for modular audit trail persistence and retrieval.
 */

import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db, cleanFirestoreData } from './firebase.ts';
import type { AuditLog } from '../types/umed.ts';

export async function writeAuditLogToCloud(params: {
  action: AuditLog['action'];
  performedBy: string;
  targetUid?: string;
  targetEmail?: string;
  universityId?: string;
  details: string | Record<string, any>;
}): Promise<AuditLog> {
  const log: AuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    action: params.action,
    performedBy: params.performedBy,
    targetUid: params.targetUid,
    targetEmail: params.targetEmail,
    universityId: params.universityId,
    details: params.details,
    timestamp: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'auditLogs', log.id), cleanFirestoreData(log));
  } catch (e) {}

  return log;
}

export async function fetchMergedAuditLogs(): Promise<AuditLog[]> {
  const logsMap: Record<string, AuditLog> = {};

  try {
    const snap = await getDocs(collection(db, 'auditLogs'));
    snap.forEach((d) => {
      const item = d.data() as AuditLog;
      if (item && item.id) logsMap[item.id] = item;
    });
  } catch (e) {}

  try {
    const res = await fetch('/api/admin/audit-logs');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.logs)) {
        data.logs.forEach((item: AuditLog) => {
          if (item && item.id) logsMap[item.id] = item;
        });
      }
    }
  } catch (e) {}

  return Object.values(logsMap).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
