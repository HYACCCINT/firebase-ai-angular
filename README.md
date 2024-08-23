Make It So
=============================

Make It So is a sample Todo app powered by Gemini AI, Firebase auth and firestore.

Introduction
------------

[Read more about Firebase](https://firebase.google.com/docs)
[Read more about Gemini](https://ai.google.dev/gemini-api/docs/quickstart?lang=node)

Setup and deploy in IDX
---------------


Setup and deploy locally
---------------

### Prerequisites

- Node.js version 20+
- npm version 10+
- Angular CLI 18+

### Setup Instructions

1. **Firebase setup:**
   - Create your project on the [Firebase Console](https://console.firebase.google.com).
   - Enable Firestore and anonymous authentication in the Firebase console.
   - Copy your Firebase config object ("Add Firebase to your web app"), and paste it into the `src/environments.ts` file.

2. **Gemini setup:**
   - Generate your Gemini API keys from [Google AI Gemini](https://ai.google.dev/gemini-api/docs/quickstart?lang=node).
   - Add your API keys to the `src/environments.ts` file.

3. **Install dependencies:**
   - Run `npm install` to install the app's dependencies.

### Running the App Locally

1. **Serve the App:**
   - Run `ng serve` to start the Angular development server.
   - Open your browser and navigate to `http://localhost:4200`.

### Deploying the App

1. **Firebase CLI init:**
   - Run `firebase init` and select **Hosting** and **Firestore**.
  
2. **Build and deploy:**
   - Run `firebase deploy` to deploy the app to Firebase Hosting.

Using the App
-------------
1. **Create a task:**
   - Select the "generate task" on the left to initiate the creation of a new task.
   - Gemini is used to suggest a task title, edit the title as you see fit.

2. **Generate subtasks:**
   - Based on your title and/or an uploaded image you can generate subtasks using Gemini AI.

3. **Save the task:**
   - Save to add the task to your dashboard.

Technology
----------

- **Angular**
- **Firebase**:
  - **Auth**
  - **Firestore**
- **Gemini**:
  - **Google AI**
  - **Vertex AI**

Docs
-------

- [Firebase Support](https://firebase.google.com/support)
- [Gemini AI Documentation](https://ai.google.dev/gemini-api/docs/quickstart?lang=node)
