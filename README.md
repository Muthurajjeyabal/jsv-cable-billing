# JSV Cable Billing App - MVP v1.0

## Features included
- Login / Logout (Firebase Auth)
- Multi-user support
- Dashboard (Customers, Active, DC, Boxes, Collection)
- Customer List + Search + Filter
- Add / Edit Customer
- Billing / Collection entry
- WhatsApp quick message
- Mobile responsive + PWA ready

## How to run

### Option 1: Local (for testing)
1. Open the folder
2. Use any local server (Live Server in VS Code, or `npx serve`)
3. Open in browser

### Option 2: Firebase Hosting (Recommended)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Select existing project: jsvcable-billing
# Public directory: . (or the folder)
firebase deploy
```

## First time setup
1. Go to Firebase Console → Authentication → Users
2. Add a user manually (Email + Password) → This will be your Admin login
3. Or use the Settings page inside the app to create more users

## Next versions will add
- Full Box Management
- Advanced Reports
- Month Close
- Package & Place Masters
- Bulk DC / RC
- Better WhatsApp templates
