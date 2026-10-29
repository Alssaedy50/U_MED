/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared Role Badge & BiDi Label Helpers for UMED Platform
 */

import React from 'react';
import { UserRole } from '../types/umed.ts';

export function renderBiDiRoleLabel(role?: UserRole): React.ReactNode {
  switch (role) {
    case 'platform_owner':
      return (
        <>
          مالك المنصة العام <span dir="ltr" className="inline-block">(Platform Owner)</span>
        </>
      );
    case 'university_admin':
      return (
        <>
          مالك / مشرف الجامعة <span dir="ltr" className="inline-block">(University Owner)</span>
        </>
      );
    case 'batch_rep':
      return (
        <>
          مندوب الدفعة / المستوى <span dir="ltr" className="inline-block">(Batch Representative)</span>
        </>
      );
    case 'department_head':
      return (
        <>
          رئيس قسم أو مادة <span dir="ltr" className="inline-block">(Department / Subject Head)</span>
        </>
      );
    case 'student':
    default:
      return (
        <>
          طالب طب بشري <span dir="ltr" className="inline-block">(Student)</span>
        </>
      );
  }
}
