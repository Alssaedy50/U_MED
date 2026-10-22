# UMED Known Issues & Constraints

## 1. Network Constraints (Yemen Infrastructure)
- **Issue**: Intermittent latency and 3G packet drops in certain provinces.
- **Mitigation in Design**: Progressive answer saving per question during exams; cached UI shell via Service Worker; explicit file size indicators to prevent unexpected data consumption.

## 2. Storage Uploads
- **Issue**: Firebase Storage direct upload requires active Firebase Storage bucket provisioning.
- **Mitigation in Release 1**: Educational resources use validated Google Drive / external viewer links and Firestore metadata first, with optional direct storage uploads when storage is provisioned.

## 3. Native Push Notifications
- **Issue**: Web push notifications on Android require active service worker registration and user permission.
- **Mitigation in Release 1**: Critical academic notices are embedded prominently on the Student Dashboard upon login.
